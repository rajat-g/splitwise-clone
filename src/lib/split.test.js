import { describe, expect, it } from "vitest";
import {
  buildSplits,
  computeBalances,
  expenseToForm,
  fmt,
  formatInviteCode,
  fromCents,
  normalizeInviteCode,
  simplifyDebts,
  splitsMapToArray,
  splitTypeLabel,
  toCents,
} from "./split";

const m = (id) => ({ _id: id, name: id });

describe("toCents / fromCents", () => {
  it("converts dollars to integer cents", () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents("4.55")).toBe(455);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it("treats junk as zero", () => {
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents(NaN)).toBe(0);
  });
  it("converts cents back to dollars", () => {
    expect(fromCents(455)).toBe(4.55);
    expect(fromCents(0)).toBe(0);
    expect(fromCents(undefined)).toBe(0);
  });
});

describe("fmt", () => {
  it("formats with currency and two decimals", () => {
    expect(fmt(10, "$")).toBe("$10.00");
    expect(fmt(4.555, "€")).toBe("€4.55");
  });
  it("pulls the sign in front of the currency", () => {
    expect(fmt(-3.5, "$")).toBe("-$3.50");
  });
  it("defaults currency and coerces bad input", () => {
    expect(fmt(5)).toBe("$5.00");
    expect(fmt(NaN, "$")).toBe("$0.00");
  });
});

describe("computeBalances", () => {
  it("computes paid-minus-share per member", () => {
    const members = [m("a"), m("b")];
    const expenses = [
      { paidBy: "a", amountCents: 10000, isSettlement: false,
        splits: [{ memberId: "a", amountCents: 5000 }, { memberId: "b", amountCents: 5000 }] },
    ];
    expect(computeBalances(members, expenses)).toEqual({ a: 50, b: -50 });
  });
  it("handles legacy float-amount expenses", () => {
    const members = [m("a"), m("b")];
    const expenses = [
      { paidBy: "a", amount: 100, isSettlement: false,
        splits: { a: 50, b: 50 } },
    ];
    expect(computeBalances(members, expenses)).toEqual({ a: 50, b: -50 });
  });
  it("applies settlements payer-positive, receiver-negative", () => {
    const members = [m("a"), m("b")];
    const expenses = [
      { paidBy: "a", amountCents: 2000, isSettlement: true,
        splits: [{ memberId: "b", amountCents: 2000 }] },
    ];
    expect(computeBalances(members, expenses)).toEqual({ a: 20, b: -20 });
  });
  it("tolerates settlements and expenses with missing splits", () => {
    const members = [m("a"), m("b")];
    expect(computeBalances(members, [
      { paidBy: "a", amountCents: 1000, isSettlement: true, splits: [] },
    ])).toEqual({ a: 10, b: 0 });
    expect(computeBalances(members, [
      { paidBy: "a", amountCents: 1000, isSettlement: false },
    ])).toEqual({ a: 10, b: 0 });
    expect(computeBalances([{ id: "x", name: "X" }], [
      { paidBy: "x", amountCents: 1000, isSettlement: false, splits: [{ memberId: "x", amountCents: 1000 }] },
    ])).toEqual({ x: 0 });
  });
  it("ignores references to unknown members", () => {
    const members = [m("a")];
    const expenses = [
      { paidBy: "zzz", amountCents: 1000, isSettlement: false,
        splits: [{ memberId: "zzz", amountCents: 1000 }] },
    ];
    expect(computeBalances(members, expenses)).toEqual({ a: 0 });
  });
  it("returns zeros with no expenses", () => {
    expect(computeBalances([m("a"), m("b")], [])).toEqual({ a: 0, b: 0 });
  });
});

describe("simplifyDebts", () => {
  it("chains Anna -> Bob -> Charlie into one payment", () => {
    expect(simplifyDebts({ anna: -20, bob: 0, charlie: 20 })).toEqual([
      { from: "anna", to: "charlie", amount: 20 },
    ]);
  });
  it("returns nothing when settled", () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
    expect(simplifyDebts({})).toEqual([]);
  });
  it("treats dust under half a cent as settled", () => {
    expect(simplifyDebts({ a: -0.004, b: 0.004 })).toEqual([]);
  });
  it("splits one debtor across creditors", () => {
    expect(simplifyDebts({ a: -50, b: 30, c: 20 })).toEqual([
      { from: "a", to: "b", amount: 30 },
      { from: "a", to: "c", amount: 20 },
    ]);
  });
  it("preserves every member's net total", () => {
    const balances = { a: -33.33, b: -16.67, c: 40, d: 10 };
    const plan = simplifyDebts(balances);
    const net = Object.fromEntries(Object.keys(balances).map((k) => [k, 0]));
    for (const t of plan) {
      net[t.from] += t.amount;
      net[t.to] -= t.amount;
    }
    for (const k of Object.keys(balances)) {
      expect(net[k]).toBeCloseTo(-balances[k], 2);
    }
  });
});

