// Replays queued offline ops in FIFO order.
// Dedup keys (clientId) make retries safe: a retried add returns the original
// expense instead of inserting a duplicate.

import { api } from "../../convex/_generated/api";
import { dropOp, getOutbox, markOp, opBelongsTo, opsForGroup } from "./offline";

function friendly(e) {
  const m = String(e?.message || e?.data || e || "Sync failed");
  return m.replace(/^Uncaught Error:\s*/, "").slice(0, 200);
}

export async function syncOutbox(client, publicId, { includeFailed = false, userId } = {}) {
  // Identity boundary: only replay ops stamped for this session. Anything
  // else stays queued for its owner — never replayed under another account.
  const ops = opsForGroup(publicId, { includeFailed })
    .filter((o) => o.status !== "syncing" && opBelongsTo(o, userId));
  const tempToReal = new Map();
  let synced = 0;
  for (const op of ops) {
    markOp(op.opId, { status: "syncing", error: "" });
    try {
      if (op.kind === "add") {
        const res = await client.mutation(api.expenses.add, {
          publicId,
          description: op.entry.description,
          amountCents: op.entry.amountCents,
          paidBy: op.entry.paidBy,
          splits: op.entry.splits,
          date: op.entry.date,
          category: op.entry.category ?? "other",
          splitMode: op.entry.splitMode ?? "equal",
          isSettlement: !!op.entry.isSettlement,
          clientId: op.clientId,
        });
        if (res?._id) tempToReal.set(op.tempId, String(res._id));
      } else if (op.kind === "update") {
        const realId = tempToReal.get(String(op.expenseId)) ?? op.expenseId;
        if (String(realId).startsWith("tmp-")) {
          throw new Error("Still waiting on its queued add — will retry together.");
        }
        await client.mutation(api.expenses.update, {
          publicId,
          expenseId: realId,
          description: op.patch.description,
          amountCents: op.patch.amountCents,
          paidBy: op.patch.paidBy,
          splits: op.patch.splits,
          date: op.patch.date,
          category: op.patch.category ?? "other",
          splitMode: op.patch.splitMode ?? "equal",
        });
      } else {
        const realId = tempToReal.get(String(op.expenseId)) ?? op.expenseId;
        if (String(realId).startsWith("tmp-")) {
          throw new Error("Still waiting on its queued add — will retry together.");
        }
        await client.mutation(api.expenses.remove, {
          publicId,
          expenseId: realId,
        });
      }
      dropOp(op.opId);
      synced++;
    } catch (e) {
      markOp(op.opId, { status: "failed", error: friendly(e) });
    }
  }
  return { synced, total: ops.length };
}

/**
 * Flush every pending op owned by this session, across groups — used by the
 * sign-out flow so an account never leaves unsynced writes behind silently.
 */
export async function syncAllUserOps(client, userId) {
  const groups = [
    ...new Set(
      getOutbox()
        .filter((o) => o.status === "pending" && opBelongsTo(o, userId))
        .map((o) => o.groupPublicId)
    ),
  ];
  let synced = 0;
  let total = 0;
  for (const groupPublicId of groups) {
    const r = await syncOutbox(client, groupPublicId, { userId });
    synced += r.synced;
    total += r.total;
  }
  return { synced, total };
}
