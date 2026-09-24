// TEMPORARY design-preview harness (deleted before shipping).
import React from "react";

const now = Date.now();
const H = 3600_000;

export const MOCK = {
  group: { _id: "g1", publicId: "demo-group", name: "Goa Trip", currency: "$", inviteCode: "KX7Q9M2PAB" },
  members: [
    { _id: "m1", name: "Priya", email: "priya@example.com", userId: "u1", createdAt: now - 5 * 24 * H },
    { _id: "m2", name: "Arjun Mehta", email: "arjun@example.com", userId: "u2", createdAt: now - 5 * 24 * H },
    { _id: "m3", name: "Sofia", email: "sofia@example.com", createdAt: now - 4 * 24 * H },
    { _id: "m4", name: "rahul@example.com", email: "rahul@example.com", createdAt: now - 3 * 24 * H },
  ],
  expenses: [
    { _id: "e1", description: "Beachside dinner", amountCents: 480000, paidBy: "m1", splits: [{ memberId: "m1", amountCents: 120000 }, { memberId: "m2", amountCents: 120000 }, { memberId: "m3", amountCents: 120000 }, { memberId: "m4", amountCents: 120000 }], date: "2026-09-12", category: "food", splitMode: "equal", isSettlement: false, createdByName: "Priya", createdAt: now - 26 * H, updatedAt: now - 26 * H },
    { _id: "e2", description: "Scooter rental", amountCents: 180000, paidBy: "m2", splits: [{ memberId: "m2", amountCents: 90000 }, { memberId: "m4", amountCents: 90000 }], date: "2026-09-13", category: "transport", splitMode: "equal", isSettlement: false, createdByName: "Arjun Mehta", createdAt: now - 20 * H, updatedAt: now - 20 * H },
    { _id: "e3", description: "Payment: Rahul → Priya", amountCents: 120000, paidBy: "m4", splits: [{ memberId: "m1", amountCents: 120000 }], date: "2026-09-14", isSettlement: true, createdByName: "Rahul", createdAt: now - 8 * H, updatedAt: now - 8 * H },
    { _id: "e4", description: "Groceries for the villa", amountCents: 325050, paidBy: "m3", splits: [{ memberId: "m1", amountCents: 8125 * 10 }, { memberId: "m2", amountCents: 8125 * 10 }, { memberId: "m3", amountCents: 8125 * 10 }, { memberId: "m4", amountCents: 8125 * 10 + 50 }], date: "2026-09-15", category: "groceries", splitMode: "exact", isSettlement: false, createdByName: "Sofia", createdAt: now - 2 * H, updatedAt: now - 2 * H },
  ],
  activity: [
    { _id: "a1", type: "expense_added", text: "Sofia added “Groceries for the villa” (3250.50)", actorName: "Sofia", createdAt: now - 2 * H },
    { _id: "a2", type: "settle", text: "Rahul recorded a payment of 1200.00", actorName: "Rahul", createdAt: now - 8 * H },
    { _id: "a3", type: "expense_added", text: "Arjun Mehta added “Scooter rental” (1800.00)", actorName: "Arjun Mehta", createdAt: now - 20 * H },
    { _id: "a4", type: "expense_added", text: "Priya added “Beachside dinner” (4800.00)", actorName: "Priya", createdAt: now - 26 * H },
    { _id: "a5", type: "member_added", text: "Rahul joined the group", actorName: "Rahul", createdAt: now - 3 * 24 * H },
  ],
};

export function ConvexProvider({ children }) {
  return <>{children}</>;
}
export class ConvexReactClient {
  constructor() {}
}

export function useQuery(queryFn, args) {
  if (queryFn === "skip" || args === "skip") return undefined;
  const name = queryFn?.__mockName;
  switch (name) {
    case "groups.getByPublicId": return MOCK.group;
    case "groups.getByCode": return { publicId: "demo-group" };
    case "members.list": return MOCK.members;
    case "expenses.list": return MOCK.expenses;
    case "expenses.activity": return MOCK.activity;
    default: return undefined;
  }
}

export function usePaginatedQuery(queryFn, args) {
  return {
    results: useQuery(queryFn, args) ?? [],
    status: "Exhausted",
    loadMore: () => false,
  };
}

export function useMutation(queryFn) {
  const name = queryFn?.__mockName;
  return async () => {
    if (name === "groups.create") return { publicId: "demo-group", inviteCode: "KX7Q9M2PAB" };
    if (name === "groups.rotateCode") return { inviteCode: "QWERTYUIOP" };
    return {};
  };
}
