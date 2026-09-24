/// <reference types="vite/client" />
// Authorization matrix: guests view; members transact/invite/rename/remove;
// only owners rotate the invite code. Every case below calls the public
// mutation directly, the way an attacker with the link would.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedGroup, seedUser } from "./testUtils";

const modules = import.meta.glob("./**/*.ts");
function fresh() {
  return convexTest(schema, modules);
}

// Alice owns the group; Mallory is authenticated but not a member.
async function setupOutsider() {
  const t = fresh();
  const { authed: alice } = await seedUser(t, { name: "Alice", email: "alice@x.co" });
  const g = await seedGroup(alice, { creatorName: "Alice" });
  const { authed: mallory } = await seedUser(t, { name: "Mallory", email: "mallory@x.co" });
  const members = await t.query(api.members.list, { publicId: g.publicId });
  return { t, alice, mallory, g, creator: members[0] };
}

describe("outsiders cannot write", () => {
  it("blocks expense add/update/remove", async () => {
    const { alice, mallory, t, g, creator } = await setupOutsider();
    const payload = {
      publicId: g.publicId,
      description: "Evil",
      amountCents: 100,
      paidBy: creator._id,
      splits: [{ memberId: creator._id, amountCents: 100 }],
      date: "2026-09-20",
      isSettlement: false,
    };
    await expect(mallory.mutation(api.expenses.add, payload)).rejects.toThrow(/not a member/i);

    const { _id } = await alice.mutation(api.expenses.add, payload);
    await expect(mallory.mutation(api.expenses.update, {
      publicId: g.publicId, expenseId: _id, description: "X", amountCents: 100,
      paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 100 }], date: "2026-09-20",
    })).rejects.toThrow(/not a member/i);
    await expect(mallory.mutation(api.expenses.remove, { publicId: g.publicId, expenseId: _id }))
      .rejects.toThrow(/not a member/i);
    // Untouched by the attempts.
    expect(await t.query(api.expenses.list, { publicId: g.publicId })).toHaveLength(1);
  });

  it("blocks member invite/rename/remove", async () => {
    const { alice, mallory, t, g, creator } = await setupOutsider();
    await expect(mallory.mutation(api.members.add, { publicId: g.publicId, email: "z@x.co" }))
      .rejects.toThrow(/not a member/i);
    await expect(mallory.mutation(api.members.rename, {
      publicId: g.publicId, memberId: creator._id, name: "Pwned",
    })).rejects.toThrow(/not a member/i);
    await expect(mallory.mutation(api.members.remove, { publicId: g.publicId, memberId: creator._id }))
      .rejects.toThrow(/not a member/i);
    expect((await t.query(api.members.list, { publicId: g.publicId })).map((m) => m.name))
      .toEqual(["Alice"]);
    void alice;
  });

  it("blocks invite-code rotation with an owner-only error", async () => {
    const { mallory, g } = await setupOutsider();
    await expect(mallory.mutation(api.groups.rotateCode, { publicId: g.publicId }))
      .rejects.toThrow(/only the group owner/i);
  });

  it("claim is a no-op for non-matching emails", async () => {
    const { mallory, g } = await setupOutsider();
    expect(await mallory.mutation(api.members.claim, { publicId: g.publicId })).toEqual({ claimed: 0 });
  });
});

describe("members can transact but not rotate", () => {
  async function setupMember() {
    const base = await setupOutsider();
    const { alice, mallory, t, g } = base;
    // Alice invites Mallory (account exists → linked immediately as a member).
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "mallory@x.co" });
    const members = await t.query(api.members.list, { publicId: g.publicId });
    const malloryRow = members.find((m) => m.email === "mallory@x.co")!;
    return { ...base, malloryRow };
  }

  it("member adds expenses, invites, renames and removes", async () => {
    const { alice, mallory, t, g, creator, malloryRow } = await setupMember();
    const { _id } = await mallory.mutation(api.expenses.add, {
      publicId: g.publicId, description: "Lunch", amountCents: 200,
      paidBy: malloryRow._id, splits: [{ memberId: malloryRow._id, amountCents: 200 }],
      date: "2026-09-20", isSettlement: false,
    });
    expect(_id).toBeTruthy();

    await mallory.mutation(api.members.add, { publicId: g.publicId, email: "newbie@x.co", name: "New" });
    let members = await t.query(api.members.list, { publicId: g.publicId });
    const newbie = members.find((m) => m.email === "newbie@x.co")!;
    await mallory.mutation(api.members.rename, {
      publicId: g.publicId, memberId: newbie._id, name: "Newcomer",
    });
    await mallory.mutation(api.members.remove, { publicId: g.publicId, memberId: newbie._id });
    members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.some((m) => m.email === "newbie@x.co")).toBe(false);
    void alice;
    void creator;
  });

  it("member cannot rotate the invite code", async () => {
    const { mallory, g } = await setupMember();
    await expect(mallory.mutation(api.groups.rotateCode, { publicId: g.publicId }))
      .rejects.toThrow(/only the group owner/i);
  });
});

