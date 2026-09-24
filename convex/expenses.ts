import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveActorName } from "./identity";
import { requireGroupMember } from "./authz";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 1_000_000_00; // $1M cap per expense

// Must match EXPENSE_CATEGORIES ids in src/lib/categories.js.
const EXPENSE_CATEGORIES = [
  "food", "groceries", "travel", "transport", "shopping",
  "entertainment", "utilities", "rent", "health", "other",
];

function normalizeCategory(raw: unknown): string {
  const c = String(raw ?? "other").trim().toLowerCase();
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(c)) return c;
  throw new Error("Invalid category.");
}

// Must match the split modes in ExpenseModal.
const SPLIT_MODES = ["equal", "exact", "percent", "shares"];

function normalizeSplitMode(raw: unknown): string {
  const m = String(raw ?? "equal").trim().toLowerCase();
  if ((SPLIT_MODES as readonly string[]).includes(m)) return m;
  throw new Error("Invalid split type.");
}

async function groupByPublicId(ctx: any, publicId: string) {
  const g = await ctx.db
    .query("groups")
    .withIndex("by_publicId", (q: any) => q.eq("publicId", publicId))
    .first();
  if (!g) throw new Error("Group not found. Check your invite link.");
  return g;
}

async function memberMap(ctx: any, groupId: any) {
  const members = await ctx.db.query("members").withIndex("by_group", (q: any) => q.eq("groupId", groupId)).collect();
  return new Map(members.map((m: any) => [String(m._id), m]));
}

function validateExpenseInput(args: {
  description: string; amountCents: number; paidBy: string;
  splits: { memberId: string; amountCents: number }[];
  date: string; isSettlement: boolean;
}) {
  const description = (args.description || "").trim().slice(0, 140);
  if (description.length < 1) throw new Error("Description is required.");
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) throw new Error("Amount must be greater than 0.");
  if (args.amountCents > MAX_CENTS) throw new Error("Amount is too large.");
  if (!DATE_RE.test(args.date || "")) throw new Error("Invalid date.");
  if (!args.paidBy) throw new Error("Choose who paid.");
  if (!args.splits.length) throw new Error("Select at least one person.");
  for (const s of args.splits) {
    if (!Number.isInteger(s.amountCents) || s.amountCents < 0) throw new Error("Invalid split amount.");
  }
  const sum = args.splits.reduce((a, s) => a + s.amountCents, 0);
  if (args.isSettlement) {
    if (args.splits.length !== 1) throw new Error("Settlement must have exactly one recipient.");
    if (args.splits[0].memberId === args.paidBy) throw new Error("Payer and recipient must differ.");
    if (sum !== args.amountCents) throw new Error("Settlement amount must equal payment.");
  } else {
    if (sum !== args.amountCents) {
      throw new Error(`Splits add to ${(sum / 100).toFixed(2)}, must equal ${(args.amountCents / 100).toFixed(2)}.`);
    }
  }
  return description;
}

export const list = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", args.publicId)).first();
    if (!g) return [];
    const rows = await ctx.db.query("expenses").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});

export const activity = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", args.publicId)).first();
    if (!g) return [];
    const rows = await ctx.db.query("activity").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, 100);
  },
});

