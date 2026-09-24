import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  groups: defineTable({
    publicId: v.string(), // 21-char unguessable secret = privacy. Never listed.
    name: v.string(),
    currency: v.string(),
    inviteCode: v.string(), // 10-char human-typed code (see groups.ts)
    createdByName: v.string(),
    createdAt: v.number(),
    ownerUserId: v.optional(v.id("users")),
  })
    .index("by_publicId", ["publicId"])
    .index("by_inviteCode", ["inviteCode"])
    .index("by_owner", ["ownerUserId"]),

  members: defineTable({
    groupId: v.id("groups"),
    name: v.string(), // display name: temp name, real profile name, or email fallback
    email: v.optional(v.string()), // lowercased invite email; empty for legacy name-only members
    // Soft delete: "left" members stay in history so expenses keep resolving
    // names; only "active" members transact. Absent = active (legacy rows).
    status: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    userId: v.optional(v.id("users")), // set when the member is created by/for the signed-in user
    createdAt: v.number(),
  }).index("by_group", ["groupId"]),

  expenses: defineTable({
    groupId: v.id("groups"),
    description: v.string(),
    amountCents: v.number(),
    paidBy: v.id("members"),
    splits: v.array(v.object({ memberId: v.id("members"), amountCents: v.number() })),
    date: v.string(),
    category: v.optional(v.string()), // e.g. "food" — see EXPENSE_CATEGORIES in src/lib/categories.js
    splitMode: v.optional(v.string()), // "equal" | "exact" | "percent" | "shares" — how the expense was split
    isSettlement: v.boolean(),
    createdByName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    clientId: v.optional(v.string()), // offline-sync dedup key (uuid per queued op)
  }).index("by_group", ["groupId"])
    .index("by_clientId", ["clientId"]),

  activity: defineTable({
    groupId: v.id("groups"),
    type: v.string(),
    text: v.string(),
    actorName: v.string(),
    expenseId: v.optional(v.id("expenses")),
    createdAt: v.number(),
  }).index("by_group", ["groupId"]),
});
