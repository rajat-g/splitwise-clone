/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import authConfig from "./auth.config";
import { auth } from "./auth";
import http from "./http";
import schema from "./schema";
import { seedUser } from "./test-utils";

const modules = import.meta.glob("./**/*.ts");

describe("project config", () => {
  it("declares the convex auth provider", () => {
    expect(authConfig.providers).toHaveLength(1);
    expect(authConfig.providers[0]).toMatchObject({ applicationID: "convex" });
  });

  it("exposes auth handlers and the http router", () => {
    expect(auth).toBeTruthy();
    expect(typeof http.route).toBe("function");
  });

  it("defines the app tables with indexes", () => {
    expect(Object.keys(schema.tables)).toEqual(
      expect.arrayContaining(["groups", "members", "expenses", "activity", "users"])
    );
  });

  it("resolves actor names from the session", async () => {
    const t = convexTest(schema, modules);
    const { authed } = await seedUser(t);
    const { resolveActorName } = await import("./identity");
    expect(await authed.run((ctx) => resolveActorName(ctx as never))).toBe("Ada Lovelace");

    const emailOnly = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { email: "noname@example.com" });
    });
    expect(
      await t.withIdentity({ subject: emailOnly }).run((ctx) => resolveActorName(ctx as never))
    ).toBe("noname");
    expect(await t.run((ctx) => resolveActorName(ctx as never))).toBe("Someone");
  });
});

describe("users fallbacks", () => {
  it("falls back to null profile fields", async () => {
    const t = convexTest(schema, modules);
    const bare = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {});
    });
    expect(
      await t.withIdentity({ subject: bare }).query(api.users.viewer, {})
    ).toMatchObject({ email: null, name: null });
  });

  it("returns null for deleted accounts", async () => {
    const t = convexTest(schema, modules);
    const ghost = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "Ghost" });
      await ctx.db.delete(id);
      return id;
    });
    expect(await t.withIdentity({ subject: ghost }).query(api.users.viewer, {})).toBeNull();
  });
});
