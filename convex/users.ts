import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: (user as { email?: string }).email ?? null,
      name: (user as { name?: string }).name ?? null,
    };
  },
});

export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const name = args.name.trim().slice(0, 40);
    if (!name) throw new Error("Name is required.");
    await ctx.db.patch(userId, { name } as never);
    return { ok: true };
  },
});
