import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// Single source of truth for "who did this". Every write mutation already
// requires auth, so attribution is derived from the session — never from a
// client-supplied name (those are spoofable). Display names shown to friends
// are group members; this name is only the activity-feed author.
export async function resolveActorName(ctx: MutationCtx): Promise<string> {
  try {
    const userId = await getAuthUserId(ctx);
    if (!userId) return "Someone";
    const user = await ctx.db.get(userId);
    const name = user?.name;
    if (typeof name === "string" && name.trim()) return name.trim().slice(0, 30);
    const email = user?.email;
    if (typeof email === "string" && email.includes("@")) {
      return email.split("@")[0].slice(0, 30) || "Someone";
    }
  } catch {
    // fall through to default
  }
  return "Someone";
}

/**
 * Mailbox proof for email-based linking. Set when the account verifies its
 * address via OTP; unverified accounts fail
 * this check, so group invites can never attach to an unproven address.
 */
export function userEmailVerified(user: Doc<"users"> | null): boolean {
  return !!user && typeof user.emailVerificationTime === "number";
}
