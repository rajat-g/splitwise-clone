import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { resolveActorName } from "./identity";
import type { Id } from "./_generated/dataModel";

async function requireAuth(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to make changes. Guests can view only.");
  return userId;
}

async function groupByPublicId(ctx: any, publicId: string) {
  const g = await ctx.db
    .query("groups")
    .withIndex("by_publicId", (q: any) => q.eq("publicId", publicId))
    .first();
  if (!g) throw new Error("Group not found. Check your invite link.");
  return g;
}

function cleanMemberName(raw: unknown) {
  const name = String(raw ?? "").trim();
  if (name.length < 1) throw new Error("Member name is required.");
  if (name.length > MAX_MEMBER_NAME) throw new Error(`Keep member names under ${MAX_MEMBER_NAME} characters.`);
  if (/[\n\r\t]/.test(name)) throw new Error("Member name can't contain line breaks or tabs.");
  return name;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (email.length > 254) throw new Error("That email looks too long.");
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function emailsEqual(a: unknown, b: unknown) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** Best-effort lookup of a registered user by email (for instant name + link). */
async function findUserByEmail(ctx: any, email: string) {
  try {
    const user = await ctx.db
      .query("users")
      .filter((q: any) => q.eq(q.field("email"), email))
      .first();
    return user ?? null;
  } catch {
    return null;
  }
}

function profileNameOf(user: any, fallbackEmail: string) {
  const n = (user as { name?: unknown }).name;
  if (typeof n === "string" && n.trim()) return n.trim().slice(0, MAX_MEMBER_NAME);
  return fallbackEmail.split("@")[0].slice(0, MAX_MEMBER_NAME) || fallbackEmail;
}

export const list = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", args.publicId)).first();
    if (!g) return [];
    return await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
  },
});

const MAX_MEMBER_NAME = 30;
const MAX_MEMBERS_PER_GROUP = 50;

export const add = mutation({
  args: {
    publicId: v.string(),
    // New email-invite flow: email required, name = optional temp display name.
    // Legacy callers send only { name } — still supported for name-only members.
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const g = await groupByPublicId(ctx, args.publicId);
    const existing = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    if (existing.length >= MAX_MEMBERS_PER_GROUP) throw new Error(`Groups are capped at ${MAX_MEMBERS_PER_GROUP} members.`);

    const rawEmail = String(args.email ?? "").trim();
    const rawName = String(args.name ?? "").trim();

    // --- Email-invite path ---
    if (rawEmail) {
      const email = cleanEmail(rawEmail);
      // Already invited? Return the existing row (idempotent).
      const dupEmail = existing.find((m) => typeof (m as { email?: unknown }).email === "string" && emailsEqual((m as { email?: unknown }).email, email));
      if (dupEmail) return { _id: dupEmail._id, name: dupEmail.name };

      let tempName = "";
      if (rawName) {
        tempName = cleanMemberName(rawName);
        if (tempName.toLowerCase() === email.toLowerCase()) tempName = "";
      }

      // If this email already has an account, link it now and show their real name.
      const linkedUser = await findUserByEmail(ctx, email);
      const linkedUserId = (linkedUser?._id ?? null) as Id<"users"> | null;
      const display = linkedUser ? profileNameOf(linkedUser, email) : tempName || email;

      const now = Date.now();
      const doc: Record<string, unknown> = {
        groupId: g._id, name: display, email, createdAt: now,
      };
      if (args.deviceId) doc.deviceId = args.deviceId;
      if (linkedUserId) doc.userId = linkedUserId;
      const _id = await ctx.db.insert("members", doc as never);
      const actor = await resolveActorName(ctx);
      void actor;
      const detail = display !== email ? ` (${email})` : "";
      await ctx.db.insert("activity", {
        groupId: g._id, type: "member_added",
        text: linkedUser ? `${display} joined the group` : `${display}${detail} was invited`,
        actorName: display, createdAt: now,
      });
      return { _id, name: display };
    }

    // --- Legacy name-only path (no email) ---
    const name = cleanMemberName(rawName);
    const dup = existing.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (dup) return { _id: dup._id, name: dup.name };
    const now = Date.now();
    const _id = await ctx.db.insert("members", { groupId: g._id, name, deviceId: args.deviceId, createdAt: now });
    await ctx.db.insert("activity", {
      groupId: g._id, type: "member_added", text: `${name} joined the group`, actorName: name, createdAt: now,
    });
    return { _id, name };
  },
});

