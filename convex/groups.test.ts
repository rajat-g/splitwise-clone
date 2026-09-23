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

describe("groups.create", () => {
  it("creates a group with secrets and a linked creator member", async () => {
    const t = fresh();
    const { authed, userId } = await seedUser(t);
    const g = await seedGroup(authed);
    expect(g.publicId).toHaveLength(21);
    expect(g.inviteCode).toHaveLength(10);

    const members = await t.query(api.members.list, { publicId: g.publicId });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      name: "Ada",
      email: "ada@example.com",
      userId,
    });
  });

  it("rejects guests", async () => {
    const t = fresh();
    await expect(
      t.mutation(api.groups.create, { name: "G", currency: "$", creatorName: "X" })
    ).rejects.toThrow(/sign in/i);
  });

  it("validates name, creator and currency", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    await expect(seedGroup(authed, { name: "  " })).rejects.toThrow(/group name/i);
    await expect(seedGroup(authed, { creatorName: " " })).rejects.toThrow(/your name/i);
    await expect(seedGroup(authed, { currency: "XYZ" })).rejects.toThrow(/currency/i);
  });

  it("allows every supported currency", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    for (const currency of ["€", "₹", "CHF"]) {
      const g = await seedGroup(authed, { currency, name: `G ${currency}` });
      expect(g.publicId).toBeTruthy();
    }
  });
});

describe("groups.getByPublicId / getByCode", () => {
  it("returns the group and resolves dashed codes case-insensitively", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    const g = await seedGroup(authed);
    const fetched = await t.query(api.groups.getByPublicId, { publicId: g.publicId });
    expect(fetched).toMatchObject({ name: "Goa Trip", currency: "$" });

    const code = g.inviteCode;
    const dashed = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`.toLowerCase();
    const resolved = await t.query(api.groups.getByCode, { code: dashed });
    expect(resolved).toEqual({ publicId: g.publicId });
  });

  it("returns null / throws for unknown groups and bad codes", async () => {
    const t = fresh();
    expect(await t.query(api.groups.getByPublicId, { publicId: "nope" })).toBeNull();
    expect(await t.query(api.groups.getByCode, { code: "AAAAAAAAAA" })).toBeNull();
    await expect(t.query(api.groups.getByCode, { code: "short" })).rejects.toThrow(/invalid invite/i);
  });
});

describe("groups.myGroups", () => {
  it("lists only the caller's groups, newest first", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    const { authed: other } = await seedUser(t, { name: "Bo", email: "bo@example.com" });
    await seedGroup(authed, { name: "First" });
    await seedGroup(authed, { name: "Second" });
    await other.mutation(api.groups.create, { name: "Other", currency: "$", creatorName: "Bo" });

    // Force distinct timestamps (both groups are created within one ms).
    const mine = await authed.query(api.groups.myGroups, {});
    await t.run(async (ctx) => {
      for (const gr of mine) {
        await ctx.db.patch(gr._id, { createdAt: gr.name === "Second" ? 2000 : 1000 });
      }
    });
    const ordered = await authed.query(api.groups.myGroups, {});
    expect(ordered.map((g) => g.name)).toEqual(["Second", "First"]);
  });

  it("returns [] for guests", async () => {
    const t = fresh();
    expect(await t.query(api.groups.myGroups, {})).toEqual([]);
  });
});

describe("groups.rotateCode", () => {
  it("issues a fresh code and invalidates the old one", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    const g = await seedGroup(authed);
    const { inviteCode } = await authed.mutation(api.groups.rotateCode, { publicId: g.publicId });
    expect(inviteCode).not.toBe(g.inviteCode);
    expect(inviteCode).toHaveLength(10);
    expect(await t.query(api.groups.getByCode, { code: g.inviteCode })).toBeNull();
    expect(await t.query(api.groups.getByCode, { code: inviteCode })).toEqual({ publicId: g.publicId });
  });

  it("rejects guests and unknown groups", async () => {
    const t = fresh();
    await expect(t.mutation(api.groups.rotateCode, { publicId: "x" })).rejects.toThrow(/sign in/i);
    const { authed } = await seedUser(t);
    await expect(authed.mutation(api.groups.rotateCode, { publicId: "x" })).rejects.toThrow(/not found/i);
  });

  it("fails code generation under total collision", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    const g = await seedGroup(authed, { name: "One" });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("groups")
        .withIndex("by_publicId", (q) => q.eq("publicId", g.publicId))
        .first();
      await ctx.db.patch(row!._id, { inviteCode: "AAAAAAAAAA" });
    });
    const rand = Math.random;
    Math.random = () => 0;
    try {
      await expect(seedGroup(authed, { name: "Two" })).rejects.toThrow(/invite code/i);
    } finally {
      Math.random = rand;
    }
  });
});
