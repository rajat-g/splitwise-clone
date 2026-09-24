/// <reference types="vite/client" />
// Authorization matrix: guests view; members transact/invite/rename/remove;
// only owners rotate the invite code. Every case below calls the public
// mutation directly, the way an attacker with the link would.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { allExpenses, seedGroup, seedUser, verifyUser } from "./testUtils";

const modules = import.meta.glob("./**/*.ts");
function fresh() {
  return convexTest(schema, modules);
}

// Alice owns the group; Mallory is authenticated but not a member.
async function setupOutsider() {
  const t = fresh();
  const { authed: alice } = await seedUser(t, { name: "Alice", email: "alice@x.co" });
  const g = await seedGroup(alice, { creatorName: "Alice" });
  const { authed: mallory, userId: malloryId } = await seedUser(t, { name: "Mallory", email: "mallory@x.co" });
  const members = await t.query(api.members.list, { publicId: g.publicId });
  return { t, alice, mallory, malloryId, g, creator: members[0] };
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
      category: "other",
      splitMode: "equal",
      isSettlement: false,
    };
    await expect(mallory.mutation(api.expenses.add, payload)).rejects.toThrow(/not a member/i);

    const { _id } = await alice.mutation(api.expenses.add, payload);
    await expect(mallory.mutation(api.expenses.update, {
      publicId: g.publicId, expenseId: _id, description: "X", amountCents: 100,
      paidBy: creator._id, splits: [{ memberId: creator._id, amountCents: 100 }], date: "2026-09-20",
      category: "other",
      splitMode: "equal",
    })).rejects.toThrow(/not a member/i);
    await expect(mallory.mutation(api.expenses.remove, { publicId: g.publicId, expenseId: _id }))
      .rejects.toThrow(/not a member/i);
    // Untouched by the attempts.
    expect(await allExpenses(t, g.publicId)).toHaveLength(1);
  });

  it("blocks member invite/rename/remove", async () => {
    const { alice, mallory, t, g, creator } = await setupOutsider();
    await expect(mallory.mutation(api.members.add, { publicId: g.publicId, email: "z@x.co" }))
      .rejects.toThrow(/not a member/i);
    await expect(mallory.mutation(api.members.rename, {
      publicId: g.publicId, memberId: creator._id, name: "Pwned",
    })).rejects.toThrow(/not a member/i);
    await expect(mallory.action(api.members.remove, { publicId: g.publicId, memberId: creator._id }))
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
    const { alice, g } = base;
    // Alice invites Mallory (verified account → linked immediately as a member).
    await verifyUser(base.t, base.malloryId);
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "mallory@x.co" });
    const members = await alice.query(api.members.list, { publicId: g.publicId });
    const malloryRow = members.find((m) => "email" in m && m.email === "mallory@x.co")!;
    return { ...base, malloryRow };
  }

  it("member adds expenses, invites, renames and removes", async () => {
    const { alice, mallory, g, creator, malloryRow } = await setupMember();
    const { _id } = await mallory.mutation(api.expenses.add, {
      publicId: g.publicId, description: "Lunch", amountCents: 200,
      paidBy: malloryRow._id, splits: [{ memberId: malloryRow._id, amountCents: 200 }],
      date: "2026-09-20", category: "other", splitMode: "equal", isSettlement: false,
    });
    expect(_id).toBeTruthy();

    await mallory.mutation(api.members.add, { publicId: g.publicId, email: "newbie@x.co", name: "New" });
    let members = await mallory.query(api.members.list, { publicId: g.publicId });
    const newbie = members.find((m) => "email" in m && m.email === "newbie@x.co")!;
    await mallory.mutation(api.members.rename, {
      publicId: g.publicId, memberId: newbie._id, name: "Newcomer",
    });
    await mallory.action(api.members.remove, { publicId: g.publicId, memberId: newbie._id });
    members = await mallory.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => "email" in m && m.email === "newbie@x.co")).toMatchObject({ status: "left" });
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
    const { mallory, g } = await setupOutsider();
    const first = await mallory.mutation(api.members.join, { publicId: g.publicId });
    expect(first.name).toBe("Mallory");    const members = await mallory.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m.name === "Mallory")).toMatchObject({ email: "mallory@x.co" });
    const second = await mallory.mutation(api.members.join, { publicId: g.publicId });
    expect(second._id).toEqual(first._id);
    // A joined outsider can now write.
    const rows = await mallory.query(api.members.list, { publicId: g.publicId });
    const row = rows.find((m) => "email" in m && m.email === "mallory@x.co")!;
    const { _id } = await mallory.mutation(api.expenses.add, {
      publicId: g.publicId, description: "Hi", amountCents: 100,
      paidBy: row._id, splits: [{ memberId: row._id, amountCents: 100 }],
      date: "2026-09-20", category: "other", splitMode: "equal", isSettlement: false,
    });
    expect(_id).toBeTruthy();
  });

  it("unverified joiners don't absorb pending invites", async () => {
    const { alice, t, g } = await setupOutsider();
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "mallory@x.co" });
    const { authed: mallory } = await seedUser(t, { name: "Mallory", email: "mallory@x.co" });
    // Mallory is UNVERIFIED: join creates a fresh row; the pending invite
    // stays untouched until mailbox proof arrives via claim.
    const res = await mallory.mutation(api.members.join, { publicId: g.publicId });
    const rows = await alice.query(api.members.list, { publicId: g.publicId });
    const matching = rows.filter((m) => "email" in m && m.email === "mallory@x.co");
    expect(matching).toHaveLength(2);
    const freshRow = matching.find((m) => "userId" in m && m.userId);
    expect(res._id).toEqual(freshRow!._id);
    expect(matching.some((m) => !("userId" in m) || !m.userId)).toBe(true);
  });

  it("links a pending invite instead of duplicating", async () => {
    const t = fresh();
    const { authed: alice } = await seedUser(t, { name: "Alice", email: "alice@x.co" });
    const g = await seedGroup(alice, { creatorName: "Alice" });
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "ghost@x.co" });
    const { authed: ghost, userId: ghostId } = await seedUser(t, { name: "Ghost Real", email: "ghost@x.co" });
    await verifyUser(t, ghostId);
    const res = await ghost.mutation(api.members.join, { publicId: g.publicId });
    expect(res.name).toBe("Ghost Real");
    const members = await ghost.query(api.members.list, { publicId: g.publicId });
    expect(members.filter((m) => "email" in m && m.email === "ghost@x.co")).toHaveLength(1);
  });
});