/**
 * Claim pending email invites for the signed-in user, scoped to this group.
 * Call it when opening the group: if viewer.email matches a member.email
 * without userId, link it and swap the email-fallback display for the real
 * profile name. Idempotent — safe to call on every open.
 */
export const claim = mutation({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const g = await groupByPublicId(ctx, args.publicId);
    const user = await ctx.db.get(userId);
    if (!user) return { claimed: 0 };
    const email = ((user as { email?: unknown }).email as string | undefined ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return { claimed: 0 };
    const realName = profileNameOf(user, email);

    const members = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    let claimed = 0;
    for (const m of members) {
      const mEmail = ((m as { email?: unknown }).email as string | undefined ?? "").trim().toLowerCase();
      if (!mEmail || mEmail !== email) continue;
      if ((m as { userId?: unknown }).userId && String((m as { userId?: unknown }).userId) === String(userId)) {
        // Already linked — still upgrade an email-fallback display name.
        if (m.name === mEmail || m.name === mEmail.split("@")[0]) {
          await ctx.db.patch(m._id, { name: realName });
          claimed += 1;
        }
        continue;
      }
      if ((m as { userId?: unknown }).userId) continue; // claimed by someone else
      const patch: Record<string, unknown> = { userId };
      // No custom temp name? Show the real name now (clean UI).
      if (!m.name || m.name === mEmail || m.name === mEmail.split("@")[0] || m.name.toLowerCase() === mEmail) {
        patch.name = realName;
      }
      await ctx.db.patch(m._id, patch as never);
      claimed += 1;
    }
    if (claimed > 0) {
      await ctx.db.insert("activity", {
        groupId: g._id, type: "member_joined",
        text: `${realName} joined the group`, actorName: realName, createdAt: Date.now(),
      });
    }
    return { claimed };
  },
});

export const rename = mutation({
  args: { publicId: v.string(), memberId: v.id("members"), name: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const g = await groupByPublicId(ctx, args.publicId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.groupId !== g._id) throw new Error("Member not found in this group.");
    const name = cleanMemberName(args.name);
    if (name === member.name) return { _id: member._id, name: member.name };
    const existing = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    // Same display name is OK when rows are distinct email invites (the email
    // subtitle disambiguates). It stays blocked for legacy name-only rows and
    // for rows sharing the same email.
    const memberEmail = (((member as { email?: unknown }).email as string | undefined) ?? "").toLowerCase();
    const dup = existing.find((m) => {
      if (String(m._id) === String(args.memberId)) return false;
      if (m.name.toLowerCase() !== name.toLowerCase()) return false;
      const otherEmail = (((m as { email?: unknown }).email as string | undefined) ?? "").toLowerCase();
      if (memberEmail && otherEmail && memberEmail !== otherEmail) return false;
      return true;
    });
    if (dup) throw new Error(`${name} is already in this group.`);
    const actor = await resolveActorName(ctx);
    await ctx.db.patch(args.memberId, { name });
    await ctx.db.insert("activity", {
      groupId: g._id, type: "member_renamed",
      text: `${actor} renamed ${member.name} to ${name}`,
      actorName: actor, createdAt: Date.now(),
    });
    return { _id: member._id, name };
  },
});

export const remove = mutation({
  args: { publicId: v.string(), memberId: v.id("members") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const g = await groupByPublicId(ctx, args.publicId);
    const actor = await resolveActorName(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.groupId !== g._id) throw new Error("Member not found in this group.");

    // PROPER BACKEND VALIDATION: compute balances server-side in cents.
    // Refuse to remove anyone with a non-zero balance — no client trust.
    const expenses = await ctx.db.query("expenses").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    let bal = 0;
    for (const e of expenses) {
      if (e.isSettlement) {
        if (String(e.paidBy) === String(args.memberId)) bal += e.amountCents;
        const recv = e.splits[0];
        if (recv && String(recv.memberId) === String(args.memberId)) bal -= recv.amountCents;
      } else {
        if (String(e.paidBy) === String(args.memberId)) bal += e.amountCents;
        for (const s of e.splits) {
          if (String(s.memberId) === String(args.memberId)) bal -= s.amountCents;
        }
      }
    }
    if (bal !== 0) throw new Error(`${member.name} has a non-zero balance. Settle up before removing.`);
    // also refuse if they paid/owe nothing but are referenced? No — zero balance is safe to delete.
    await ctx.db.delete(args.memberId);
    await ctx.db.insert("activity", {
      groupId: g._id, type: "member_removed",
      text: `${actor} removed ${member.name}`, actorName: actor, createdAt: Date.now(),
    });
    return { ok: true };
  },
});
