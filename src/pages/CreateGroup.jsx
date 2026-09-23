import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CURRENCIES } from "../lib/split";
import { getDisplayName, setDisplayName, getDeviceId, saveRecentGroup } from "../lib/identity";
import { Alert, Avatar, Button, Card, EmptyState, Field, Icon, Select, SkeletonRows, TextInput } from "../components/ui";
import { AuthDialog } from "../components/Auth";

export default function CreateGroup() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const createGroup = useMutation(api.groups.create);
  const nav = useNavigate();

  const [name, setName] = useState(getDisplayName());
  const [groupName, setGroupName] = useState("");
  const [currency, setCurrency] = useState("$");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [editName, setEditName] = useState(false);

  useEffect(() => {
    if (viewer?.name && !getDisplayName()) {
      setName(viewer.name);
      setDisplayName(viewer.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.name]);

  if (isLoading) {
    return (
      <Card className="mx-auto w-full max-w-xl p-5 sm:p-7"><SkeletonRows rows={3} /></Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <Card className="p-8 text-center sm:p-10">
          <EmptyState
            icon={<Icon.Plus className="h-6 w-6" />}
            title="Sign in to create a group"
            body="Groups are owned by your free account, so they follow you across devices. Guests can open your invite link and view everything."
            action={<Button size="lg" onClick={() => setAuthOpen(true)}>Sign in / create account</Button>}
          />
        </Card>
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          Have an invite instead? <Link to="/join" className="font-semibold text-teal-700 hover:underline dark:text-teal-300">Join a group</Link>
        </p>
        {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      </div>
    );
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You're offline — reconnect to create a group. Viewing saved groups still works.");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name first — it's how friends will recognise you.");
      return;
    }
    if (!groupName.trim()) {
      setError("Give your group a name, like “Goa Trip”.");
      return;
    }
    setBusy(true);
    try {
      setDisplayName(name);
      const g = await createGroup({
        name: groupName.trim(), currency,
        creatorName: name.trim(), deviceId: getDeviceId(),
      });
      saveRecentGroup({ id: g.publicId, name: groupName.trim(), inviteCode: g.inviteCode });
      nav(`/g/${g.publicId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="pt-1 sm:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Start a new group
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
          One for the trip, the flat, or the night out. You&apos;ll get a private link and code to share.
        </p>
      </div>

      <Card className="mt-4 p-5 sm:p-7">
        {!editName ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/60 px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
            <Avatar name={viewer?.name || name || "You"} className="h-9 w-9 text-xs" />
            <p className="min-w-0 flex-1 text-sm text-slate-500 dark:text-slate-400">
              Creating as <span className="font-bold text-slate-900 dark:text-white">{viewer?.name || name || "you"}</span>
            </p>
            <button type="button" onClick={() => setEditName(true)}
              className="shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-teal-700 hover:bg-teal-700/10 cursor-pointer dark:text-teal-300">
              Use another name
            </button>
          </div>
        ) : (
          <Field label="Your name" hint="Per-group display name shown to friends on expenses.">
            <TextInput placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="nickname" maxLength={40} />
          </Field>
        )}

        <form onSubmit={handleCreate} className="mt-5 space-y-3.5">
          <Field label="Group name">
            <TextInput placeholder="e.g. Goa Trip, Room 4B" value={groupName}
              onChange={(e) => setGroupName(e.target.value)} aria-label="Group name" maxLength={60} autoFocus />
          </Field>
          <Field label="Currency" hint="Applies to every expense in this group.">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? "Creating…" : "Create private group"}
            {!busy && <Icon.ArrowRight className="h-4 w-4" />}
          </Button>
          <p className="text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            This group will also appear under My groups on any device.
          </p>
        </form>
      </Card>
    </div>
  );
}
