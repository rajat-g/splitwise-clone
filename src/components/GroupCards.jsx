import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getRecentGroups } from "../lib/identity";
import { formatInviteCode } from "../lib/split";
import { Avatar, AvatarStack, Badge, Card, Icon } from "./ui";

export function MyGroups() {
  const { isAuthenticated } = useConvexAuth();
  const myGroups = useQuery(api.groups.myGroups, isAuthenticated ? {} : "skip");
  const nav = useNavigate();
  if (!isAuthenticated) return null;
  if (myGroups === undefined) {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">My groups</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Loading groups you created while signed in…</p>
        <div className="mt-3 animate-pulse space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.05]" />)}
        </div>
      </Card>
    );
  }
  if (myGroups.length === 0) return null;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">My groups</h2>
        <Badge tone="teal">Synced to account</Badge>
      </div>
      <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Groups you created while signed in — available on any device.</p>
      <div className="home-group-list mt-3 grid gap-2 min-[480px]:grid-cols-2">
        {myGroups.map((g) => (
          <button key={g.publicId} onClick={() => nav(`/g/${g.publicId}`)}
            className="flex min-h-[3.25rem] items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-slate-50/50 px-2.5 py-2 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-[var(--shadow-card)] cursor-pointer dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]">
            <Avatar name={g.name} className="h-9 w-9 text-xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{g.name}</span>
              <span className="tnum font-mono text-[11px] tracking-[0.14em] text-slate-400 dark:text-slate-500">{formatInviteCode(g.inviteCode)}</span>
            </span>
            <Icon.ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
          </button>
        ))}
      </div>
    </Card>
  );
}

export function RecentGroups() {
  const nav = useNavigate();
  const [recent, setRecent] = useState([]);
  useEffect(() => setRecent(getRecentGroups()), []);
  if (!recent.length) return null;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">Pick up where you left off</h2>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Groups you&apos;ve opened on this device.</p>
        </div>
        <AvatarStack names={recent.map((g) => g.name)} className="hidden shrink-0 min-[480px]:flex" />
      </div>
      <div className="home-group-list mt-3.5 grid gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {recent.map((g) => (
          <button key={g.id} onClick={() => nav(`/g/${g.id}`)}
            className="flex min-h-[3.25rem] items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-slate-50/50 px-2.5 py-2 text-left text-sm font-medium text-slate-800 transition-all hover:border-slate-300 hover:bg-white hover:shadow-[var(--shadow-card)] cursor-pointer dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:hover:border-white/15 dark:hover:bg-white/[0.06]">
            <Avatar name={g.name} className="h-9 w-9 text-xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{g.name}</span>
              {g.inviteCode && <span className="tnum font-mono text-[11px] tracking-[0.14em] text-slate-400 dark:text-slate-500">{formatInviteCode(g.inviteCode)}</span>}
            </span>
            <Icon.ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
          </button>
        ))}
      </div>
    </Card>
  );
}
