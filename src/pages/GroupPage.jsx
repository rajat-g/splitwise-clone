import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAction, useConvex, useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { computeBalances, simplifyDebts, fmt, toCents, splitsMapToArray, expenseToForm, fromCents, formatInviteCode, localDateString } from "../lib/split";
import { EXPENSE_CATEGORIES, categoryLabel, categoryTone, normalizeCategory } from "../lib/categories";
import { getDeviceId, saveRecentGroup } from "../lib/identity";
import { useOnline } from "../lib/useOnline";
import {
  applyOutboxToExpenses, countPendingOps, dropOp, enqueueAdd, enqueueRemove, enqueueUpdate,
  filterGroupOps, loadSnapshot, newOpId, opBelongsTo, retryOp, saveSnapshot, useOutbox,
} from "../lib/offline";
import { syncOutbox } from "../lib/sync";
import { Alert, Avatar, AvatarStack, Badge, Button, Card, EmptyState, Icon, LiveDot, Progress, SectionTitle, Select, SkeletonRows, Stat, Tabs, TextInput } from "../components/ui";
import { AuthDialog } from "../components/Auth";
import { OutboxBar } from "../components/OutboxBar";
import ExpenseModal from "../components/ExpenseModal";
import SettleModal from "../components/SettleModal";
import { DetailedSummary, SimplifiedDebts } from "../components/Summary";
const Insights = lazy(() => import("../components/Insights"));

const mid = (m) => String(m._id ?? m.id);

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - Number(ts)) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(Number(ts)).toLocaleDateString();
}

function Money({ value, currency, className = "" }) {
  return <span className={`tnum ${className}`}>{fmt(value, currency)}</span>;
}

const MAX_MEMBER_NAME = 30;
const MAX_MEMBERS_PER_GROUP = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const memberEmail = (m) => String(m?.email ?? "").trim().toLowerCase();
const isPendingInvite = (m) => !!memberEmail(m) && !m.userId;
// Display name is stored server-side: temp name, real profile name, or the
// email itself as fallback. The email subtitle below disambiguates dupes.
const displayOf = (m) => m?.name || memberEmail(m) || "Unknown";

// Client-side mirror of the server rules in convex/members.ts. The server
// re-validates everything — this is only for instant inline feedback.
// Member scope is always this group; there is no cross-group lookup.
function validateMemberName(t, membersList, editingMember = null) {
  if (!t) return "Enter a name first.";
  if (t.length > MAX_MEMBER_NAME) return `Keep names under ${MAX_MEMBER_NAME} characters.`;
  if (/[\n\r\t]/.test(t)) return "Names can't contain line breaks or tabs.";
  if (!editingMember && membersList.length >= MAX_MEMBERS_PER_GROUP) return `Groups are capped at ${MAX_MEMBERS_PER_GROUP} members.`;
  const editingEmail = editingMember ? memberEmail(editingMember) : "";
  const dup = membersList.some((m) => {
    if (editingMember && String(m._id ?? m.id) === String(editingMember._id ?? editingMember.id)) return false;
    if (String(m.name || "").toLowerCase() !== t.toLowerCase()) return false;
    const otherEmail = memberEmail(m);
    // Same display name is fine across distinct email invites — the email
    // subtitle keeps the UI clean and unambiguous.
    if (editingEmail && otherEmail && editingEmail !== otherEmail) return false;
    return true;
  });
  if (dup) return `${t} is already in this group.`;
  return "";
}

function validateInvite(emailRaw, tempRaw, membersList) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const temp = String(tempRaw ?? "").trim();
  if (!email) return "Enter an email address first.";
  if (email.length > 254) return "That email looks too long.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  if (temp) {
    if (temp.length > MAX_MEMBER_NAME) return `Keep temp names under ${MAX_MEMBER_NAME} characters.`;
    if (/[\n\r\t]/.test(temp)) return "Temp names can't contain line breaks or tabs.";
  }
  const duplicate = membersList.find((m) => memberEmail(m) === email);
  if (duplicate && duplicate.status === "active") return `${email} is already in this group.`;
  if (!duplicate && membersList.length >= MAX_MEMBERS_PER_GROUP) return `Groups are capped at ${MAX_MEMBERS_PER_GROUP} members.`;
  return "";
}