describe("owner controls", () => {
  it("owner rotates even after leaving, and can rejoin", async () => {
    const { alice, t, g, creator } = await setupOutsider();
    await alice.action(api.members.remove, { publicId: g.publicId, memberId: creator._id });
    const { inviteCode } = await alice.mutation(api.groups.rotateCode, { publicId: g.publicId });
    expect(inviteCode).toHaveLength(10);
    const rejoined = await alice.mutation(api.members.join, { publicId: g.publicId });
    expect(rejoined.name).toBe("Alice");
    expect(await t.query(api.members.list, { publicId: g.publicId })).toHaveLength(1);
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

describe("soft-deleted members keep history readable", () => {
  async function setupHistory() {
    const t = fresh();
    const { authed: alice } = await seedUser(t, { name: "Alice", email: "alice@x.co" });
    const g = await seedGroup(alice, { creatorName: "Alice" });
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "zed@x.co", name: "Zed" });
    const members = await alice.query(api.members.list, { publicId: g.publicId });
    const creator = members.find((m) => m.name === "Alice")!;
    const zed = members.find((m) => "email" in m && m.email === "zed@x.co")!;
    // Zed participates, then settles to zero and leaves.
    await alice.mutation(api.expenses.add, {
      publicId: g.publicId, description: "Dinner", amountCents: 2000,
      paidBy: creator._id, splits: [
        { memberId: creator._id, amountCents: 1000 },
        { memberId: zed._id, amountCents: 1000 },
      ],
      date: "2026-09-20", category: "other", splitMode: "equal", isSettlement: false,
    });
    await alice.mutation(api.expenses.add, {
      publicId: g.publicId, description: "Pay", amountCents: 1000,
      paidBy: zed._id, splits: [{ memberId: creator._id, amountCents: 1000 }],
      date: "2026-09-21", category: "other", splitMode: "equal", isSettlement: true,
    });
    await alice.action(api.members.remove, { publicId: g.publicId, memberId: zed._id });
    return { t, alice, g, creator, zed };
  }

  it("retains the row with status left and names still resolve", async () => {
    const { t, g, zed } = await setupHistory();
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m._id === zed._id)).toMatchObject({ name: "Zed", status: "left" });
    const expenses = await allExpenses(t, g.publicId);
    expect(expenses).toHaveLength(2);
    expect(expenses.every((e) => e.splits.every((s) => members.some((m) => String(m._id) === String(s.memberId))))).toBe(true);
  });

  it("rejects left members in new expenses", async () => {
    const { alice, g, creator, zed } = await setupHistory();
    await expect(alice.mutation(api.expenses.add, {
      publicId: g.publicId, description: "New", amountCents: 100,
      paidBy: zed._id, splits: [{ memberId: zed._id, amountCents: 100 }],
      date: "2026-09-22", category: "other", splitMode: "equal", isSettlement: false,
    })).rejects.toThrow(/has left/i);
    await expect(alice.mutation(api.expenses.add, {
      publicId: g.publicId, description: "New", amountCents: 200,
      paidBy: creator._id, splits: [
        { memberId: creator._id, amountCents: 100 },
        { memberId: zed._id, amountCents: 100 },
      ],
      date: "2026-09-22", category: "other", splitMode: "equal", isSettlement: false,
    })).rejects.toThrow(/has left/i);
  });

  it("allows edits that keep left references, blocks newly added ones", async () => {
    const { alice, t, g, creator, zed } = await setupHistory();
    const rows = (await allExpenses(t, g.publicId))
      .filter((e) => !e.isSettlement);
    // Rename-only edit keeps Zed's historical split: allowed.
    await alice.mutation(api.expenses.update, {
      publicId: g.publicId, expenseId: rows[0]._id, description: "Dinner (edited)",
      amountCents: 2000, paidBy: creator._id,
      splits: [
        { memberId: creator._id, amountCents: 1000 },
        { memberId: zed._id, amountCents: 1000 },
      ],
      date: "2026-09-20",
      category: "other",
      splitMode: "equal",
    });
    // Swapping Zed out is allowed too.
    await alice.mutation(api.expenses.update, {
      publicId: g.publicId, expenseId: rows[0]._id, description: "Dinner (edited)",
      amountCents: 1000, paidBy: creator._id,
      splits: [{ memberId: creator._id, amountCents: 1000 }],
      date: "2026-09-20",
      category: "other",
      splitMode: "equal",
    });
    // Re-adding Zed to a fresh expense is rejected.
    await expect(alice.mutation(api.expenses.add, {
      publicId: g.publicId, description: "New", amountCents: 100,
      paidBy: creator._id, splits: [{ memberId: zed._id, amountCents: 100 }],
      date: "2026-09-22", category: "other", splitMode: "equal", isSettlement: false,
    })).rejects.toThrow(/has left/i);
  });

  it("re-inviting and re-joining reactivate the same row", async () => {
    const { alice, t, g, zed } = await setupHistory();
    const again = await alice.mutation(api.members.add, {
      publicId: g.publicId, email: "zed@x.co", name: "Zeddy",
    });
    expect(again._id).toEqual(zed._id);
    let members = await alice.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m._id === zed._id)).toMatchObject({ status: "active", name: "Zeddy" });

    // Leave again, then rejoin via join (no temp name → keeps row name).
    await alice.action(api.members.remove, { publicId: g.publicId, memberId: zed._id });
    const { authed: zedAuth, userId: zedId } = await seedUser(t, { name: "Zeddy", email: "zed@x.co" });
    await verifyUser(t, zedId);
    const rejoined = await zedAuth.mutation(api.members.join, { publicId: g.publicId });
    expect(rejoined._id).toEqual(zed._id);
    members = await zedAuth.query(api.members.list, { publicId: g.publicId });
    expect(members.filter((m) => "email" in m && m.email === "zed@x.co")).toHaveLength(1);
    expect(members.find((m) => m._id === zed._id)?.status).toBe("active");
  });
});

