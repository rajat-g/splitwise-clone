import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  applyOutboxToExpenses,
  countPendingOps,
  dropOp,
  enqueueAdd,
  enqueueRemove,
  enqueueUpdate,
  filterGroupOps,
  getOutbox,
  isTempId,
  loadSnapshot,
  markOp,
  myPendingOps,
  newOpId,
  newTempId,
  opBelongsTo,
  opsForGroup,
  pendingCountForGroup,
  retryOp,
  saveSnapshot,
  subscribeOutbox,
  useOutbox,
} from "./offline";

const G = "group-1";

function reset() {
  localStorage.clear();
  for (const op of getOutbox()) dropOp(op.opId);
}

beforeEach(reset);

const addEntry = (over = {}) => ({
  description: "Dinner",
  amountCents: 1000,
  paidBy: "m1",
  splits: [{ memberId: "m1", amountCents: 500 }, { memberId: "m2", amountCents: 500 }],
  date: "2026-09-20",
  isSettlement: false,
  ...over,
});

describe("ids", () => {
  it("generates unique op and temp ids", () => {
    expect(newOpId()).not.toBe(newOpId());
    expect(newTempId()).not.toBe(newTempId());
    expect(isTempId(newTempId())).toBe(true);
    expect(isTempId("abc")).toBe(false);
    expect(isTempId("")).toBe(false);
  });

  it("falls back without crypto.randomUUID", () => {
    const cryptoRef = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      expect(newOpId()).toMatch(/^id-/);
      expect(newTempId()).toMatch(/^tmp-id-/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: cryptoRef, configurable: true });
    }
  });

  it("starts empty on corrupt storage", async () => {
    localStorage.setItem("fairsplit:outbox:v1", "{broken");
    vi.resetModules();
    try {
      const fresh = await import("./offline");
      expect(fresh.getOutbox()).toEqual([]);
    } finally {
      vi.resetModules();
    }
  });
});

describe("enqueue / filter", () => {
  it("queues adds scoped to a group", () => {
    enqueueAdd(G, addEntry(), "u1");
    enqueueAdd("other", addEntry(), "u1");
    expect(opsForGroup(G)).toHaveLength(1);
    expect(pendingCountForGroup(G, "u1")).toBe(1);
    expect(countPendingOps(getOutbox(), G, "u1")).toBe(1);
    expect(filterGroupOps(getOutbox(), G, { includeFailed: false })).toHaveLength(1);
  });

  it("merges an update into a not-yet-synced add", () => {
    const tempId = enqueueAdd(G, addEntry(), "u1");
    enqueueUpdate(G, tempId, { ...addEntry(), description: "Edited" }, "u1");
    const ops = opsForGroup(G);
    expect(ops).toHaveLength(1);
    expect(ops[0].entry.description).toBe("Edited");
    expect(ops[0].entry.isSettlement).toBe(false);
  });

  it("queues an update for a server expense", () => {
    enqueueUpdate(G, "exp-9", addEntry({ description: "Patch" }), "u1");
    const ops = opsForGroup(G);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("update");
    enqueueUpdate(G, "exp-9", addEntry({ description: "Patch2" }), "u1");
    expect(opsForGroup(G)).toHaveLength(1);
    expect(opsForGroup(G)[0].patch.description).toBe("Patch2");
  });

  it("drops a queued add on remove instead of queueing a remove", () => {
    const tempId = enqueueAdd(G, addEntry(), "u1");
    expect(enqueueRemove(G, tempId, "u1")).toBe("dropped");
    expect(opsForGroup(G)).toHaveLength(0);
  });

  it("queues a remove for a server expense and clears its pending update", () => {
    enqueueUpdate(G, "exp-9", addEntry(), "u1");
    expect(enqueueRemove(G, "exp-9", "u1")).toBe("queued");
    const ops = opsForGroup(G);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("remove");
    expect(enqueueRemove(G, "exp-9", "u1")).toBe("queued");
    expect(opsForGroup(G)).toHaveLength(1);
  });

  it("markOp / retryOp / dropOp manage lifecycle", () => {
    const tempId = enqueueAdd(G, addEntry(), "u1");
    const [op] = getOutbox();
    markOp(op.opId, { status: "failed", error: "boom" });
    expect(pendingCountForGroup(G, "u1")).toBe(0);
    expect(opsForGroup(G)).toHaveLength(1);
    expect(opsForGroup(G, { includeFailed: false })).toHaveLength(0);
    retryOp(op.opId);
    expect(pendingCountForGroup(G, "u1")).toBe(1);
    dropOp(op.opId);
    expect(getOutbox()).toHaveLength(0);
    expect(tempId.startsWith("tmp-")).toBe(true);
  });

  it("notifies subscribers and exposes a hook", () => {
    const fn = vi.fn();
    const unsub = subscribeOutbox(fn);
    enqueueAdd(G, addEntry(), "u1");
    expect(fn).toHaveBeenCalled();
    unsub();
    const { result } = renderHook(() => useOutbox());
    expect(result.current).toHaveLength(1);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("fairsplit:outbox:v1", "{broken");
    const { result } = renderHook(() => useOutbox());
    expect(result.current).toEqual([]);
  });
});