export const add = mutation({
  args: {
    publicId: v.string(),
    description: v.string(),
    amountCents: v.number(),
    paidBy: v.id("members"),
    splits: v.array(v.object({ memberId: v.id("members"), amountCents: v.number() })),
    date: v.string(),
    category: v.optional(v.string()),
    splitMode: v.optional(v.string()),
    isSettlement: v.boolean(),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const g = await groupByPublicId(ctx, args.publicId);
    // Writing requires membership in THIS group — a signed-in outsider with
    // the link can view, but cannot add.
    await requireGroupMember(ctx, g._id);
    // Offline-sync dedup: a retried op with the same clientId returns the
    // original expense instead of inserting a duplicate.
    if (args.clientId) {
      const dup = await ctx.db
        .query("expenses")
        .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
        .first();
      if (dup && String(dup.groupId) === String(g._id)) return { _id: dup._id };
    }
    const members = await memberMap(ctx, g._id);
    if (!members.has(String(args.paidBy))) throw new Error("Payer is not a member of this group.");
    for (const s of args.splits) {
      if (!members.has(String(s.memberId))) throw new Error("A split member is not in this group.");
    }
    // Left members stay in history but can't join NEW expenses.
    const leftName = (id: string) => {
      const m = members.get(String(id)) as { status?: unknown; name?: unknown } | undefined;
      return m && m.status === "left" ? m.name : null;
    };
    const leftPaid = leftName(String(args.paidBy));
    if (leftPaid) throw new Error(`${leftPaid} has left the group and can't be part of new expenses.`);
    for (const s of args.splits) {
      const ln = leftName(String(s.memberId));
      if (ln) throw new Error(`${ln} has left the group and can't be part of new expenses.`);
    }
    const description = validateExpenseInput({
      description: args.description, amountCents: args.amountCents,
      paidBy: String(args.paidBy),
      splits: args.splits.map((s) => ({ memberId: String(s.memberId), amountCents: s.amountCents })),
      date: args.date, isSettlement: args.isSettlement,
    });
    const actor = await resolveActorName(ctx);
    const now = Date.now();
    const category = args.isSettlement ? undefined : normalizeCategory(args.category);
    const splitMode = args.isSettlement ? undefined : normalizeSplitMode((args as { splitMode?: unknown }).splitMode);
    const _id = await ctx.db.insert("expenses", {
      groupId: g._id, description, amountCents: args.amountCents, paidBy: args.paidBy,
      splits: args.splits, date: args.date, isSettlement: args.isSettlement,
      createdByName: actor, createdAt: now, updatedAt: now,
      ...(category ? { category } : {}),
      ...(splitMode ? { splitMode } : {}),
      ...(args.clientId ? { clientId: args.clientId } : {}),
    });
    await ctx.db.insert("activity", {
      groupId: g._id,
      type: args.isSettlement ? "settle" : "expense_added",
      text: args.isSettlement
        ? `${actor} recorded a payment of ${(args.amountCents / 100).toFixed(2)}`
        : `${actor} added "${description}" (${(args.amountCents / 100).toFixed(2)})`,
      actorName: actor, expenseId: _id, createdAt: now,
    });
    return { _id };
  },
});

export const update = mutation({
  args: {
    publicId: v.string(),
    expenseId: v.id("expenses"),
    description: v.string(),
    amountCents: v.number(),
    paidBy: v.id("members"),
    splits: v.array(v.object({ memberId: v.id("members"), amountCents: v.number() })),
    date: v.string(),
    category: v.optional(v.string()),
    splitMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const g = await groupByPublicId(ctx, args.publicId);
    await requireGroupMember(ctx, g._id);
    const exp = await ctx.db.get(args.expenseId);
    if (!exp || String(exp.groupId) !== String(g._id)) throw new Error("Expense not found.");
    if (exp.isSettlement) throw new Error("Settlements cannot be edited — delete and re-record.");
    const members = await memberMap(ctx, g._id);
    if (!members.has(String(args.paidBy))) throw new Error("Payer is not a member.");
    for (const s of args.splits) {
      if (!members.has(String(s.memberId))) throw new Error("A split member is not in this group.");
    }
    // Edits keep working on historical expenses: left members already on the
    // expense stay untouched, but newly adding one is rejected.
    const oldIds = new Set([String(exp.paidBy), ...exp.splits.map((s) => String(s.memberId))]);
    for (const id of [String(args.paidBy), ...args.splits.map((s) => String(s.memberId))]) {
      const m = members.get(id) as { status?: unknown; name?: unknown } | undefined;
      if (m && m.status === "left" && !oldIds.has(id)) {
        throw new Error(`${m.name} has left the group and can't be added to expenses.`);
      }
    }
    const description = validateExpenseInput({
      description: args.description, amountCents: args.amountCents,
      paidBy: String(args.paidBy),
      splits: args.splits.map((s) => ({ memberId: String(s.memberId), amountCents: s.amountCents })),
      date: args.date, isSettlement: false,
    });
    const actor = await resolveActorName(ctx);
    const category = normalizeCategory(args.category);
    const splitMode = normalizeSplitMode((args as { splitMode?: unknown }).splitMode);
    await ctx.db.patch(args.expenseId, {
      description, amountCents: args.amountCents, paidBy: args.paidBy,
      splits: args.splits, date: args.date, category, splitMode, updatedAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      groupId: g._id, type: "expense_updated", text: `${actor} updated "${description}"`,
      actorName: actor, expenseId: args.expenseId, createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { publicId: v.string(), expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const g = await groupByPublicId(ctx, args.publicId);
    await requireGroupMember(ctx, g._id);
    const exp = await ctx.db.get(args.expenseId);
    if (!exp || String(exp.groupId) !== String(g._id)) throw new Error("Expense not found.");
    const actor = await resolveActorName(ctx);
    await ctx.db.delete(args.expenseId);
    await ctx.db.insert("activity", {
      groupId: g._id, type: "expense_deleted", text: `${actor} deleted "${exp.description}"`,
      actorName: actor, createdAt: Date.now(),
    });
    return { ok: true };
  },
});