export default function GroupPage() {
  const { id: publicId } = useParams();
  const online = useOnline();
  const group = useQuery(api.groups.getByPublicId, { publicId });
  const members = useQuery(api.members.list, { publicId });
  const { results: expensePages, status: expensePageStatus, loadMore } = usePaginatedQuery(
    api.expenses.list,
    online ? { publicId } : "skip",
    { initialNumItems: 100 }
  );
  const expenses = expensePageStatus === "Exhausted" ? expensePages : undefined;
  const activity = useQuery(api.expenses.activity, { publicId });

  const addMember = useMutation(api.members.add);
  const renameMember = useMutation(api.members.rename);
  const removeMemberM = useAction(api.members.remove);
  const claimInvite = useMutation(api.members.claim);
  const joinGroupM = useMutation(api.members.join);
  const addExpense = useMutation(api.expenses.add);
  const updateExpense = useMutation(api.expenses.update);
  const deleteExpense = useMutation(api.expenses.remove);
  const rotateCode = useMutation(api.groups.rotateCode);

  const [tab, setTab] = useState("expenses");
  const [error, setError] = useState("");
  const [showExpense, setShowExpense] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showSettle, setShowSettle] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [memberError, setMemberError] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const convexClient = useConvex();
  const allOps = useOutbox();

  // Fetch every bounded page so balances, summaries, and exports still use
  // the complete ledger rather than silently omitting older transactions.
  useEffect(() => {
    if (online && expensePageStatus === "CanLoadMore") loadMore(100);
  }, [online, expensePageStatus, loadMore]);

  // Identity boundary: the device outbox is shared across accounts, so the
  // group queue is split — allGroupOps (explains the OutboxBar, incl.
  // foreign/orphaned rows) vs myGroupOps (the ONLY set layered into the
  // visible expenses, balances and counts). Another account's pending data
  // must never render here.
  const allGroupOps = useMemo(() => filterGroupOps(allOps, publicId), [allOps, publicId]);
  const myGroupOps = useMemo(
    () => allGroupOps.filter((o) => opBelongsTo(o, viewer?._id ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allGroupOps, viewer?._id]
  );
  // Only MY pending ops trigger auto-sync — another account's queued writes
  // on this device wait for their session (identity boundary).
  const pendingOnly = useMemo(
    () => countPendingOps(allOps, publicId, viewer?._id ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOps, publicId, viewer?._id]
  );
  const snapForRender = useMemo(
    () => (!online ? loadSnapshot(publicId, viewer?._id ?? null) : null),
    [online, publicId, viewer?._id]
  );
  const visibleExpenses = useMemo(
    () => applyOutboxToExpenses(expenses ?? snapForRender?.expenses ?? [], myGroupOps),
    [expenses, snapForRender, myGroupOps]
  );
  const visibleMembers = useMemo(
    () => members ?? snapForRender?.members ?? [],
    [members, snapForRender]
  );
  const filteredExpenses = useMemo(() => {
    if (catFilter === "all") return visibleExpenses;
    return visibleExpenses.filter(
      (e) => !e.isSettlement && normalizeCategory(e.category) === catFilter
    );
  }, [visibleExpenses, catFilter]);

  // Cache the last live copy so the group stays viewable offline.
  useEffect(() => {
    if (group && members && expenses && activity) {
      saveSnapshot(publicId, {
        group: {
          _id: group._id, publicId: group.publicId, name: group.name,
          currency: group.currency, inviteCode: group.inviteCode,
          ownerUserId: group.ownerUserId,
        },
        members, expenses, activity,
      }, viewer?._id ?? null);
    }
  }, [publicId, group, members, expenses, activity, viewer?._id]);

  useEffect(() => {
    if (group) saveRecentGroup({ id: publicId, name: group.name, inviteCode: group.inviteCode });
  }, [publicId, group]);

  const runSync = useCallback(async ({ includeFailed = false } = {}) => {
    if (!online || !isAuthenticated || syncing) return { synced: 0, total: 0 };
    setSyncing(true);
    try {
      return await syncOutbox(convexClient, publicId, { includeFailed, userId: viewer?._id ?? null });
    } finally {
      setSyncing(false);
    }
  }, [online, isAuthenticated, syncing, convexClient, publicId, viewer?._id]);

  // Auto-sync queued ops whenever we're back online and signed in.
  useEffect(() => {
    if (!online || !isAuthenticated || syncing || pendingOnly === 0) return;
    runSync({ includeFailed: false });
  }, [online, isAuthenticated, syncing, pendingOnly, runSync]);

  const balances = useMemo(
    () => computeBalances(visibleMembers, visibleExpenses),
    [visibleMembers, visibleExpenses]
  );
  const settlements = useMemo(() => simplifyDebts(balances), [balances]);
  const totalCents = useMemo(
    () => visibleExpenses.filter((e) => !e.isSettlement).reduce((a, e) => a + (e.amountCents || 0), 0),
    [visibleExpenses]
  );
  const expenseCount = visibleExpenses.filter((e) => !e.isSettlement).length;
  const settlementCount = visibleExpenses.filter((e) => e.isSettlement).length;
  const nameOf = (id) => {
    const m = visibleMembers?.find((x) => String(x._id) === String(id));
    return m ? displayOf(m) : "Unknown";
  };

  // If this device's signed-in email matches a pending invite in this group,
  // link it and swap the email fallback for the real profile name.
  useEffect(() => {
    if (!isAuthenticated || !online || !viewer?.email || !members?.length) return;
    const email = String(viewer.email).trim().toLowerCase();
    const pending = members.some(
      (m) => String(m.email ?? "").trim().toLowerCase() === email && !m.userId
    );
    if (!pending) return;
    claimInvite({ publicId }).catch(() => {});
  }, [isAuthenticated, online, viewer?.email, members, publicId, claimInvite]);

  // Attribution ("who did this") is stamped server-side from the session —
  // the client never supplies an actor name.
  const requireAccount = () => {
    if (!isAuthenticated) {
      setError("Sign in to add transactions. Guests can view only.");
      setAuthOpen(true);
      return false;
    }
    return true;
  };

  const requireQueueIdentity = () => {
    if (!viewer?._id) {
      setError("Your account is still loading. Try again in a moment.");
      return null;
    }
    return viewer._id;
  };

  const waitingServer = group === undefined || members === undefined || expenses === undefined;
  if (waitingServer && !snapForRender) {
    if (!online) {
      return (
        <div className="space-y-4">
          <Card className="p-8 text-center sm:p-12">
            <EmptyState
              icon={<Icon.Clock className="h-6 w-6" />}
              title="You're offline"
              body="This group hasn't been opened on this device yet, so there's no saved copy to show. Reconnect to load it — then it stays viewable offline."
              action={<Button onClick={() => window.location.reload()}>Retry</Button>}
            />
          </Card>
        </div>
      );
    }
    return (
      <div className="space-y-4" aria-busy="true">
        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-teal-700/20 via-teal-600/10 to-sky-500/10 dark:from-teal-400/10" />
          <div className="animate-pulse space-y-3 p-5 sm:p-6">
            <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-white/10" />
            <div className="h-4 w-72 max-w-full rounded bg-slate-100 dark:bg-white/5" />
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
              {[0,1,2,3].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-100 dark:bg-white/5" />)}
            </div>
          </div>
        </Card>
        <Card className="p-5 sm:p-6"><SkeletonRows rows={5} /></Card>
      </div>
    );
  }

  if (group === null) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <EmptyState
          icon={<Icon.Receipt className="h-6 w-6" />}
          title="This group didn't open"
          body="The link may be mistyped, or the group was never created. Groups open only with the exact invite from the owner."
          action={<a href="/"><Button>Go home</Button></a>}
        />
      </Card>
    );
  }

  const renderGroup = group ?? snapForRender?.group;
  if (!renderGroup) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <EmptyState
          icon={<Icon.Receipt className="h-6 w-6" />}
          title="This group didn't open"
          body="The link may be mistyped, or the group was never created."
          action={<a href="/"><Button>Go home</Button></a>}
        />
      </Card>
    );
  }

  const renderMembers = visibleMembers;
  const renderActivity = activity ?? snapForRender?.activity ?? [];

  const currency = renderGroup.currency || "$";
  const inviteLink = `${window.location.origin}/g/${publicId}`;
  // "You" in this group: the member linked to your account, or a pending
  // invite matching your email (before the claim mutation lands). Left
  // members don't count — rejoin to write again.
  const viewerMember = viewer
    ? (renderMembers.find((m) => m.userId && String(m.userId) === String(viewer._id) && m.status === "active")
      ?? renderMembers.find(
        (m) => viewer.email && memberEmail(m) && memberEmail(m) === String(viewer.email).trim().toLowerCase()
          && m.status === "active"
      ) ?? null)
    : null;
  // Active members transact; left members stay visible so history keeps names.
  const activeMembers = renderMembers.filter((m) => m.status === "active");
  // Write access = linked membership in THIS group. Signed-in outsiders with
  // the link can view everything but must join before they can transact.
  // The server re-checks membership on every mutation — this only gates UI.
  const isMember = !!viewerMember;
  const isOwner = !!(viewer && renderGroup.ownerUserId
    && String(renderGroup.ownerUserId) === String(viewer._id));
  const myBalance = viewerMember ? (balances[mid(viewerMember)] || 0) : null;
  const outstanding = Object.values(balances).reduce((a, b) => a + Math.max(0, b), 0);
  const maxAbs = Math.max(1, ...Object.values(balances).map((b) => Math.abs(b)));

  const handleJoin = async () => {
    if (!requireAccount()) return;
    if (!online) {
      setError("You're offline — joining needs a connection.");
      return;
    }
    setError("");
    try {
      await joinGroupM({ publicId, deviceId: getDeviceId() });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveExpense = async (data) => {
    if (!requireAccount()) return;
    const amountCents = toCents(data.amount);
    const splits = splitsMapToArray(data.splits);
    const category = normalizeCategory(data.category);
    const splitMode = data.splitMode;
    if (!online) {
      const userId = requireQueueIdentity();
      if (!userId) return;
      // Queue for sync: edits to a queued add merge into it.
      const entry = {
        description: data.description, amountCents, paidBy: data.paidBy,
        splits, date: data.date, category, splitMode, isSettlement: false,
      };
      if (editing) enqueueUpdate(publicId, String(editing._id), entry, userId);
      else enqueueAdd(publicId, entry, userId);
      setShowExpense(false); setEditing(null);
      return;
    }
    setSaving(true); setError("");
    try {
      if (editing) {
        await updateExpense({
          publicId, expenseId: editing._id,
          description: data.description, amountCents, paidBy: data.paidBy,
          splits, date: data.date, category, splitMode,
        });
      } else {
        await addExpense({
          publicId, description: data.description, amountCents, paidBy: data.paidBy,
          splits, date: data.date, category, splitMode, isSettlement: false,
          clientId: newOpId(),
        });
      }
      setShowExpense(false); setEditing(null);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const openSettle = (prefill = null) => { setSettlePrefill(prefill); setShowSettle(true); };
  const closeSettle = () => { setShowSettle(false); setSettlePrefill(null); };

  const handleSettle = async ({ from, to, amount }) => {
    if (!requireAccount()) return;
    const amountCents = toCents(amount);
    const entry = {
      description: `Payment: ${nameOf(from)} → ${nameOf(to)}`,
      amountCents, paidBy: from,
      splits: [{ memberId: to, amountCents }],
      date: localDateString(),
      category: "other",
      splitMode: "equal",
      isSettlement: true,
    };
    if (!online) {
      const userId = requireQueueIdentity();
      if (!userId) return;
      enqueueAdd(publicId, entry, userId);
      closeSettle();
      return;
    }
    setSaving(true); setError("");
    try {
      await addExpense({
        publicId, ...entry, clientId: newOpId(),
      });
      closeSettle();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleDeleteExpense = (e) => {
    if (!requireAccount()) return;
    if (!confirm(`Delete “${e.description}”? Everyone will see it removed.`)) return;
    if (!online) {
      const userId = requireQueueIdentity();
      if (!userId) return;
      enqueueRemove(publicId, String(e._id), userId);
      return;
    }
    deleteExpense({ publicId, expenseId: e._id }).catch((err) => setError(err.message));
  };

  const handleAddMember = async (ev) => {
    ev.preventDefault();
    if (!requireAccount()) return;
    if (!online) {
      setError("You're offline — adding members needs a connection. You can still queue expenses for existing members.");
      return;
    }
    const email = newMemberEmail.trim().toLowerCase();
    const temp = newMemberName.trim();
    const err = validateInvite(email, temp, visibleMembers);
    if (err) { setMemberError(err); return; }
    setError(""); setMemberError("");
    try {
      await addMember({
        publicId,
        email,
        ...(temp ? { name: temp } : {}),
        deviceId: getDeviceId(),
      });
      setNewMemberEmail(""); setNewMemberName("");
    }
    catch (err) { setError(err.message); }
  };

  const handleRemoveMember = (m, isYou) => {
    if (!requireAccount()) return;
    if (!online) {
      setError("You're offline — removing members needs a connection.");
      return;
    }
    const label = memberEmail(m) && displayOf(m) !== memberEmail(m)
      ? `${displayOf(m)} (${memberEmail(m)})`
      : displayOf(m);
    const prompt = isYou
      ? `Leave “${renderGroup.name}”? Your settled balance stays in history. You can rejoin anytime with the link.`
      : `Remove ${label} from the group?`;
    if (confirm(prompt))
      removeMemberM({ publicId, memberId: m._id }).catch((e) => setError(e.message));
  };

  const startRename = (m) => {
    setRenamingId(String(m._id ?? m.id));
    setRenameValue(displayOf(m));
    setRenameError("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
    setRenameError("");
  };

  const saveRename = async (m) => {
    const id = String(m._id ?? m.id);
    const t = renameValue.trim();
    const others = renderMembers.filter((x) => String(x._id ?? x.id) !== id);
    const err = validateMemberName(t, others, m);
    if (err) { setRenameError(err); return; }
    if (!requireAccount()) return;
    if (!online) {
      setError("You're offline — renaming needs a connection.");
      return;
    }
    setError(""); setRenameError("");
    try {
      await renameMember({ publicId, memberId: m._id, name: t });
      cancelRename();
    } catch (e) { setRenameError(e.message); }
  };

  const handleRotateCode = () => {
    if (!requireAccount()) return;
    if (!online) {
      setError("You're offline — rotating the invite code needs a connection.");
      return;
    }
    if (!confirm("Generate a new invite code? The old code will stop working.")) return;
    setError("");
    rotateCode({ publicId }).catch((e) => setError(e.message));
  };

  const exportCsv = () => {
    const rows = [["date", "description", "category", "amount", "paid_by", "type", "splits"]];
    visibleExpenses.forEach((e) => rows.push([
      e.date, e.description || "",
      e.isSettlement ? "" : normalizeCategory(e.category),
      fromCents(e.amountCents),
      nameOf(e.paidBy), e.isSettlement ? "settlement" : "expense",
      (e.splits || []).map((s) => `${nameOf(s.memberId)}:${fromCents(s.amountCents)}`).join("; "),
    ]));
    const csv = rows.map((row, rowIndex) => row.map((value, index) => {
      let cell = String(value ?? "");
      // Spreadsheet applications may execute formulas in CSV text cells.
      // Prefix untrusted descriptions/member names before RFC-style quoting.
      if (rowIndex > 0 && [1, 4, 6].includes(index) && /^\s*[=+\-@]/.test(cell)) cell = `'${cell}`;
      return `"${cell.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${renderGroup?.name || "group"}-expenses.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = inviteLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-4 pb-28 sm:space-y-5 md:pb-0">
      {!online && (
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-slate-300 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-white">You&apos;re offline.</span>{" "}
            Showing the last saved copy{snapForRender ? ` from ${timeAgo(snapForRender.savedAt)}` : ""}. New expenses queue on this device and sync automatically.
          </p>
          <Badge tone="amber" className="self-start sm:self-center">Offline copy</Badge>
        </div>
      )}
      {!isAuthenticated && (
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-teal-700/20 bg-teal-700/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-teal-400/20 dark:bg-teal-400/[0.06]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-white">You&apos;re viewing as a guest.</span>{" "}
            Balances, expenses and activity are visible — sign in to add transactions.
          </p>
          <Button size="sm" onClick={() => setAuthOpen(true)} className="shrink-0">
            Sign in
          </Button>
        </div>
      )}
      {isAuthenticated && !isMember && (
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-amber-500/25 bg-amber-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-amber-400/20 dark:bg-amber-400/[0.06]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-white">You&apos;re not a member of this group yet.</span>{" "}
            Join{viewer?.name ? ` as ${viewer.name}` : ""} to add expenses, invite friends and settle up.
          </p>
          <Button size="sm" onClick={handleJoin} className="shrink-0">
            Join this group
          </Button>
        </div>
      )}
      <OutboxBar
        items={allGroupOps} userId={viewer?._id ?? null} online={online} syncing={syncing}
        onSync={() => runSync({ includeFailed: true })}
        onRetry={(opId) => { retryOp(opId); runSync({ includeFailed: true }); }}
        onDiscard={(opId) => dropOp(opId)}
      />
      <div className="group-dashboard">
      {/* Group overview and section navigation */}
      <Card className="group-overview overflow-hidden">
        <div aria-hidden="true" className="h-1 bg-gradient-to-r from-teal-700 via-teal-500 to-teal-300" />
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar name={renderGroup.name} className="h-12 w-12 text-lg" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                  {renderGroup.name}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
                  <AvatarStack names={activeMembers.map((m) => displayOf(m))} />
                  <span>{activeMembers.length} member{activeMembers.length === 1 ? "" : "s"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{expenseCount} expense{expenseCount === 1 ? "" : "s"}</span>
                  {online ? <LiveDot /> : <Badge tone="neutral">Offline</Badge>}
                </p>
              </div>
            </div>
            <div className="group-overview-actions hidden gap-2 md:flex">
              {isMember ? (
                <>
                  <Button variant="secondary" onClick={() => openSettle()}>
                    <Icon.Wallet className="h-4 w-4" /> Settle up
                  </Button>
                  <Button onClick={() => { setEditing(null); setShowExpense(true); }}>
                    <Icon.Plus className="h-4 w-4" /> Add expense
                  </Button>
                </>
              ) : isAuthenticated ? (
                <Button variant="secondary" onClick={handleJoin}>
                  Join to add
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setAuthOpen(true)}>
                  Sign in to add
                </Button>
              )}
            </div>
          </div>

          {/* Stats: compact on phones, evenly readable on desktop */}
          <div className="overview-stats mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Stat label="Total spent" value={fmt(fromCents(totalCents), currency)} sub={`${expenseCount} expenses`} icon={<Icon.Receipt className="h-4 w-4" />} tone="teal" />
            <Stat label="Outstanding" value={fmt(outstanding, currency)} sub={settlements.length ? `${settlements.length} payment${settlements.length === 1 ? "" : "s"} left` : "All settled"} icon={<Icon.Scale className="h-4 w-4" />} tone={settlements.length ? "amber" : "emerald"} />
            <Stat label="Settlements" value={String(settlementCount)} sub="recorded payments" icon={<Icon.Wallet className="h-4 w-4" />} tone="neutral" />
            <Stat
              label="Your balance"
              value={myBalance === null ? "—" : Math.abs(myBalance) < 0.005 ? "Settled" : myBalance > 0 ? `+${fmt(myBalance, currency)}` : `-${fmt(-myBalance, currency)}`}
              sub={myBalance === null ? "no matching member yet" : myBalance > 0 ? "others owe you" : Math.abs(myBalance) < 0.005 ? "nothing owed" : "you owe"}
              icon={<Icon.Chart className="h-4 w-4" />}
              tone={myBalance === null || Math.abs(myBalance) < 0.005 ? "neutral" : myBalance > 0 ? "emerald" : "amber"}
            />
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/[0.07]">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={copyInvite} className="!min-h-[2.5rem]">
                {copied ? <Icon.Check className="h-4 w-4 text-emerald-600" /> : <Icon.Link className="h-4 w-4" />}
                {copied ? "Copied" : "Copy invite link"}
              </Button>
              {renderGroup.inviteCode && (
                <span title="Share this code — anyone with it can join"
                  className="tnum inline-flex min-h-[2.5rem] items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 font-mono text-[13px] font-bold tracking-[0.18em] text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200">
                  {formatInviteCode(renderGroup.inviteCode)}
                </span>
              )}
              <Button variant="ghost" size="sm" title={isOwner ? "Revoke this code and issue a new one" : "Only the group owner can rotate the invite code"}
                disabled={!isOwner}
                onClick={handleRotateCode}>
                <Icon.Refresh className="h-4 w-4" />
                <span className="lg:hidden">New code</span>
                <span className="hidden lg:inline">Rotate code</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={exportCsv} title="Download all expenses as CSV">
                <Icon.Download className="h-4 w-4" />
                <span className="lg:hidden">Export</span>
                <span className="hidden lg:inline">CSV</span>
              </Button>
            </div>
          </div>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        </div>
      </Card>

      {/* Keep the group sections easy to reach without taking space from the overview. */}
      <div className="group-nav sticky top-[4.5rem] z-20">
        <Tabs
          value={tab} onChange={setTab}
          options={[
            ["expenses", "Expenses", Icon.Receipt, visibleExpenses.length],
            ["balances", "Balances", Icon.Scale],
            ["debts", "Simplified Debts", Icon.Wallet, settlements.length],
            ["summary", "Summary", Icon.Receipt],
            ["insights", "Insights", Icon.Chart],
            ["members", "Members", Icon.Users, activeMembers.length],
            ["activity", "Activity", Icon.Clock, renderActivity.length],
          ]}
        />
      </div>
      <section className="group-content" aria-label="Group details">

      {tab === "expenses" && (
        <Card className="overflow-hidden">
          {visibleExpenses.length === 0 ? (
            <EmptyState
              icon={<Icon.Receipt className="h-6 w-6" />}
              title="No expenses yet"
              body={isMember ? "Add the first one — dinner, taxi, groceries. Everyone in the group will see it instantly." : "No expenses yet. Members can add the first one — dinner, taxi, groceries."}
              action={isMember
                ? <Button onClick={() => { setEditing(null); setShowExpense(true); }}><Icon.Plus className="h-4 w-4" /> Add expense</Button>
                : <Button variant="secondary" onClick={() => setAuthOpen(true)}>Sign in to add</Button>}
            />
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-white/[0.06]">
                <label htmlFor="cat-filter" className="shrink-0 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                  Category
                </label>
                <Select id="cat-filter" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                  className="!min-h-[2.5rem] !w-auto flex-1 sm:flex-none sm:!w-52" aria-label="Filter expenses by category">
                  <option value="all">All categories</option>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
                {catFilter !== "all" && (
                  <span className="tnum ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {filteredExpenses.length} of {visibleExpenses.length}
                  </span>
                )}
              </div>
              {filteredExpenses.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">No {categoryLabel(catFilter).toLowerCase()} expenses yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Nothing in this category so far — add one and it will show up here.
                  </p>
                  {isMember && (
                    <Button onClick={() => { setEditing(null); setShowExpense(true); }} className="mt-5">
                      <Icon.Plus className="h-4 w-4" /> Add expense
                    </Button>
                  )}
                </div>
              ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {filteredExpenses.map((e) => (
                <li key={String(e._id)}
                  className={`group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:gap-3.5 sm:px-5 dark:hover:bg-white/[0.03] ${e.isSettlement ? "bg-emerald-50/50 dark:bg-emerald-400/[0.04]" : ""}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${
                    e.isSettlement
                      ? "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-500 dark:bg-white/[0.07] dark:text-slate-400"
                  }`}>
                    {e.isSettlement ? <Icon.Wallet className="h-5 w-5" /> : <Icon.Receipt className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                      {e.description}
                      {!e.isSettlement && e.category && (
                        <Badge tone={categoryTone(e.category)} className="ml-2 align-middle">{categoryLabel(e.category)}</Badge>
                      )}
                      {e.isSettlement && <Badge tone="emerald" className="ml-2 hidden align-middle min-[480px]:inline-flex">payment</Badge>}
                      {e._queued && <Badge tone="amber" className="ml-2 align-middle">queued</Badge>}
                    </p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[13px] text-slate-500 dark:text-slate-400">
                      <span className="truncate">
                        {e.isSettlement
                          ? `${nameOf(e.paidBy)} paid ${nameOf(e.splits[0]?.memberId)}`
                          : `${nameOf(e.paidBy)} paid · split ${e.splits.length} way${e.splits.length === 1 ? "" : "s"}`}
                      </span>
                      <span aria-hidden="true" className="shrink-0">·</span>
                      <span className="tnum inline-flex shrink-0 items-center gap-1"><Icon.Calendar className="h-3.5 w-3.5" />{e.date}</span>
                    </p>
                  </div>
                  <Money value={fromCents(e.amountCents)} currency={currency}
                    className="shrink-0 text-[15px] font-bold text-slate-900 dark:text-white" />
                  <div className="flex shrink-0 items-center sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    {isMember && !e.isSettlement && (
                      <button aria-label={`Edit ${e.description}`} title="Edit"
                        onClick={() => { setEditing(e); setShowExpense(true); }}
                        className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700 cursor-pointer dark:hover:bg-white/10 dark:hover:text-slate-200">
                        <Icon.Pencil className="h-[18px] w-[18px]" />
                      </button>
                    )}
                    {isMember && (
                    <button aria-label={`Delete ${e.description}`} title="Delete"
                      onClick={() => handleDeleteExpense(e)}
                      className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer dark:hover:bg-red-500/10 dark:hover:text-red-400">
                      <Icon.Trash className="h-[18px] w-[18px]" />
                    </button>
                    )}
                  </div>
                </li>
              ))}
              </ul>
              )}
            </>
          )}
        </Card>
      )}

      {tab === "balances" && (
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Balances" sub="Net total per person — this is the number that matters. Payment paths may be reshuffled under Simplified Debts, totals never move." />
          {renderMembers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Add members to see balances.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {renderMembers.map((m) => {
                const b = balances[mid(m)] || 0;
                const settled = Math.abs(b) < 0.005;
                const pending = isPendingInvite(m);
                return (
                  <li key={String(m._id)}>
                    <div className="flex items-center gap-3">
                      <Avatar name={displayOf(m)} className="h-9 w-9 text-[13px]" />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <span className="truncate">{displayOf(m)}</span>
                        {pending && <Badge tone="amber" className="!px-1.5 !py-0.5 !text-[10px]">invited</Badge>}
                        {m.status === "left" && <Badge tone="neutral" className="!px-1.5 !py-0.5 !text-[10px]">left</Badge>}
                      </span>
                      <span className={`tnum shrink-0 text-sm font-bold ${
                        settled ? "text-slate-400 dark:text-slate-500"
                        : b > 0 ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                      }`}>
                        {settled ? "Settled" : b > 0 ? `gets ${fmt(b, currency)}` : `owes ${fmt(-b, currency)}`}
                      </span>
                    </div>
                    <Progress value={(Math.abs(b) / maxAbs) * 100} tone={settled ? "teal" : b > 0 ? "emerald" : "amber"} className="mt-2 ml-12" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === "debts" && (
        <SimplifiedDebts
          settlements={settlements} currency={currency} nameOf={nameOf}
          canWrite={isMember}
          onRecord={(s) => openSettle({ from: s.from, to: s.to, amount: s.amount })}
          onSettle={() => openSettle()}
        />
      )}

      {tab === "summary" && (
        <DetailedSummary
          expenses={visibleExpenses} members={renderMembers} currency={currency} nameOf={nameOf}
        />
      )}

      {tab === "insights" && (
        <Suspense fallback={<Card className="p-5 sm:p-6"><SkeletonRows rows={4} /></Card>}>
          <Insights expenses={visibleExpenses} members={renderMembers} currency={currency} displayOf={displayOf} />
        </Suspense>
      )}

      {tab === "members" && (
        <div className="grid min-w-0 items-start gap-4 sm:gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="min-w-0 p-5 sm:p-6">
            <SectionTitle title={`Members · ${activeMembers.length}`} sub={isMember ? "Invite by email — shows their name once they sign up." : "Members can invite, rename and remove. Join the group to manage members."} />
            {isMember ? (
            <form className="mt-4" onSubmit={handleAddMember} noValidate>
              <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[520px]:grid-cols-[1.4fr_1fr_auto]">
                <TextInput type="email" placeholder="Email — e.g. priya@example.com" value={newMemberEmail}
                  onChange={(e) => {
                    setNewMemberEmail(e.target.value);
                    if (memberError) setMemberError(validateInvite(e.target.value, newMemberName, visibleMembers));
                  }}
                  aria-label="New member email" inputMode="email" autoComplete="email" className="min-w-0 flex-1" />
                <TextInput placeholder="Temp name (optional)" value={newMemberName}
                  onChange={(e) => {
                    setNewMemberName(e.target.value);
                    if (memberError) setMemberError(validateInvite(newMemberEmail, e.target.value, visibleMembers));
                  }}
                  aria-label="Temp display name (optional)" maxLength={MAX_MEMBER_NAME} className="min-w-0 flex-1" />
                <Button type="submit" variant="secondary" disabled={!newMemberEmail.trim()} className="shrink-0 min-[520px]:w-24">Invite</Button>
              </div>
              {memberError
                ? <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{memberError}</p>
                : <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{renderMembers.length} of {MAX_MEMBERS_PER_GROUP} seats used · name appears after they sign up</p>}
            </form>
            ) : isAuthenticated ? (
              <Button variant="secondary" onClick={handleJoin} className="mt-4 w-full min-[420px]:w-auto">
                Join this group to invite members
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setAuthOpen(true)} className="mt-4 w-full min-[420px]:w-auto">
                Sign in to add members
              </Button>
            )}
            {renameError && <p role="alert" className="mt-2.5 text-xs font-medium text-red-600 dark:text-red-400">{renameError}</p>}
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
              {renderMembers.map((m) => {
                const id = String(m._id ?? m.id);
                const b = balances[mid(m)] || 0;
                const isYou = !!viewerMember && id === String(viewerMember._id ?? viewerMember.id);
                const locked = Math.abs(b) >= 0.005;
                const editing = renamingId === id;
                // Settle shortcut: member pays/is-paid against someone on the
                // other side of zero; falls back to any other member.
                // Left members never transact, so they stay out of both.
                const others = renderMembers.filter((x) => String(x._id ?? x.id) !== id && x.status === "active");
                const counterpart = Math.abs(b) >= 0.005
                  ? (others.find((x) => (b < 0 ? (balances[mid(x)] || 0) > 0.005 : (balances[mid(x)] || 0) < -0.005)) ?? others[0] ?? null)
                  : null;
                return (
                  <li key={String(m._id)} className="flex items-center gap-3 py-2.5">
                    <Avatar name={editing ? renameValue : displayOf(m)} className="h-9 w-9 text-[13px]" />
                    {editing ? (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <TextInput value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                          aria-label={`Rename ${displayOf(m)}`} maxLength={MAX_MEMBER_NAME} className="min-w-0 flex-1" autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") saveRename(m); if (e.key === "Escape") cancelRename(); }} />
                        <Button size="sm" onClick={() => saveRename(m)}>Save</Button>
                        <button onClick={cancelRename} aria-label="Cancel rename"
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700 cursor-pointer dark:hover:bg-white/10 dark:hover:text-slate-200">
                          <Icon.X className="h-[18px] w-[18px]" />
                        </button>
                      </span>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            <span className="truncate">{displayOf(m)}</span>
                            {isYou && <Badge tone="teal" className="!px-1.5 !py-0.5 !text-[10px]">you</Badge>}
                            {!isYou && m.status === "left" && <Badge tone="neutral" className="!px-1.5 !py-0.5 !text-[10px]">left</Badge>}
                            {!isYou && m.status === "active" && isPendingInvite(m) && <Badge tone="amber" className="!px-1.5 !py-0.5 !text-[10px]">invited</Badge>}
                            {!isYou && m.status === "active" && !isPendingInvite(m) && memberEmail(m) && <Badge tone="emerald" className="!px-1.5 !py-0.5 !text-[10px]">joined</Badge>}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">
                            {memberEmail(m) && displayOf(m) !== memberEmail(m)
                              ? <span className="tnum">{memberEmail(m)} · </span>
                              : null}
                            <Money value={b} currency={currency}
                              className={`tnum ${Math.abs(b) < 0.005 ? "" : b > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`} />
                            {isPendingInvite(m)
                              ? <span> · hasn&apos;t signed up yet</span>
                              : <span> · added {timeAgo(m.createdAt)}</span>}
                          </span>
                        </span>
                        {isMember && m.status === "active" && (
                          <span className="flex shrink-0 items-center gap-1">
                            <button aria-label={`Rename ${displayOf(m)}`} title={memberEmail(m) ? `Rename display name (email stays ${memberEmail(m)})` : "Rename"}
                              onClick={() => startRename(m)}
                              className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700 cursor-pointer dark:hover:bg-white/10 dark:hover:text-slate-200">
                              <Icon.Pencil className="h-[18px] w-[18px]" />
                            </button>
                            {counterpart && (
                              <button
                                onClick={() => openSettle({
                                  from: mid(b < 0 ? m : counterpart),
                                  to: mid(b < 0 ? counterpart : m),
                                  amount: Math.round(Math.abs(b) * 100) / 100,
                                })}
                                title={`Settle up with ${displayOf(m)}`}
                                className="min-h-[2.5rem] rounded-lg px-3 py-1.5 text-[13px] font-semibold text-teal-700 transition-colors hover:bg-teal-700/10 cursor-pointer dark:text-teal-300 dark:hover:bg-teal-400/10">
                                Settle
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveMember(m, isYou)}
                              disabled={locked}
                              title={locked ? "Settle up first — members with a balance can't be removed" : isYou ? "Leave this group" : `Remove ${displayOf(m)}`}
                              className="min-h-[2.5rem] rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400 dark:disabled:hover:bg-transparent dark:disabled:hover:text-slate-400">
                              {isYou ? "Leave" : "Remove"}
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
              Invite by email — the row shows the email until they sign up, then swaps to their name automatically. Add a temp name to keep the list readable meanwhile. Anyone with the link can view; only members can invite, rename or remove.
            </p>
          </Card>
          <Card className="min-w-0 p-5 sm:p-6">
            <SectionTitle title="Invite" sub="Share either — both open the same private group." />
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200/70 p-3.5 dark:border-white/[0.07]">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Invite link</p>
                <p className="tnum mt-1 truncate font-mono text-[13px] text-slate-700 dark:text-slate-200">{inviteLink}</p>
                <Button variant="secondary" size="sm" onClick={copyInvite} className="mt-2.5 w-full">
                  {copied ? <Icon.Check className="h-4 w-4" /> : <Icon.Copy className="h-4 w-4" />}
                  {copied ? "Copied to clipboard" : "Copy invite link"}
                </Button>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-300 p-3.5 text-center dark:border-white/15">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Invite code</p>
                <p className="tnum mt-1 font-mono text-xl font-extrabold tracking-[0.2em] text-slate-900 dark:text-white">{formatInviteCode(renderGroup.inviteCode)}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Readable over a call or text. Rotatable anytime.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "activity" && (
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Activity" sub="Every addition, edit and payment lands here live." />
          {renderActivity.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing yet — add an expense to start the feed.</p>
          ) : (
            <ul className="relative mt-4 space-y-1 before:absolute before:bottom-2 before:left-[22px] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-white/10">
              {renderActivity.map((a) => (
                <li key={String(a._id)} className="relative flex items-start gap-3 rounded-xl px-2 py-2">
                  <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-[#0e1621] dark:text-slate-500">
                    <Icon.Clock className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a.text}</span>
                  <span className="tnum shrink-0 pt-1.5 text-xs text-slate-400 dark:text-slate-500">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      </section>
      </div>

      {/* Thumb-reach actions on phones + small tablets */}
      <div className="group-mobile-actions fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-[#070c13]/85">
        {isMember ? (
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={() => openSettle()} className="!min-h-[3rem]">
            <Icon.Wallet className="h-4 w-4" /> Settle up
          </Button>
          <Button onClick={() => { setEditing(null); setShowExpense(true); }} className="!min-h-[3rem]">
            <Icon.Plus className="h-4 w-4" /> Add expense
          </Button>
        </div>
        ) : (
        <div className="mx-auto max-w-6xl">
          <Button onClick={() => setAuthOpen(true)} className="w-full !min-h-[3rem]">
            Sign in to add transactions
          </Button>
        </div>
        )}
      </div>

      {showExpense && isMember && (
        <ExpenseModal
          members={activeMembers} currency={currency}
          initial={editing ? { ...expenseToForm(editing), paidByName: nameOf(editing.paidBy) } : null}
          saving={saving}
          onClose={() => { setShowExpense(false); setEditing(null); }}
          onSave={handleSaveExpense}
        />
      )}
      {showSettle && isMember && (
        <SettleModal members={activeMembers} balances={balances} currency={currency} saving={saving}
          initial={settlePrefill} onClose={closeSettle} onSave={handleSettle} />
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
