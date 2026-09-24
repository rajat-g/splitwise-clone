import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Authentication: proves a session exists. All group mutations start here;
 * authorization (membership/ownership) is checked separately below.
 */
export async function requireAuth(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in to make changes. Guests can view only.");
  }
  return userId;
}

/**
 * Loads a group by its unguessable public id. Unknown ids fail identically
 * for guests and members (the secret itself is the privacy boundary).
 */
export async function groupByPublicId(ctx: MutationCtx, publicId: string): Promise<Doc<"groups">> {
  const g = await ctx.db
    .query("groups")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .first();
  if (!g) throw new Error("Group not found. Check your invite link.");
  return g;
}

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
  const member = members.find((m) => m.userId !== undefined && m.userId === userId) ?? null;
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
  if (group.ownerUserId !== undefined && group.ownerUserId !== userId) {
    throw new Error("Only the group owner can do this.");
  }
  return { userId, owned: true };
}
