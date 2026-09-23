import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY,
  EXPENSE_CATEGORIES,
  categoryColor,
  categoryLabel,
  categoryTone,
  isValidCategory,
  normalizeCategory,
} from "./categories";

describe("EXPENSE_CATEGORIES", () => {
  it("has stable unique ids with labels, tones and colors", () => {
    expect(EXPENSE_CATEGORIES.length).toBeGreaterThan(0);
    const ids = EXPENSE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of EXPENSE_CATEGORIES) {
      expect(c.label).toBeTruthy();
      expect(["neutral", "teal", "emerald", "amber", "rose"]).toContain(c.tone);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("includes an 'other' default", () => {
    expect(DEFAULT_CATEGORY).toBe("other");
    expect(ids()).toContain("other");
    function ids() { return EXPENSE_CATEGORIES.map((c) => c.id); }
  });
});

describe("normalizeCategory", () => {
  it("lowercases and trims", () => {
    expect(normalizeCategory(" Food ")).toBe("food");
    expect(normalizeCategory("GROCERIES")).toBe("groceries");
  });
  it("falls back for missing or unknown input", () => {
    expect(normalizeCategory(undefined)).toBe("other");
    expect(normalizeCategory("bogus")).toBe("other");
    expect(normalizeCategory("bogus", "food")).toBe("food");
  });
});

describe("isValidCategory", () => {
  it("accepts known ids case-insensitively", () => {
    expect(isValidCategory("travel")).toBe(true);
    expect(isValidCategory(" Travel ")).toBe(true);
  });
  it("rejects unknown and non-string input", () => {
    expect(isValidCategory("bogus")).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
    expect(isValidCategory(42)).toBe(false);
  });
});

describe("categoryLabel / categoryTone / categoryColor", () => {
  it("resolves known categories", () => {
    expect(categoryLabel("food")).toBe("Food & Drinks");
    expect(categoryTone("food")).toBe("amber");
    expect(categoryColor("food")).toBe("#f59e0b");
  });
  it("falls back to Other for unknown input", () => {
    expect(categoryLabel("nope")).toBe("Other");
    expect(categoryTone("nope")).toBe("neutral");
    expect(categoryColor(undefined)).toBe("#94a3b8");
  });
});

describe("round-trip", () => {
  it("every category normalizes to itself", () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(normalizeCategory(c.id)).toBe(c.id);
      expect(isValidCategory(c.id)).toBe(true);
    }
  });

  it("handles null input like missing input", () => {
    expect(normalizeCategory(null)).toBe("other");
    expect(isValidCategory(null)).toBe(false);
    expect(categoryLabel(null)).toBe("Other");
    expect(categoryTone(null)).toBe("neutral");
    expect(categoryColor(null)).toBe("#94a3b8");
  });
});
