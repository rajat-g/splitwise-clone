// Default expense categories. IDs are stable lowercase strings stored on the
// expense doc; labels/tones are presentation-only and safe to change.

export const EXPENSE_CATEGORIES = [
  { id: "food", label: "Food & Drinks", tone: "amber", color: "#f59e0b" },
  { id: "groceries", label: "Groceries", tone: "emerald", color: "#10b981" },
  { id: "travel", label: "Travel", tone: "teal", color: "#14b8a6" },
  { id: "transport", label: "Transport", tone: "teal", color: "#0ea5e9" },
  { id: "shopping", label: "Shopping", tone: "rose", color: "#f43f5e" },
  { id: "entertainment", label: "Entertainment", tone: "rose", color: "#8b5cf6" },
  { id: "utilities", label: "Utilities", tone: "neutral", color: "#64748b" },
  { id: "rent", label: "Rent & Housing", tone: "neutral", color: "#6366f1" },
  { id: "health", label: "Health", tone: "emerald", color: "#ec4899" },
  { id: "other", label: "Other", tone: "neutral", color: "#94a3b8" },
];

export const DEFAULT_CATEGORY = "other";

const byId = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export function isValidCategory(id) {
  return typeof id === "string" && !!byId[id.trim().toLowerCase()];
}

export function normalizeCategory(id, fallback = DEFAULT_CATEGORY) {
  const c = String(id ?? "").trim().toLowerCase();
  return byId[c] ? c : fallback;
}

export function categoryLabel(id) {
  const c = String(id ?? "").trim().toLowerCase();
  return byId[c]?.label ?? byId[DEFAULT_CATEGORY].label;
}

export function categoryTone(id) {
  const c = String(id ?? "").trim().toLowerCase();
  return byId[c]?.tone ?? "neutral";
}

export function categoryColor(id) {
  const c = String(id ?? "").trim().toLowerCase();
  return byId[c]?.color ?? byId[DEFAULT_CATEGORY].color;
}
