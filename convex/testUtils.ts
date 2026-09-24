// Shared helpers for convex/ tests. Seeds a real `users` row and returns an
// accessor whose identity resolves to it via getAuthUserId (subject carries
// the user id, matching @convex-dev/auth's subject format without a divider).
import { api } from "./_generated/api";
import type { FunctionReturnType } from "convex/server";
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

// Mailbox proof, as OTP verification would set it. Seeded users start
// unverified (like a fresh signup); verify explicitly where a test needs
// email-based linking (invite auto-link, claim, join-pending-link).
export async function verifyUser(t: T, userId: Id<"users">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
  });
}

export async function allExpenses(t: T, publicId: string) {
  type ExpensePage = FunctionReturnType<typeof api.expenses.list>;
  const rows: ExpensePage["page"][number][] = [];
  let cursor: string | null = null;
  for (;;) {
    const result: ExpensePage = await t.query(api.expenses.list, {
      publicId,
      paginationOpts: { numItems: 100, cursor },
    });
    rows.push(...result.page);
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
}
