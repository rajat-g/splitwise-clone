import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { resolveActorName, userEmailVerified } from "./identity";
import { groupByPublicId, requireAuth, requireGroupMember } from "./authz";

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

function emailsEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isLeft(m: Pick<Doc<"members">, "status">) {
  return m.status === "left";
}

/** Best-effort lookup of a registered user by email (for instant name + link). */
async function findUserByEmail(ctx: MutationCtx, email: string): Promise<Doc<"users"> | null> {
  try {
    // Indexed ("email" comes from authTables) — never a table scan, even as
    // the user base grows: this is global identity data.
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    return user ?? null;
  } catch {
    return null;
  }
}

function profileNameOf(user: Doc<"users">, fallbackEmail: string) {
  const n = user.name;
  if (typeof n === "string" && n.trim()) return n.trim().slice(0, MAX_MEMBER_NAME);
  return fallbackEmail.split("@")[0].slice(0, MAX_MEMBER_NAME) || fallbackEmail;
}

export const list = query({
  args: { publicId: v.string() },
  // Explicit DTO: email/userId are present only for members (or own row) —
  // the optional markers ARE the redaction contract, enforced below.
  returns: v.array(v.object({
    _id: v.id("members"),
    _creationTime: v.number(),
    groupId: v.id("groups"),
    name: v.string(),
    email: v.optional(v.string()),
    status: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const g = await ctx.db.query("groups").withIndex("by_publicId", (q) => q.eq("publicId", args.publicId)).first();
    if (!g) return [];
    const rows = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    // Privacy: member emails are invite-scoped PII, not public directory
    // data. Guests (and signed-in outsiders) receive a sanitized DTO —
    // never trust the frontend to hide what the backend already returned.
    // Full rows go only to linked group members; an outsider additionally
    // sees the email on rows matching their OWN address so pending invites
    // still resolve, claim, and show correctly for them. deviceId is
    // write-only and stripped for everyone.
    const userId = await getAuthUserId(ctx);
    let viewerEmail = "";
    let isMember = false;
    if (userId) {
      const user = await ctx.db.get(userId);
      viewerEmail = (user?.email ?? "").trim().toLowerCase();
      isMember = rows.some((m) => m.userId !== undefined && m.userId === userId && !isLeft(m));
    }
    return rows.map((m) => {
      const { deviceId: _device, ...rest } = m;
      void _device;
      const ownEmail = !!viewerEmail && typeof rest.email === "string"
        && rest.email.trim().toLowerCase() === viewerEmail;
      if (isMember || ownEmail) return rest;
      const { email: _email, userId: _uid, ...pub } = rest;
      void _email;
      void _uid;
      return pub;
    });
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
    // Inviting requires membership in THIS group — a signed-in outsider with
    // the link can view, but cannot add people. (Joining is members.join.)
    await requireGroupMember(ctx, g._id);
    const existing = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();

    const rawEmail = String(args.email ?? "").trim();
    const rawName = String(args.name ?? "").trim();

    // --- Email-invite path ---
    if (rawEmail) {
      const email = cleanEmail(rawEmail);
      let tempName = "";
      if (rawName) {
        tempName = cleanMemberName(rawName);
        if (tempName.toLowerCase() === email.toLowerCase()) tempName = "";
      }
      // Already invited? Return the existing row (idempotent) — reactivating
      // it when it belongs to someone who left.
      const dupEmail = existing.find((m) => typeof m.email === "string" && emailsEqual(m.email, email));
      if (dupEmail) {
        if (isLeft(dupEmail)) {
          const name = tempName || dupEmail.name;
          await ctx.db.patch(dupEmail._id, { status: "active", ...(tempName ? { name: tempName } : {}) });
          const now = Date.now();
          await ctx.db.insert("activity", {
            groupId: g._id, type: "member_joined",
            text: `${name} rejoined the group`,
            actorName: name, createdAt: now,
          });
          return { _id: dupEmail._id, name };
        }
        return { _id: dupEmail._id, name: dupEmail.name };
      }

      // If this email already has a VERIFIED account, link it now and show
      // their real name. Unverified matches stay pending: an unproven email
      // string must never confer membership.
      const linkedUser = await findUserByEmail(ctx, email);
      const linkedUserId = linkedUser && userEmailVerified(linkedUser) ? linkedUser._id : null;
      // No temp name? Fall back to the email prefix ("priya"), never the
      // full address — the row subtitle already shows the email, and claim
      // upgrades prefix displays to the real name on signup.
      const display = linkedUserId && linkedUser
        ? profileNameOf(linkedUser, email)
        : tempName || email.split("@")[0] || email;

      const now = Date.now();
      const doc = {
        groupId: g._id, name: display, email, createdAt: now,
        ...(args.deviceId ? { deviceId: args.deviceId } : {}),
        ...(linkedUserId ? { userId: linkedUserId } : {}),
      };
      if (existing.length >= MAX_MEMBERS_PER_GROUP) throw new Error(`Groups are capped at ${MAX_MEMBERS_PER_GROUP} members.`);
      const _id = await ctx.db.insert("members", doc);
      await ctx.db.insert("activity", {
        groupId: g._id, type: "member_added",
        text: linkedUserId ? `${display} joined the group` : `${display} was invited`,
        actorName: display, createdAt: now,
      });
      return { _id, name: display };
    }

    // --- Legacy name-only path (no email) ---
    const name = cleanMemberName(rawName);
    const dup = existing.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      if (isLeft(dup)) {
        await ctx.db.patch(dup._id, { status: "active" });
        await ctx.db.insert("activity", {
          groupId: g._id, type: "member_joined",
          text: `${dup.name} rejoined the group`, actorName: dup.name, createdAt: Date.now(),
        });
      }
      return { _id: dup._id, name: dup.name };
    }
    if (existing.length >= MAX_MEMBERS_PER_GROUP) throw new Error(`Groups are capped at ${MAX_MEMBERS_PER_GROUP} members.`);
    const now = Date.now();
    const _id = await ctx.db.insert("members", { groupId: g._id, name, deviceId: args.deviceId, createdAt: now });
    await ctx.db.insert("activity", {
      groupId: g._id, type: "member_added", text: `${name} joined the group`, actorName: name, createdAt: now,
    });
    return { _id, name };
  },
});

/**
 * Join a group as the signed-in user. This is how a link-opener becomes a
 * member with write access: idempotent, links a pending email invite when
 * one matches, otherwise creates a linked member row from the profile.
 */
export const join = mutation({
  args: { publicId: v.string(), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const g = await groupByPublicId(ctx, args.publicId);
    const existing = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    const linked = existing.find((m) => m.userId !== undefined && m.userId === userId);
    if (linked) {
      // Rejoining after leaving reactivates the historical row (history kept).
      if (isLeft(linked)) {
        await ctx.db.patch(linked._id, { status: "active" });
        const now = Date.now();
        await ctx.db.insert("activity", {
          groupId: g._id, type: "member_joined",
          text: `${linked.name} rejoined the group`, actorName: linked.name, createdAt: now,
        });
      }
      return { _id: linked._id, name: linked.name };
    }

    const user = await ctx.db.get(userId);
    const email = (user?.email ?? "").trim().toLowerCase();
    const realName = user ? profileNameOf(user, email || "member") : "Member";

    // Pending email invite for this address? Link it instead of duplicating —
    // but only with mailbox proof: unverified viewers get a fresh row and
    // merge later, once verified, via claim.
    if (email && userEmailVerified(user)) {
      const pending = existing.find(
        (m) => (m.email ?? "").toLowerCase() === email && m.userId === undefined
      );
      if (pending) {
        const pEmail = (pending.email ?? "").toLowerCase();
        const patch: { userId: Id<"users">; status: string; name?: string } = { userId, status: "active" };
        if (!pending.name || pending.name === pEmail || pending.name === pEmail.split("@")[0]) {
          patch.name = realName;
        }
        await ctx.db.patch(pending._id, patch);
        const now = Date.now();
        const joinedName = patch.name ?? pending.name;
        await ctx.db.insert("activity", {
          groupId: g._id, type: "member_joined",
          text: `${joinedName} joined the group`,
          actorName: realName, createdAt: now,
        });
        return { _id: pending._id, name: joinedName };
      }
    }

    if (existing.length >= MAX_MEMBERS_PER_GROUP) throw new Error(`Groups are capped at ${MAX_MEMBERS_PER_GROUP} members.`);
    const now = Date.now();
    const doc = {
      groupId: g._id, name: realName, createdAt: now, userId,
      ...(email ? { email } : {}),
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    };
    const _id = await ctx.db.insert("members", doc);
    await ctx.db.insert("activity", {
      groupId: g._id, type: "member_joined",
      text: `${realName} joined the group`, actorName: realName, createdAt: now,
    });
    return { _id, name: realName };
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
    const email = (user.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return { claimed: 0 };
    // Linking by email string requires mailbox proof — unverified accounts
    // (including legacy never-verified ones) must verify first.
    if (!userEmailVerified(user)) return { claimed: 0 };
    const realName = profileNameOf(user, email);

    const members = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    let claimed = 0;
    for (const m of members) {
      const mEmail = (m.email ?? "").trim().toLowerCase();
      if (!mEmail || mEmail !== email) continue;
      if (m.userId !== undefined && m.userId === userId) {
        // Already linked — still upgrade an email-fallback display name.
        if (m.name === mEmail || m.name === mEmail.split("@")[0]) {
          await ctx.db.patch(m._id, { name: realName });
          claimed += 1;
        }
        continue;
      }
      if (m.userId !== undefined) continue; // claimed by someone else
      const patch: { userId: Id<"users">; status: string; name?: string } = { userId, status: "active" };
      // No custom temp name? Show the real name now (clean UI).
      if (!m.name || m.name === mEmail || m.name === mEmail.split("@")[0] || m.name.toLowerCase() === mEmail) {
        patch.name = realName;
      }
      await ctx.db.patch(m._id, patch);
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
    await requireGroupMember(ctx, g._id);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.groupId !== g._id) throw new Error("Member not found in this group.");
    const name = cleanMemberName(args.name);
    if (name === member.name) return { _id: member._id, name: member.name };
    const existing = await ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    // Same display name is OK when rows are distinct email invites (the email
    // subtitle disambiguates). It stays blocked for legacy name-only rows and
    // for rows sharing the same email.
    const memberEmail = (member.email ?? "").toLowerCase();
    const dup = existing.find((m) => {
      if (m._id === args.memberId) return false;
      if (m.name.toLowerCase() !== name.toLowerCase()) return false;
      const otherEmail = (m.email ?? "").toLowerCase();
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
    const { userId: callerId } = await requireGroupMember(ctx, g._id);
    const actor = await resolveActorName(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.groupId !== g._id) throw new Error("Member not found in this group.");
    if (isLeft(member)) throw new Error(`${member.name} already left the group.`);

    // PROPER BACKEND VALIDATION: compute balances server-side in cents.
    // Refuse to remove anyone with a non-zero balance — no client trust.
    const expenses = await ctx.db.query("expenses").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
    let bal = 0;
    for (const e of expenses) {
      if (e.isSettlement) {
        if (e.paidBy === args.memberId) bal += e.amountCents;
        const recv = e.splits[0];
        if (recv && recv.memberId === args.memberId) bal -= recv.amountCents;
      } else {
        if (e.paidBy === args.memberId) bal += e.amountCents;
        for (const s of e.splits) {
          if (s.memberId === args.memberId) bal -= s.amountCents;
        }
      }
    }
    if (bal !== 0) throw new Error(`${member.name} has a non-zero balance. Settle up before removing.`);
    // Soft delete: the row stays so historical expenses keep resolving names.
    // Only active members transact — the UI hides left members from new
    // splits and the server rejects them there.
    const self = member.userId !== undefined && member.userId === callerId;
    await ctx.db.patch(args.memberId, { status: "left" });
    await ctx.db.insert("activity", {
      groupId: g._id, type: "member_removed",
      text: self ? `${actor} left the group` : `${actor} removed ${member.name}`,
      actorName: actor, createdAt: Date.now(),
    });
    return { ok: true };
  },
});
