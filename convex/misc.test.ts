/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { seedGroup, seedUser } from "./testUtils";

const modules = import.meta.glob("./**/*.ts");
function fresh() {
  return convexTest(schema, modules);
}

describe("users.viewer", () => {
  it("returns null for guests and profile for members", async () => {
    const t = fresh();
    expect(await t.query(api.users.viewer, {})).toBeNull();
    const { authed } = await seedUser(t);
    expect(await authed.query(api.users.viewer, {})).toMatchObject({
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });
});

describe("users.updateName", () => {
  it("updates and validates", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    await authed.mutation(api.users.updateName, { name: "  Ada L  " });
    expect(await authed.query(api.users.viewer, {})).toMatchObject({ name: "Ada L" });
    await expect(authed.mutation(api.users.updateName, { name: "   " })).rejects.toThrow(/required/i);
    await expect(t.mutation(api.users.updateName, { name: "Bo" })).rejects.toThrow(/signed in/i);
  });
});

describe("wipe.wipeAll", () => {
  it("refuses without the confirmation string", async () => {
    const t = fresh();
    await expect(t.mutation(internal.wipe.wipeAll, { confirm: "please" }))
      .rejects.toThrow(/refusing/i);
  });

  it("deletes every app and auth row and reports counts", async () => {
    const t = fresh();
    const { authed } = await seedUser(t);
    const g = await seedGroup(authed);
    const members = await t.query(api.members.list, { publicId: g.publicId });
    await authed.mutation(api.expenses.add, {
      publicId: g.publicId,
      description: "Dinner",
      amountCents: 1000,
      paidBy: members[0]._id,
      splits: [{ memberId: members[0]._id, amountCents: 1000 }],
      date: "2026-09-20",
      isSettlement: false,
    });

    const counts = await t.mutation(internal.wipe.wipeAll, { confirm: "WIPE-EVERYTHING" });
    expect(counts.groups).toBe(1);
    expect(counts.members).toBe(1);
    expect(counts.expenses).toBe(1);
    expect(counts.users).toBe(1);
    expect(await t.query(api.members.list, { publicId: g.publicId })).toEqual([]);
    expect(await t.query(api.expenses.list, { publicId: g.publicId })).toEqual([]);
    expect(await t.query(api.users.viewer, {})).toBeNull();
  });
});
