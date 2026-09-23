import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Full database wipe for local/dev resets. INTERNAL ONLY — never exposed to
 * clients, runnable solely via `npx convex run` (deployment admin) or the
 * dashboard function runner.
 *
 *   Dev:  npx convex run wipe:wipeAll '{"confirm":"WIPE-EVERYTHING"}'
 *   Prod: npx convex run wipe:wipeAll '{"confirm":"WIPE-EVERYTHING"}' --prod
 *
 * The `confirm` arg is a deliberate footgun guard. Deleted in bounded
 * batches; returns per-table delete counts.
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

export const wipeAll = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "WIPE-EVERYTHING") {
      throw new Error('Refusing to wipe. Pass { confirm: "WIPE-EVERYTHING" } to proceed.');
    }
    const deleted: Record<string, number> = {};
    for (const table of TABLES) {
      let n = 0;
      for (;;) {
        const batch = await ctx.db.query(table).take(500);
        if (batch.length === 0) break;
        for (const doc of batch) await ctx.db.delete(doc._id);
        n += batch.length;
      }
      deleted[table] = n;
    }
    return deleted;
  },
});