describe("buildSplits", () => {
  const ids = ["a", "b", "c"];
  it("splits equally with remainder on the first member", () => {
    const { splits } = buildSplits({ amount: 100, memberIds: ids, mode: "equal" });
    expect(splits.a + splits.b + splits.c).toBeCloseTo(100, 2);
    expect(splits.a).toBeGreaterThanOrEqual(splits.b);
    expect(splits.b).toBeCloseTo(splits.c, 2);
  });
  it("rejects zero amounts and empty groups", () => {
    expect(buildSplits({ amount: 0, memberIds: ids, mode: "equal" }).error).toMatch(/greater than 0/);
    expect(buildSplits({ amount: 10, memberIds: [], mode: "equal" }).error).toMatch(/at least one person/);
  });
  it("validates exact splits sum to the total", () => {
    const ok = buildSplits({ amount: 10, memberIds: ["a", "b"], mode: "exact", values: { a: "6", b: "4" } });
    expect(ok).toEqual({ splits: { a: 6, b: 4 } });
    expect(buildSplits({ amount: 10, memberIds: ["a", "b"], mode: "exact", values: { a: "6", b: "3" } }).error)
      .toMatch(/must equal/);
    expect(buildSplits({ amount: 10, memberIds: ["a", "b"], mode: "exact", values: { a: "6" } }).error)
      .toMatch(/must equal/);
  });
  it("validates percentages sum to 100", () => {
    const ok = buildSplits({ amount: 200, memberIds: ["a", "b"], mode: "percent", values: { a: "25", b: "75" } });
    expect(ok.splits).toEqual({ a: 50, b: 150 });
    expect(buildSplits({ amount: 200, memberIds: ["a", "b"], mode: "percent", values: { a: "25", b: "25" } }).error)
      .toMatch(/100%/);
    expect(buildSplits({ amount: 200, memberIds: ["a", "b"], mode: "percent", values: { a: "100" } }).error)
      .toBeUndefined();
  });
  it("splits by shares proportionally with rounding on the last member", () => {
    const { splits } = buildSplits({ amount: 100, memberIds: ["a", "b"], mode: "shares", values: { a: "1", b: "3" } });
    expect(splits.a + splits.b).toBeCloseTo(100, 2);
    expect(splits.b).toBeGreaterThan(splits.a);
    expect(buildSplits({ amount: 100, memberIds: ids, mode: "shares", values: {} }).error)
      .toMatch(/share/);
    const three = buildSplits({ amount: 100, memberIds: ids, mode: "shares", values: { a: "1", b: "1", c: "1" } });
    expect(Object.values(three.splits).reduce((x, y) => x + y, 0)).toBeCloseTo(100, 2);
  });
});

describe("splitsMapToArray / expenseToForm", () => {
  it("maps a splits object to cent rows", () => {
    expect(splitsMapToArray({ a: 6, b: 4 })).toEqual([
      { memberId: "a", amountCents: 600 },
      { memberId: "b", amountCents: 400 },
    ]);
    expect(splitsMapToArray(undefined)).toEqual([]);
  });
  it("normalizes an expense back to form state", () => {
    const e = {
      description: "Dinner", amountCents: 1000, paidBy: "a",
      splits: [{ memberId: "a", amountCents: 500 }, { memberId: "b", amountCents: 500 }],
    };
    expect(expenseToForm(e)).toMatchObject({
      description: "Dinner", amount: 10, splits: { a: 5, b: 5 },
    });
    expect(expenseToForm(null)).toBeNull();
  });
});

describe("invite codes", () => {
  it("formats 4-4-2 with dashes", () => {
    expect(formatInviteCode("KX7Q9M2PAB")).toBe("KX7Q-9M2P-AB");
    expect(formatInviteCode("")).toBe("--");
  });
  it("normalizes codes to uppercase alphanumerics", () => {
    expect(normalizeInviteCode("kx7q-9m2p-ab")).toBe("KX7Q9M2PAB");
    expect(normalizeInviteCode("  ab 12 ")).toBe("AB12");
    expect(normalizeInviteCode(undefined)).toBe("");
  });
});

describe("splitTypeLabel", () => {
  it("labels stored split modes", () => {
    expect(splitTypeLabel({ splitMode: "exact", splits: [] })).toBe("Exact");
    expect(splitTypeLabel({ splitMode: "percent", splits: [] })).toBe("%");
    expect(splitTypeLabel({ splitMode: "shares", splits: [] })).toBe("Shares");
    expect(splitTypeLabel({ splitMode: "EQUAL", splits: [] })).toBe("Equal");
  });
  it("infers Equal for even or single splits", () => {
    expect(splitTypeLabel({ splits: [{ amountCents: 500 }, { amountCents: 500 }] })).toBe("Equal");
    expect(splitTypeLabel({ splits: [{ amountCents: 500 }] })).toBe("Equal");
    expect(splitTypeLabel({})).toBe("Equal");
  });
  it("infers Custom for uneven splits", () => {
    expect(splitTypeLabel({ splits: [{ amountCents: 600 }, { amountCents: 400 }] })).toBe("Custom");
  });
});
