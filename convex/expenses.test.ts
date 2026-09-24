/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { allExpenses, seedGroup, seedUser } from "./testUtils";

const modules = import.meta.glob("./**/*.ts");
function fresh() {
  return convexTest(schema, modules);
}

async function setup() {
  const t = fresh();
  const { authed, userId } = await seedUser(t);
  const g = await seedGroup(authed);
  const addMember = (email: string, name?: string) =>
    authed.mutation(api.members.add, { publicId: g.publicId, email, ...(name ? { name } : {}) });
  const a = await addMember("a@x.co", "Ann");
  const b = await addMember("b@x.co", "Bo");
  const members = await authed.query(api.members.list, { publicId: g.publicId });
  const creator = members.find((m) => "userId" in m && String(m.userId) === String(userId))!;
  const ann = members.find((m) => m._id === a._id)!;
  const bo = members.find((m) => m._id === b._id)!;
  return { t, authed, g, creator, ann, bo };
}

type Split = { memberId: Id<"members">; amountCents: number };

const dinner = (over: {
  paidBy: Id<"members">;
  splits: Split[];
  description?: string;
  amountCents?: number;
  date?: string;
  category?: string;
  splitMode?: string;
  isSettlement?: boolean;
  clientId?: string;
}) => ({
  description: "Dinner",
  amountCents: 9000,
  date: "2026-09-20",
  category: "food",
  splitMode: "equal",
  isSettlement: false,
  ...over,
});

