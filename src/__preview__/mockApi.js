// TEMPORARY design-preview harness (deleted before shipping).
// Mirrors the real `convex/_generated/api` shape with callable sentinels.
function fn(name) {
  const f = (...args) => ({ __mockQuery: name, args });
  f.__mockName = name;
  return f;
}

export const api = {
  groups: {
    create: fn("groups.create"),
    getByPublicId: fn("groups.getByPublicId"),
    getByCode: fn("groups.getByCode"),
    rotateCode: fn("groups.rotateCode"),
  },
  members: {
    list: fn("members.list"),
    add: fn("members.add"),
    rename: fn("members.rename"),
    claim: fn("members.claim"),
    remove: fn("members.remove"),
  },
  expenses: {
    list: fn("expenses.list"),
    activity: fn("expenses.activity"),
    add: fn("expenses.add"),
    update: fn("expenses.update"),
    remove: fn("expenses.remove"),
  },
};
