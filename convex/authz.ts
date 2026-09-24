import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Group-scoped authorization. Authentication (who you are) is not
 * authorization (what you may touch): every group mutation must prove the
 * caller is a linked member of THAT group — knowing its publicId is not
 * enough, since links are shared freely.
 *
 * Membership = a `members` row in this group whose `userId` matches the
 * session. Member rows are linked at creation (creator), at invite time
 * (email matches an account), on claim, or via `members.join`.
 */
export async function requireGroupMember(ctx: MutationCtx, groupId: Id<"groups">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in to make changes. Guests can view only.");
  }
  // Groups are capped at 50 members — a full collect here is bounded.
  const members = await ctx.db
    .query("members")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  const member = members.find((m) => m.userId && String(m.userId) === String(userId)) ?? null;
  if (!member) {
    throw new Error("You are not a member of this group. Join it first to make changes.");
  }
  return { userId, member };
}

/**
 * Ownership check for owner-level controls (invite-code rotation).
 * Groups always record ownerUserId at creation; ownerless legacy groups
 * fall back to plain membership so the code never becomes un-rotatable.
 * Returns true when the caller proved ownership via ownerUserId.
 */
export async function requireGroupOwner(
  ctx: MutationCtx,
  group: { _id: Id<"groups">; ownerUserId?: Id<"users"> }
): Promise<{ userId: Id<"users">; owned: boolean }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in to make changes. Guests can view only.");
  }
  if (!group.ownerUserId) {
    await requireGroupMember(ctx, group._id);
    return { userId, owned: false };
  }
  if (String(group.ownerUserId) !== String(userId)) {
    throw new Error("Only the group owner can do this.");
  }
  return { userId, owned: true };
}