describe("expenses.add", () => {
  it("adds an expense with category and split mode", async () => {
    const { authed, t, g, creator, ann, bo } = await setup();
    const { _id } = await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      ...dinner({
        paidBy: creator._id,
        splits: [
          { memberId: creator._id, amountCents: 3000 },
          { memberId: ann._id, amountCents: 3000 },
          { memberId: bo._id, amountCents: 3000 },
        ],
      }),
    });
    const rows = await allExpenses(t, g.publicId);
    expect(rows.find((e) => e._id === _id)).toMatchObject({ category: "food", splitMode: "equal" });
  });

  it("dedupes retried offline adds by clientId", async () => {
    const { authed, t, g, creator } = await setup();
    const payload = {
      publicId: g.publicId,
      ...dinner({
        paidBy: creator._id,
        splits: [{ memberId: creator._id, amountCents: 9000 }],
        clientId: "op-1",
      }),
    };
    const first = await authed.mutation(api.expenses.add, payload);
    const second = await authed.mutation(api.expenses.add, payload);
    expect(second._id).toEqual(first._id);
    expect(await allExpenses(t, g.publicId)).toHaveLength(1);
  });

  it("validates amounts, dates, splits and membership", async () => {
    const { authed, g, creator, ann } = await setup();
    const base = dinner({ paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 9000 }] });
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, description: "  " }))
      .rejects.toThrow(/description/i);
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, amountCents: 0 }))
      .rejects.toThrow(/greater than 0/i);
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, date: "yesterday" }))
      .rejects.toThrow(/date/i);
    await expect(authed.mutation(api.expenses.add, {
      publicId: g.publicId, ...base,
      splits: [{ memberId: creator._id, amountCents: 1000 }],
    })).rejects.toThrow(/must equal/i);
    await expect(authed.mutation(api.expenses.add, {
      publicId: g.publicId, ...base, paidBy: ann._id,
      splits: [{ memberId: "ghost" as never, amountCents: 9000 }],
    })).rejects.toThrow();
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, category: "bogus" }))
      .rejects.toThrow(/category/i);
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, splitMode: "bogus" }))
      .rejects.toThrow(/split type/i);
  });

  it("enforces settlement shape", async () => {
    const { authed, g, creator, ann } = await setup();
    const settle = (splits: { memberId: never; amountCents: number }[], paidBy: never, amountCents = 5000) =>
      authed.mutation(api.expenses.add, {
        publicId: g.publicId,
        description: "Pay",
        amountCents,
        paidBy,
        splits,
        date: "2026-09-21",
        category: "other",
        splitMode: "equal",
        isSettlement: true,
      });
    await expect(settle(
      [{ memberId: ann._id as never, amountCents: 2500 }, { memberId: creator._id as never, amountCents: 2500 }],
      creator._id as never
    )).rejects.toThrow(/exactly one recipient/i);
    await expect(settle([{ memberId: creator._id as never, amountCents: 5000 }], creator._id as never))
      .rejects.toThrow(/must differ/i);
    await expect(settle([{ memberId: ann._id as never, amountCents: 1000 }], creator._id as never))
      .rejects.toThrow(/must equal payment/i);
    const ok = await settle([{ memberId: ann._id as never, amountCents: 5000 }], creator._id as never);
    expect(ok._id).toBeTruthy();
  });

  it("rejects guests", async () => {
    const t = fresh();
    const { userId } = await seedUser(t);
    // Seed rows directly so args pass validators and reach requireAuth.
    const ids = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        publicId: "x", name: "G", currency: "$", inviteCode: "ABCDEFGHIJ",
        createdByName: "X", createdAt: 1, ownerUserId: userId, ledgerRevision: 0,
      });
      const memberId = await ctx.db.insert("members", { groupId, name: "M", status: "active", createdAt: 1 });
      return { memberId };
    });
    await expect(t.mutation(api.expenses.add, {
      publicId: "x", description: "D", amountCents: 100, paidBy: ids.memberId,
      splits: [{ memberId: ids.memberId, amountCents: 100 }], date: "2026-09-20", category: "other", splitMode: "equal", isSettlement: false,
    })).rejects.toThrow(/sign in/i);
  });

  it("rejects unknown groups and out-of-range amounts", async () => {
    const { authed, g, creator } = await setup();
    const base = dinner({ paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 9000 }] });
    await expect(authed.mutation(api.expenses.add, { publicId: "missing", ...base }))
      .rejects.toThrow(/group not found/i);
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, amountCents: 100_000_001 }))
      .rejects.toThrow(/too large/i);
    await expect(authed.mutation(api.expenses.add, {
      publicId: g.publicId, ...base, splits: [{ memberId: creator._id, amountCents: -5 }],
    })).rejects.toThrow(/invalid split/i);
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, splits: [] }))
      .rejects.toThrow(/at least one person/i);
  });

  it("rejects expenses referencing members outside the group", async () => {
    const { authed, t, g, creator, ann } = await setup();
    const other = await seedGroup(authed, { name: "Other" });
    const [outsider] = await t.query(api.members.list, { publicId: other.publicId });
    const base = dinner({ paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 9000 }] });
    await expect(authed.mutation(api.expenses.add, { publicId: g.publicId, ...base, paidBy: outsider._id }))
      .rejects.toThrow(/not a member/i);
    await expect(authed.mutation(api.expenses.add, {
      publicId: g.publicId, ...base, splits: [{ memberId: outsider._id, amountCents: 9000 }],
    })).rejects.toThrow(/not in this group/i);
    await expect(authed.mutation(api.expenses.update, {
      publicId: g.publicId,
      expenseId: (await authed.mutation(api.expenses.add, { publicId: g.publicId, ...base }))._id,
      description: "X", amountCents: 9000, paidBy: outsider._id,
      splits: [{ memberId: ann._id, amountCents: 9000 }], date: "2026-09-20",
      category: "other",
      splitMode: "equal",
    })).rejects.toThrow(/not a member/i);
    await expect(authed.mutation(api.expenses.update, {
      publicId: g.publicId,
      expenseId: (await authed.mutation(api.expenses.add, { publicId: g.publicId, ...base }))._id,
      description: "X", amountCents: 9000, paidBy: creator._id,
      splits: [{ memberId: outsider._id, amountCents: 9000 }], date: "2026-09-20",
      category: "other",
      splitMode: "equal",
    })).rejects.toThrow(/not in this group/i);
  });
});

