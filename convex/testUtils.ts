// Shared helpers for convex/ tests. Seeds a real `users` row and returns an
// accessor whose identity resolves to it via getAuthUserId (subject carries
// the user id, matching @convex-dev/auth's subject format without a divider).
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";
import type { TestConvexRoot } from "convex-test";

type T = TestConvexRoot<DataModel>;

type NewUser = {
  name?: string;
  email?: string;
};

export async function seedUser(t: T, over: NewUser = {}) {
  const userId: Id<"users"> = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Ada Lovelace",
      email: "ada@example.com",
      ...over,
    });
  });
  return { userId, authed: t.withIdentity({ subject: userId }) };
}

export async function seedGroup(
  authed: ReturnType<T["withIdentity"]>,
  over: { name?: string; currency?: string; creatorName?: string } = {}
) {
  return await authed.mutation(api.groups.create, {
    name: "Goa Trip",
    currency: "$",
    creatorName: "Ada",
    ...over,
  });
}
