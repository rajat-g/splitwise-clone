import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDeviceId,
  getDisplayName,
  getRecentGroups,
  removeRecentGroup,
  saveRecentGroup,
  setDisplayName,
} from "./identity";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("device id", () => {
  it("creates and persists a stable id", () => {
    const first = getDeviceId();
    expect(first).toBeTruthy();
    expect(getDeviceId()).toBe(first);
  });
  it("falls back when randomUUID is unavailable", () => {
    const orig = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    const id = getDeviceId();
    expect(id).toMatch(/^dev-/);
    vi.stubGlobal("crypto", orig);
  });
});

describe("display name", () => {
  it("defaults to empty and trims on save", () => {
    expect(getDisplayName()).toBe("");
    setDisplayName("  Priya  ");
    expect(getDisplayName()).toBe("Priya");
  });
});

describe("recent groups", () => {
  it("returns [] when empty or corrupt", () => {
    expect(getRecentGroups()).toEqual([]);
    localStorage.setItem("splitwise-clone:recentGroups", "{broken");
    expect(getRecentGroups()).toEqual([]);
  });
  it("dedupes, prepends and caps at 20", () => {
    for (let i = 0; i < 25; i++) {
      saveRecentGroup({ id: `g${i}`, name: `G${i}`, inviteCode: `C${i}` });
    }
    const list = getRecentGroups();
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe("g24");
    saveRecentGroup({ id: "g24", name: "G24", inviteCode: "C24" });
    expect(getRecentGroups()[0].id).toBe("g24");
    expect(getRecentGroups()).toHaveLength(20);
  });
  it("stamps joinedAt and removes by id", () => {
    saveRecentGroup({ id: "g1", name: "Goa", inviteCode: "AB" });
    expect(getRecentGroups()[0].joinedAt).toEqual(expect.any(Number));
    removeRecentGroup("g1");
    expect(getRecentGroups()).toEqual([]);
    removeRecentGroup("missing");
    expect(getRecentGroups()).toEqual([]);
  });
});
