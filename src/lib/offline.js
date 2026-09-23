// Offline outbox + snapshot cache (localStorage).
//
// - Outbox: expense add/update/remove ops queued while offline, replayed in
//   FIFO order when back online. Updates to a not-yet-synced add are merged
//   into it; removing a not-yet-synced add just drops it.
// - Snapshots: last-known group data so groups stay viewable offline.

import { useSyncExternalStore } from "react";

const OUTBOX_KEY = "fairsplit:outbox:v1";
const SNAP_PREFIX = "fairsplit:snap:v1:";
const MAX_SNAP_EXPENSES = 300;

export function newOpId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function newTempId() {
  return `tmp-${newOpId()}`;
}

export function isTempId(id) {
  return String(id || "").startsWith("tmp-");
}

function readOutbox() {
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

let outbox = readOutbox();
const listeners = new Set();
function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore listener errors
    }
  });
}
function persist() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // storage full/blocked: keep in-memory copy so the session still works
  }
  emit();
}

export function subscribeOutbox(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function getOutbox() {
  return outbox;
}
export function useOutbox() {
  return useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);
}

/** Ops for a group. Failed ops included by default so the UI can show them. */
export function opsForGroup(publicId, { includeFailed = true } = {}) {
  return filterGroupOps(outbox, publicId, { includeFailed });
}

/** List-based variant for React memos (takes the useOutbox() value). */
export function filterGroupOps(list, publicId, { includeFailed = true } = {}) {
  return (list || []).filter(
    (o) =>
      o.groupPublicId === publicId &&
      (o.status === "pending" || o.status === "syncing" || (includeFailed && o.status === "failed"))
  );
}

export function pendingCountForGroup(publicId) {
  return countPendingOps(outbox, publicId);
}

/** List-based variant for React memos (takes the useOutbox() value). */
export function countPendingOps(list, publicId) {
  return (list || []).filter((o) => o.groupPublicId === publicId && o.status === "pending").length;
}

export function enqueueAdd(publicId, entry) {
  const op = {
    opId: newOpId(),
    groupPublicId: publicId,
    kind: "add",
    tempId: newTempId(),
    clientId: newOpId(),
    entry,
    createdAt: Date.now(),
    status: "pending",
    error: "",
  };
  outbox = [...outbox, op];
  persist();
  return op.tempId;
}

export function enqueueUpdate(publicId, expenseId, patch) {
  const id = String(expenseId);
  const { isSettlement, ...rest } = patch;
  void isSettlement;
  const addOp = outbox.find(
    (o) => o.groupPublicId === publicId && o.kind === "add" && o.tempId === id && o.status !== "syncing"
  );
  if (addOp) {
    addOp.entry = { ...addOp.entry, ...rest };
    outbox = [...outbox];
    persist();
    return id;
  }
  const updOp = outbox.find(
    (o) =>
      o.groupPublicId === publicId &&
      o.kind === "update" &&
      String(o.expenseId) === id &&
      o.status !== "syncing"
  );
  if (updOp) {
    updOp.patch = { ...updOp.patch, ...rest };
    outbox = [...outbox];
    persist();
    return id;
  }
  outbox = [
    ...outbox,
    {
      opId: newOpId(),
      groupPublicId: publicId,
      kind: "update",
      expenseId: id,
      patch: rest,
      createdAt: Date.now(),
      status: "pending",
      error: "",
    },
  ];
  persist();
  return id;
}

export function enqueueRemove(publicId, expenseId) {
  const id = String(expenseId);
  const addIdx = outbox.findIndex(
    (o) => o.groupPublicId === publicId && o.kind === "add" && o.tempId === id && o.status !== "syncing"
  );
  if (addIdx >= 0) {
    // Never reached the server — just drop it (plus any merged edits).
    outbox = outbox.filter((_, i) => i !== addIdx);
    persist();
    return "dropped";
  }
  outbox = outbox.filter(
    (o) => !(o.groupPublicId === publicId && o.kind === "update" && String(o.expenseId) === id)
  );
  if (
    !outbox.some(
      (o) =>
        o.groupPublicId === publicId &&
        o.kind === "remove" &&
        String(o.expenseId) === id &&
        o.status !== "syncing"
    )
  ) {
    outbox = [
      ...outbox,
      {
        opId: newOpId(),
        groupPublicId: publicId,
        kind: "remove",
        expenseId: id,
        createdAt: Date.now(),
        status: "pending",
        error: "",
      },
    ];
  }
  persist();
  return "queued";
}

export function markOp(opId, patch) {
  outbox = outbox.map((o) => (o.opId === opId ? { ...o, ...patch } : o));
  persist();
}

export function dropOp(opId) {
  outbox = outbox.filter((o) => o.opId !== opId);
  persist();
}

export function retryOp(opId) {
  markOp(opId, { status: "pending", error: "" });
}

/** Layer queued ops over server/cached expenses for display + balances. */
export function applyOutboxToExpenses(base, ops) {
  const removes = new Set(
    ops.filter((o) => o.kind === "remove").map((o) => String(o.expenseId))
  );
  const updates = new Map();
  for (const o of ops) {
    if (o.kind === "update") updates.set(String(o.expenseId), o.patch);
  }
  const rows = [];
  for (const e of base || []) {
    const id = String(e._id ?? e.id);
    if (removes.has(id)) continue;
    const patch = updates.get(id);
    rows.push(patch ? { ...e, ...patch, _queued: true } : e);
  }
  for (const o of ops) {
    if (o.kind !== "add") continue;
    rows.push({
      _id: o.tempId,
      ...o.entry,
      createdByName: "You",
      createdAt: o.createdAt,
      updatedAt: o.createdAt,
      _queued: true,
    });
  }
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows;
}

export function saveSnapshot(publicId, data) {
  try {
    localStorage.setItem(
      SNAP_PREFIX + publicId,
      JSON.stringify({
        savedAt: Date.now(),
        group: data.group,
        members: data.members,
        expenses: (data.expenses || []).slice(0, MAX_SNAP_EXPENSES),
        activity: (data.activity || []).slice(0, 100),
      })
    );
  } catch {
    // ignore quota errors
  }
}

export function loadSnapshot(publicId) {
  try {
    const raw = localStorage.getItem(SNAP_PREFIX + publicId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