describe("applyOutboxToExpenses", () => {
  const base = [
    { _id: "e1", description: "A", amountCents: 100, createdAt: 3 },
    { _id: "e2", description: "B", amountCents: 200, createdAt: 2 },
  ];
  it("layers adds, updates and removes over server rows", () => {
    const t = enqueueAdd(G, { ...addEntry(), createdAt: 5 }, "u1");
    void t;
    const ops = getOutbox();
    const rows = applyOutboxToExpenses(base, ops);
    expect(rows.map((r) => r._id)).toContain("e1");
    expect(rows.some((r) => r._queued && String(r._id).startsWith("tmp-"))).toBe(true);
    expect(rows[0].createdAt).toBeGreaterThanOrEqual(rows[1].createdAt);
  });
  it("applies updates and hides removed rows", () => {
    enqueueUpdate(G, "e1", { description: "A2" }, "u1");
    enqueueRemove(G, "e2", "u1");
    const rows = applyOutboxToExpenses(base, getOutbox());
    expect(rows.find((r) => r._id === "e2")).toBeUndefined();
    const e1 = rows.find((r) => r._id === "e1");
    expect(e1.description).toBe("A2");
    expect(e1._queued).toBe(true);
  });
});

describe("snapshots", () => {  it("round-trips group data and caps sizes", () => {
    const expenses = Array.from({ length: 400 }, (_, i) => ({ _id: `e${i}` }));
    const activity = Array.from({ length: 150 }, (_, i) => ({ _id: `a${i}` }));
    saveSnapshot(G, { group: { name: "Goa" }, members: [{ _id: "m1" }], expenses, activity });
    const snap = loadSnapshot(G);
    expect(snap.group.name).toBe("Goa");
    expect(snap.expenses).toHaveLength(300);
    expect(snap.activity).toHaveLength(100);
    expect(snap.savedAt).toEqual(expect.any(Number));
  });
  it("returns null when missing or corrupt", () => {
    expect(loadSnapshot("nope")).toBeNull();
    localStorage.setItem("fairsplit:snap:v2:x", "{broken");
    expect(loadSnapshot("x")).toBeNull();
  });
});

describe("identity boundary", () => {
  it("stamps the owning account on enqueue", () => {
    enqueueAdd(G, addEntry(), "u1");
    enqueueUpdate(G, "e9", addEntry(), "u1");
    enqueueRemove(G, "e8", "u1");
    for (const op of getOutbox()) expect(op.userId).toBe("u1");
    expect(() => enqueueAdd(G, addEntry())).toThrow(/sign in/i);
  });

  it("routes ops by stamp, orphaning unstamped ones", () => {
    expect(opBelongsTo({ userId: "u1" }, "u1")).toBe(true);
    expect(opBelongsTo({ userId: "u1" }, "u2")).toBe(false);
    expect(opBelongsTo({ userId: "u1" }, null)).toBe(false);
    expect(opBelongsTo({}, "u1")).toBe(false);
    expect(opBelongsTo({}, null)).toBe(false);
    expect(opBelongsTo(null, "u1")).toBe(false);
  });

  it("counts and lists only my pending ops", () => {
    enqueueAdd(G, addEntry(), "u1");
    enqueueAdd(G, addEntry(), "u2");
    enqueueAdd(G, addEntry(), "u1");
    const ops = getOutbox();
    expect(countPendingOps(ops, G, "u1")).toBe(1);
    expect(countPendingOps(ops, G, "u2")).toBe(1);
    expect(countPendingOps(ops, G, null)).toBe(0);
    expect(countPendingOps(ops, G)).toBe(0);
    expect(myPendingOps(ops, G, "u1")).toHaveLength(1);
    expect(pendingCountForGroup(G, "u1")).toBe(1);
    expect(pendingCountForGroup(G)).toBe(0); // unknown session replays nothing stamped
  });

});
