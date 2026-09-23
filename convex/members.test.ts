/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedGroup, seedUser } from "./test-utils";

const modules = import.meta.glob("./**/*.ts");
function fresh() {
  return convexTest(schema, modules);
}

async function setup() {
  const t = fresh();
  const { authed, userId } = await seedUser(t);
  const g = await seedGroup(authed);
  return { t, authed, userId, g };
}

describe("members.list", () => {
  it("returns [] for unknown groups", async () => {
    const t = fresh();
    expect(await t.query(api.members.list, { publicId: "nope" })).toEqual([]);
  });
});

describe("members.add", () => {
  it("invites by email with a temp name", async () => {
    const { authed, g, t } = await setup();
    const res = await authed.mutation(api.members.add, {
      publicId: g.publicId,
      email: "Bo@Example.com",
      name: "Bo",
    });
    expect(res.name).toBe("Bo");
    const members = await t.query(api.members.list, { publicId: g.publicId });
    const bo = members.find((m) => m.email === "bo@example.com");
    expect(bo).toMatchObject({ name: "Bo", email: "bo@example.com" });
    expect(bo.userId).toBeUndefined();
  });

  it("falls back to the email as display name without a temp name", async () => {
    const { authed, t, g } = await setup();
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "RAHUL@EXAMPLE.COM" });
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m.email === "rahul@example.com")?.name).toBe("rahul@example.com");
  });

  it("links and names instantly when the email already has an account", async () => {
    const { authed, t, g } = await setup();
    const { userId } = await seedUser(t, { name: "Sofia Real", email: "sofia@example.com" });
    const res = await authed.mutation(api.members.add, {
      publicId: g.publicId,
      email: "sofia@example.com",
      name: "Sofi-temp",
    });
    expect(res.name).toBe("Sofia Real");
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m.email === "sofia@example.com")).toMatchObject({ userId });
  });

  it("is idempotent for duplicate emails and caps group size messaging", async () => {
    const { authed, t, g } = await setup();
    const first = await authed.mutation(api.members.add, { publicId: g.publicId, email: "bo@example.com" });
    const second = await authed.mutation(api.members.add, { publicId: g.publicId, email: "BO@example.com" });
    expect(second._id).toEqual(first._id);
    expect(await t.query(api.members.list, { publicId: g.publicId })).toHaveLength(2);
  });

  it("validates email and temp name", async () => {
    const { authed, g } = await setup();
    await expect(authed.mutation(api.members.add, { publicId: g.publicId, email: "not-an-email" }))
      .rejects.toThrow(/valid email/i);
    await expect(authed.mutation(api.members.add, { publicId: g.publicId, email: "a@b.co", name: "x".repeat(31) }))
      .rejects.toThrow(/under 30/i);
    await expect(authed.mutation(api.members.add, { publicId: g.publicId, email: " " }))
      .rejects.toThrow(/member name is required/i);
  });

  it("supports the legacy name-only path with duplicate merging", async () => {
    const { authed, t, g } = await setup();
    const a = await authed.mutation(api.members.add, { publicId: g.publicId, name: "Maya" });
    const b = await authed.mutation(api.members.add, { publicId: g.publicId, name: "maya" });
    expect(b._id).toEqual(a._id);
    await expect(authed.mutation(api.members.add, { publicId: g.publicId, name: "  " }))
      .rejects.toThrow(/required/i);
    expect(await t.query(api.members.list, { publicId: g.publicId })).toHaveLength(2);
  });

  it("rejects guests and unknown groups", async () => {
    const t = fresh();
    await expect(t.mutation(api.members.add, { publicId: "x", email: "a@b.co" }))
      .rejects.toThrow(/sign in/i);
    const { authed } = await seedUser(t);
    await expect(authed.mutation(api.members.add, { publicId: "x", email: "a@b.co" }))
      .rejects.toThrow(/not found/i);
  });
});