describe("expenses.list / activity", () => {
  it("returns newest first and empty for unknown groups", async () => {
    const { authed, t, g, creator } = await setup();
    await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      ...dinner({ paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 9000 }] }),
    });
    const rows = await allExpenses(t, g.publicId);
    expect(rows).toHaveLength(1);
    expect(await allExpenses(t, "nope")).toEqual([]);
    const feed = await t.query(api.expenses.activity, { publicId: g.publicId });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].text).toMatch(/Dinner/);
    expect(await t.query(api.expenses.activity, { publicId: "nope" })).toEqual([]);
  });
});

describe("expenses.update", () => {
  it("edits description, category and split mode", async () => {
    const { authed, t, g, creator, ann } = await setup();
    const { _id } = await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      ...dinner({
        paidBy: creator._id,
        splits: [
          { memberId: creator._id, amountCents: 4500 },
          { memberId: ann._id, amountCents: 4500 },
        ],
      }),
    });
    await authed.mutation(api.expenses.update, {
      publicId: g.publicId,
      expenseId: _id,
      description: "Fancy dinner",
      amountCents: 10000,
      paidBy: creator._id,
      splits: [
        { memberId: creator._id, amountCents: 5000 },
        { memberId: ann._id, amountCents: 5000 },
      ],
      date: "2026-09-22",
      category: "travel",
      splitMode: "exact",
    });
    const rows = await allExpenses(t, g.publicId);
    expect(rows.find((e) => e._id === _id)).toMatchObject({
      description: "Fancy dinner",
      amountCents: 10000,
      category: "travel",
      splitMode: "exact",
    });
  });

  it("refuses to edit settlements or missing expenses", async () => {
    const { authed, g, creator, ann } = await setup();
    const { _id } = await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      description: "Pay",
      amountCents: 1000,
      paidBy: creator._id,
      splits: [{ memberId: ann._id, amountCents: 1000 }],
      date: "2026-09-21",
      category: "other",
      splitMode: "equal",
      isSettlement: true,
    });
    await expect(authed.mutation(api.expenses.update, {
      publicId: g.publicId, expenseId: _id, description: "X", amountCents: 1000,
      paidBy: creator._id, splits: [{ memberId: ann._id, amountCents: 1000 }], date: "2026-09-21",
      category: "other",
      splitMode: "equal",
    })).rejects.toThrow(/settlements cannot be edited/i);
  });

  it("rejects expenses from another group", async () => {
    const { authed, g, creator } = await setup();
    const other = await seedGroup(authed, { name: "Other" });
    const [outsider] = await authed.query(api.members.list, { publicId: other.publicId });
    const { _id } = await authed.mutation(api.expenses.add, {
      publicId: other.publicId,
      description: "Elsewhere",
      amountCents: 1000,
      paidBy: outsider._id,
      splits: [{ memberId: outsider._id, amountCents: 1000 }],
      date: "2026-09-21",
      category: "other",
      splitMode: "equal",
      isSettlement: false,
    });
    await expect(authed.mutation(api.expenses.update, {
      publicId: g.publicId, expenseId: _id, description: "X", amountCents: 1000,
      paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 1000 }], date: "2026-09-21",
      category: "other",
      splitMode: "equal",
    })).rejects.toThrow(/expense not found/i);
  });
});

describe("expenses.remove", () => {
  it("deletes and logs activity", async () => {
    const { authed, t, g, creator } = await setup();
    const { _id } = await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      ...dinner({ paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 9000 }] }),
    });
    await authed.mutation(api.expenses.remove, { publicId: g.publicId, expenseId: _id });
    expect(await allExpenses(t, g.publicId)).toHaveLength(0);
    const feed = await t.query(api.expenses.activity, { publicId: g.publicId });
    expect(feed.some((a) => a.type === "expense_deleted")).toBe(true);
  });

  it("rejects missing expenses", async () => {
    const { authed, g, creator } = await setup();
    const { _id } = await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      ...dinner({ paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 9000 }] }),
    });
    await authed.mutation(api.expenses.remove, { publicId: g.publicId, expenseId: _id });
    await expect(authed.mutation(api.expenses.remove, { publicId: g.publicId, expenseId: _id }))
      .rejects.toThrow(/not found/i);
  });
});
