import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { resolveActorName } from "./identity";
import { requireGroupOwner } from "./authz";

const PUBLIC_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// 10 chars x 31 symbols ≈ 8.2e14 combos (~49 bits) — not brute-forceable.
const CODE_LEN = 10;
export const ALLOWED_CURRENCIES = ["$", "€", "£", "₹", "¥", "₩", "A$", "C$", "R$", "₺", "₽", "₴", "₦", "₱", "฿", "kr", "CHF", "zł"];

function rand(alphabet: string, len: number) {
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** Uppercase, strip spaces/dashes so "KX7Q-9M2P-AB" and "kx7q9m2pab" both work. */
function normalizeCode(raw: string) {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

async function uniqueCode(ctx: any) {
  for (let i = 0; i < 10; i++) {
    const cand = rand(CODE_ALPHABET, CODE_LEN);
    const exists = await ctx.db.query("groups").withIndex("by_inviteCode", (q: any) => q.eq("inviteCode", cand)).first();
    if (!exists) return cand;
  }
  throw new Error("Could not generate invite code, try again.");
}

function cleanName(n: string) {
  return (n || "").trim().slice(0, 80);
}

async function requireAuth(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to make changes. Guests can view only.");
  return userId;
}

/** Create group + creator member. Server generates secrets = no collisions, no client trust. */
export const create = mutation({
  args: {
    name: v.string(),
    currency: v.string(),
    creatorName: v.string(),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuth(ctx);
    const name = cleanName(args.name);
    const creatorName = (args.creatorName || "").trim().slice(0, 30);
    if (name.length < 1) throw new Error("Group name is required.");
    if (creatorName.length < 1) throw new Error("Your name is required.");
    if (!ALLOWED_CURRENCIES.includes(args.currency)) throw new Error("Unsupported currency.");
    // unique secrets (retry on the astronomically unlikely collision)
    let publicId = "";
    for (let i = 0; i < 5; i++) {
      const cand = rand(PUBLIC_ID_ALPHABET, 21);
      const exists = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", cand)).first();
      if (!exists) { publicId = cand; break; }
    }
    if (!publicId) throw new Error("Could not generate group id, try again.");
    const inviteCode = await uniqueCode(ctx);

    const now = Date.now();
    const owner = await ctx.db.get(ownerUserId);
    const ownerEmail = String((owner as { email?: unknown } | null)?.email ?? "").trim().toLowerCase() || undefined;
    const groupId = await ctx.db.insert("groups", {
      publicId, name, currency: args.currency, inviteCode,
      createdByName: creatorName, createdAt: now, ownerUserId,
    });
    await ctx.db.insert("members", {
      groupId, name: creatorName, deviceId: args.deviceId, userId: ownerUserId,
      ...(ownerEmail ? { email: ownerEmail } : {}),
      createdAt: now,
    } as never);
    await ctx.db.insert("activity", {
      groupId, type: "group_created",
      text: `${creatorName} created group "${name}"`,
      actorName: creatorName, createdAt: now,
    });
    return { publicId, inviteCode };
  },
});

/** Private-by-link: only gettable if you know the secret. No list-all query exists. */
export const getByPublicId = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", args.publicId)).first();
    if (!g) return null;
    // ownerUserId is exposed only to signed-in viewers (the UI needs it to
    // gate owner controls); guests never receive it.
    const viewerId = await getAuthUserId(ctx);
    return {
      _id: g._id, publicId: g.publicId, name: g.name, currency: g.currency, inviteCode: g.inviteCode,
      ...(viewerId && g.ownerUserId ? { ownerUserId: g.ownerUserId } : {}),
    };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    if (code.length !== CODE_LEN) throw new Error("Invalid invite code.");
    const g = await ctx.db.query("groups").withIndex("by_inviteCode", (q) => q.eq("inviteCode", code)).first();
    if (!g) return null;
    return { publicId: g.publicId };
  },
});

/**
 * Groups created by the signed-in user. Private to the owner — powers "My groups".
 */
export const myGroups = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("groups")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, 50).map((g) => ({
      _id: g._id,
      publicId: g.publicId,
      name: g.name,
      currency: g.currency,
      inviteCode: g.inviteCode,
      createdAt: g.createdAt,
    }));
  },
});

/**
 * Revoke a leaked/guessed code and issue a fresh one. OWNER ONLY — any
 * member can invite and transact, but sharing settings belong to the owner.
 * (Ownerless legacy groups fall back to any linked member.)
 */
export const rotateCode = mutation({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", args.publicId)).first();
    if (!g) throw new Error("Group not found.");
    await requireGroupOwner(ctx, g);
    const actor = await resolveActorName(ctx);
    const inviteCode = await uniqueCode(ctx);
    await ctx.db.patch(g._id, { inviteCode });
    await ctx.db.insert("activity", {
      groupId: g._id, type: "code_rotated",
      text: `${actor} generated a new invite code (old one no longer works)`,
      actorName: actor, createdAt: Date.now(),
    });
    return { inviteCode };
  },
});