describe("members.join", () => {
  it("rejects guests", async () => {
    const t = fresh();
    await expect(t.mutation(api.members.join, { publicId: "x" })).rejects.toThrow(/sign in/i);
  });

  it("creates a linked row, idempotently", async () => {
    const { t, mallory, g } = await setupOutsider();
    const first = await mallory.mutation(api.members.join, { publicId: g.publicId });
    expect(first.name).toBe("Mallory");
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m.name === "Mallory")).toMatchObject({ email: "mallory@x.co" });
    const second = await mallory.mutation(api.members.join, { publicId: g.publicId });
    expect(second._id).toEqual(first._id);
    // A joined outsider can now write.
    const rows = await t.query(api.members.list, { publicId: g.publicId });
    const row = rows.find((m) => m.email === "mallory@x.co")!;
    const { _id } = await mallory.mutation(api.expenses.add, {
      publicId: g.publicId, description: "Hi", amountCents: 100,
      paidBy: row._id, splits: [{ memberId: row._id, amountCents: 100 }],
      date: "2026-09-20", isSettlement: false,
    });
    expect(_id).toBeTruthy();
  });

  it("links a pending invite instead of duplicating", async () => {
    const t = fresh();
    const { authed: alice } = await seedUser(t, { name: "Alice", email: "alice@x.co" });
    const g = await seedGroup(alice, { creatorName: "Alice" });
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "ghost@x.co" });
    const { authed: ghost } = await seedUser(t, { name: "Ghost Real", email: "ghost@x.co" });
    const res = await ghost.mutation(api.members.join, { publicId: g.publicId });
    expect(res.name).toBe("Ghost Real");
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.filter((m) => m.email === "ghost@x.co")).toHaveLength(1);
  });
});

describe("owner controls", () => {
  it("owner rotates even after leaving, and can rejoin", async () => {
    const { alice, t, g, creator } = await setupOutsider();
    await alice.mutation(api.members.remove, { publicId: g.publicId, memberId: creator._id });
    const { inviteCode } = await alice.mutation(api.groups.rotateCode, { publicId: g.publicId });
    expect(inviteCode).toHaveLength(10);
    const rejoined = await alice.mutation(api.members.join, { publicId: g.publicId });
    expect(rejoined.name).toBe("Alice");
    expect(await t.query(api.members.list, { publicId: g.publicId })).toHaveLength(1);
  });

  it("ownerless groups fall back to member rotation", async () => {
    const { alice, mallory, t, g } = await setupOutsider();
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("groups")
        .withIndex("by_publicId", (q) => q.eq("publicId", g.publicId))
        .first();
      const { ownerUserId: _drop, ...rest } = row!;
      void _drop;
      await ctx.db.replace(row!._id, rest as never);
    });
    // Alice is still a linked member → allowed.
    const { inviteCode } = await alice.mutation(api.groups.rotateCode, { publicId: g.publicId });
    expect(inviteCode).toHaveLength(10);
    // Outsider still blocked, now at the membership gate.
    await expect(mallory.mutation(api.groups.rotateCode, { publicId: g.publicId }))
      .rejects.toThrow(/not a member/i);
  });
});

describe("getByPublicId owner visibility", () => {
  it("hides ownerUserId from guests, shows it to signed-in viewers", async () => {
    const { alice, t, g } = await setupOutsider();
    const anon = await t.query(api.groups.getByPublicId, { publicId: g.publicId });
    expect(anon).not.toHaveProperty("ownerUserId");
    const authed = await alice.query(api.groups.getByPublicId, { publicId: g.publicId });
    expect(authed).toHaveProperty("ownerUserId");
  });
});