describe("member list redaction", () => {
  it("strips emails, userIds and deviceIds for guests", async () => {
    const { t, g } = await setupOutsider();
    const rows = await t.query(api.members.list, { publicId: g.publicId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      _id: expect.anything(),
      _creationTime: expect.any(Number),
      groupId: expect.anything(),
      name: "Alice",
      createdAt: expect.any(Number),
    });
    expect(JSON.stringify(rows)).not.toMatch(/alice@x\.co|deviceId|userId/);
  });

  it("hides other members' emails from signed-in outsiders", async () => {
    const { t, mallory, g } = await setupOutsider();
    void t;
    const rows = await mallory.query(api.members.list, { publicId: g.publicId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("email");
    expect(rows[0]).not.toHaveProperty("userId");
  });

  it("unredacts only the outsider's own pending invite row", async () => {
    const { alice, t, g } = await setupOutsider();
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "mallory@x.co" });
    const { authed: mallory } = await seedUser(t, { name: "Mallory", email: "mallory@x.co" });
    const rows = await mallory.query(api.members.list, { publicId: g.publicId });
    expect(rows).toHaveLength(2);
    const own = rows.find((m) => "email" in m && m.email === "mallory@x.co");
    expect(own).toBeTruthy();
    expect(rows.filter((m) => !("email" in m))).toHaveLength(1);
  });

  it("returns full rows minus deviceId to members", async () => {
    const { alice, t, g } = await setupOutsider();
    await alice.mutation(api.members.add, { publicId: g.publicId, email: "mallory@x.co", name: "Mal" });
    const rows = await alice.query(api.members.list, { publicId: g.publicId });
    expect(rows).toHaveLength(2);
    for (const m of rows) expect(m).not.toHaveProperty("deviceId");
    expect(rows.find((m) => "email" in m && m.email === "mallory@x.co")).toBeTruthy();
    void t;
  });
});
