import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAllUserOps, syncOutbox } from "./sync";
import { dropOp, enqueueAdd, enqueueRemove, enqueueUpdate, getOutbox } from "./offline";

const G = "group-9";
const entry = {
  description: "Dinner",
  amountCents: 1000,
  paidBy: "m1",
  splits: [{ memberId: "m1", amountCents: 1000 }],
  date: "2026-09-20",
  category: "food",
  splitMode: "equal",
  isSettlement: false,
};

function reset() {
  localStorage.clear();
  for (const op of getOutbox()) dropOp(op.opId);
}

beforeEach(reset);

function client(impl = {}) {
  return {
    mutation: vi.fn(async (fn, args) => {
      void fn;
      if (args.expenseId === "missing") throw new Error("Expense not found.");
      return { _id: "real-1" };
    }),
    ...impl,
  };
}

describe("syncOutbox", () => {
  it("replays adds and drops them on success", async () => {
    enqueueAdd(G, entry, "u1");
    const c = client();
    const res = await syncOutbox(c, G, { userId: "u1" });
    expect(res).toEqual({ synced: 1, total: 1 });
    expect(c.mutation).toHaveBeenCalledTimes(1);
    expect(getOutbox()).toHaveLength(0);
  });

  it("merges an update queued behind its own add into one synced op", async () => {
    const tempId = enqueueAdd(G, entry, "u1");
    enqueueUpdate(G, tempId, { ...entry, description: "Edited" }, "u1");
    const c = client();
    const res = await syncOutbox(c, G, { userId: "u1" });
    expect(res).toEqual({ synced: 1, total: 1 });
    expect(c.mutation.mock.calls[0][1].description).toBe("Edited");
    expect(getOutbox()).toHaveLength(0);
  });

  it("marks failing ops as failed with a trimmed message", async () => {
    enqueueUpdate(G, "missing", entry, "u1");
    const res = await syncOutbox(client(), G, { userId: "u1" });
    expect(res).toEqual({ synced: 0, total: 1 });
    const [op] = getOutbox();
    expect(op.status).toBe("failed");
    expect(op.error).toBe("Expense not found.");
  });

  it("holds a remove that points at an unknown temp id for retry", async () => {
    enqueueAdd(G, entry, "u1");
    enqueueRemove(G, "tmp-orphan", "u1");
    const res = await syncOutbox(client(), G, { userId: "u1" });
    expect(res).toEqual({ synced: 1, total: 2 });
    const [leftover] = getOutbox();
    expect(leftover.kind).toBe("remove");
    expect(leftover.status).toBe("failed");
    expect(leftover.error).toMatch(/waiting on its queued add/);
  });

  it("does nothing when the queue is empty", async () => {
    const c = client();
    expect(await syncOutbox(c, G, { userId: "u1" })).toEqual({ synced: 0, total: 0 });
    expect(c.mutation).not.toHaveBeenCalled();
  });

  it("replays updates and removes", async () => {
    enqueueUpdate(G, "e1", { ...entry, description: "Edited" }, "u1");
    enqueueRemove(G, "e2", "u1");
    const c = client();
    const res = await syncOutbox(c, G, { userId: "u1" });
    expect(res).toEqual({ synced: 2, total: 2 });
    expect(getOutbox()).toHaveLength(0);
  });

  it("never replays another account's ops", async () => {
    enqueueAdd(G, entry, "u1");
    enqueueAdd(G, entry, "u2");
    const c = client();
    const res = await syncOutbox(c, G, { userId: "u1" });
    expect(res).toEqual({ synced: 1, total: 1 });
    expect(c.mutation).toHaveBeenCalledTimes(1);
    expect(getOutbox()).toHaveLength(1);
    // The other session picks up exactly its own op later.
    const res2 = await syncOutbox(c, G, { userId: "u2" });
    expect(res2).toEqual({ synced: 1, total: 1 });
    expect(getOutbox()).toHaveLength(0);
  });

  it("flushes one account across groups", async () => {
    enqueueAdd(G, entry, "u1");
    enqueueAdd("other-group", entry, "u1");
    enqueueAdd(G, entry, "u2");
    const c = client();
    const res = await syncAllUserOps(c, "u1");
    expect(res).toEqual({ synced: 2, total: 2 });
    expect(c.mutation).toHaveBeenCalledTimes(2);
    expect(getOutbox()).toHaveLength(1);
  });
});
