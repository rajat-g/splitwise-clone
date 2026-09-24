import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Full database wipe for local/dev resets. INTERNAL ONLY — never exposed to
 * clients, runnable solely via `npx convex run` (deployment admin) or the
 * dashboard function runner. The explicit confirmation string is required.
 * Deletion runs as a chain of small transactions so large deployments do not
 * exceed Convex's per-mutation read/write limits.
 */

// App data first, then auth (sessions/accounts reference users).
const TABLES = [
  "expenses",
  "activity",
  "members",
  "groups",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
  "authSessions",
  "authAccounts",
  "authRateLimits",
  "users",
] as const;

const BATCH_SIZE = 100;

export const wipeAll = internalMutation({
  args: { confirm: v.string() },
  returns: v.object({ jobId: v.id("wipeJobs") }),
  handler: async (ctx, args) => {
    if (args.confirm !== "WIPE-EVERYTHING") {
      throw new Error('Refusing to wipe. Pass { confirm: "WIPE-EVERYTHING" } to proceed.');
    }
    // Keep only a small history of completed jobs. A stale scheduled worker
    // safely exits when its job document no longer exists.
    const oldJobs = await ctx.db.query("wipeJobs").take(100);
    for (const job of oldJobs) await ctx.db.delete(job._id);
    const jobId = await ctx.db.insert("wipeJobs", {
      requestedAt: Date.now(), status: "running", tableIndex: 0, deleted: {},
    });
    await ctx.scheduler.runAfter(0, internal.wipe.continueWipe, { jobId });
    return { jobId };
  },
});

export const continueWipe = internalMutation({
  args: { jobId: v.id("wipeJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") return null;
    let tableIndex = job.tableIndex;
    const deleted = { ...job.deleted };

    while (tableIndex < TABLES.length) {
      const table = TABLES[tableIndex];
      const batch = await ctx.db.query(table).take(BATCH_SIZE);
      if (batch.length > 0) {
        for (const doc of batch) await ctx.db.delete(doc._id);
        deleted[table] = (deleted[table] ?? 0) + batch.length;
        await ctx.db.patch(args.jobId, { deleted });
        await ctx.scheduler.runAfter(0, internal.wipe.continueWipe, { jobId: args.jobId });
        return null;
      }
      tableIndex++;
    }

    await ctx.db.patch(args.jobId, {
      status: "complete", tableIndex, deleted,
    });
    return null;
  },
});

export const status = internalQuery({
  args: { jobId: v.id("wipeJobs") },
  returns: v.union(
    v.null(),
    v.object({ status: v.union(v.literal("running"), v.literal("complete")), deleted: v.record(v.string(), v.number()) })
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    return job ? { status: job.status, deleted: job.deleted } : null;
  },
});
