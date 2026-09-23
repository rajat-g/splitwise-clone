// No-login identity: display name + stable device id stored locally.
// The "user" is just a name attached to members/expenses. No password, no signup.

const NAME_KEY = "splitwise-clone:displayName";
const DEVICE_KEY = "splitwise-clone:deviceId";
const RECENT_KEY = "splitwise-clone:recentGroups";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getDisplayName() {
  return localStorage.getItem(NAME_KEY) || "";
}

export function setDisplayName(name) {
  localStorage.setItem(NAME_KEY, name.trim());
}

export function getRecentGroups() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveRecentGroup(group) {
  const list = getRecentGroups().filter((g) => g.id !== group.id);
  list.unshift({ id: group.id, name: group.name, inviteCode: group.inviteCode, joinedAt: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
}

export function removeRecentGroup(id) {
  const list = getRecentGroups().filter((g) => g.id !== id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}