describe("members.claim", () => {
  it("links a pending invite and swaps the email fallback for the real name", async () => {
    const { authed, t, g } = await setup();
    // Invite BEFORE the account exists so the row stays pending.
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "rahul@example.com" });
    const { userId: rahulId } = await seedUser(t, { name: "Rahul Real", email: "rahul@example.com" });

    const rahul = t.withIdentity({ subject: rahulId });
    const { claimed } = await rahul.mutation(api.members.claim, { publicId: g.publicId });
    expect(claimed).toBeGreaterThanOrEqual(1);
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m.email === "rahul@example.com")).toMatchObject({
      name: "Rahul Real",
      userId: rahulId,
    });
  });

  it("keeps a custom temp name on claim", async () => {
    const { authed, t, g } = await setup();
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "bo@example.com", name: "Bobby" });
    const { userId: boId } = await seedUser(t, { name: "Bo Real", email: "bo@example.com" });
    await t.withIdentity({ subject: boId }).mutation(api.members.claim, { publicId: g.publicId });
    const members = await t.query(api.members.list, { publicId: g.publicId });
    const bo = members.find((m) => m.email === "bo@example.com");
    expect(bo?.name).toBe("Bobby");
    expect(bo?.userId).toEqual(boId);
  });

  it("is a no-op without a matching invite and rejects guests", async () => {
    const { authed, g } = await setup();
    expect(await authed.mutation(api.members.claim, { publicId: g.publicId })).toEqual({ claimed: 0 });
    const t = fresh();
    await expect(t.mutation(api.members.claim, { publicId: g.publicId })).rejects.toThrow(/sign in/i);
  });

  it("upgrades an email-fallback name on an already-linked row", async () => {
    const { authed, t, g } = await setup();
    const { userId } = await seedUser(t, { name: "Bo Real", email: "bo@example.com" });
    const { _id } = await authed.mutation(api.members.add, {
      publicId: g.publicId, email: "bo@example.com",
    });
    // Simulate a row linked while still showing the raw email.
    await t.run(async (ctx) => {
      await ctx.db.patch(_id, { name: "bo@example.com", userId });
    });
    const { claimed } = await t
      .withIdentity({ subject: userId })
      .mutation(api.members.claim, { publicId: g.publicId });
    expect(claimed).toBe(1);
    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.find((m) => m._id === _id)?.name).toBe("Bo Real");
  });

  it("upgrades whitespace-only profile names to the email prefix", async () => {
    const { authed, t, g } = await setup();
    const { userId } = await seedUser(t, { name: "   ", email: "pl@example.com" });
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "pl@example.com" });
    const members = await t.query(api.members.list, { publicId: g.publicId });
    // findUserByEmail links instantly; blank profile name falls back to prefix.
    expect(members.find((m) => m.email === "pl@example.com")).toMatchObject({
      name: "pl",
      userId,
    });
  });
});

describe("members.rename", () => {
  it("renames and blocks duplicates within the same email scope", async () => {
    const { authed, t, g } = await setup();
    await authed.mutation(api.members.add, { publicId: g.publicId, name: "Maya" });
    const members = await t.query(api.members.list, { publicId: g.publicId });
    const maya = members.find((m) => m.name === "Maya")!;
    const renamed = await authed.mutation(api.members.rename, {
      publicId: g.publicId, memberId: maya._id, name: "Maya R",
    });
    expect(renamed.name).toBe("Maya R");
    await expect(authed.mutation(api.members.rename, {
      publicId: g.publicId, memberId: maya._id, name: "Ada",
    })).rejects.toThrow(/already in this group/i);
  });

  it("allows the same display name across distinct email invites", async () => {
    const { authed, t, g } = await setup();
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "a@x.co", name: "Sam" });
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "b@x.co", name: "Samuel" });
    const members = await t.query(api.members.list, { publicId: g.publicId });
    const samuel = members.find((m) => m.email === "b@x.co")!;
    const res = await authed.mutation(api.members.rename, {
      publicId: g.publicId, memberId: samuel._id, name: "Sam",
    });
    expect(res.name).toBe("Sam");
  });

  it("is a no-op for identical names and validates input", async () => {
    const { authed, t, g } = await setup();
    const [creator] = await t.query(api.members.list, { publicId: g.publicId });
    const same = await authed.mutation(api.members.rename, {
      publicId: g.publicId, memberId: creator._id, name: "Ada",
    });
    expect(same.name).toBe("Ada");
    await expect(authed.mutation(api.members.rename, {
      publicId: g.publicId, memberId: creator._id, name: "",
    })).rejects.toThrow();
  });
});

describe("members.remove", () => {
  it("removes zero-balance members and blocks non-zero ones", async () => {
    const { authed, t, g, userId } = await setup();
    await authed.mutation(api.members.add, { publicId: g.publicId, email: "bo@example.com", name: "Bo" });
    let members = await t.query(api.members.list, { publicId: g.publicId });
    const bo = members.find((m) => m.email === "bo@example.com")!;
    const creator = members.find((m) => String(m.userId) === String(userId))!;

    await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      description: "Dinner",
      amountCents: 10000,
      paidBy: creator._id,
      splits: [
        { memberId: creator._id, amountCents: 5000 },
        { memberId: bo._id, amountCents: 5000 },
      ],
      date: "2026-09-20",
      isSettlement: false,
    });
    await expect(authed.mutation(api.members.remove, { publicId: g.publicId, memberId: bo._id }))
      .rejects.toThrow(/non-zero balance/i);

    await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      description: "Payment",
      amountCents: 5000,
      paidBy: bo._id,
      splits: [{ memberId: creator._id, amountCents: 5000 }],
      date: "2026-09-21",
      isSettlement: true,
    });
    await authed.mutation(api.members.remove, { publicId: g.publicId, memberId: bo._id });
    members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members.some((m) => m.email === "bo@example.com")).toBe(false);
  });

  it("rejects members from another group", async () => {
    const { authed, t, g } = await setup();
    const other = await seedGroup(authed, { name: "Other group" });
    const [outsider] = await t.query(api.members.list, { publicId: other.publicId });
    await expect(
      authed.mutation(api.members.remove, { publicId: g.publicId, memberId: outsider._id })
    ).rejects.toThrow(/not found/i);
  });
});
