import { Link } from "react-router-dom";
import { Avatar, Badge, Button, Card, Icon } from "../components/ui";
import { MyGroups, RecentGroups } from "../components/GroupCards";

const STEPS = [
  { icon: Icon.Plus, title: "Create a group", body: "Sign in, then spin up a group for the trip, the flat, or the night out." },
  { icon: Icon.Link, title: "Invite friends", body: "Share the link or 10-character code. Guests can open it and view everything." },
  { icon: Icon.Receipt, title: "Add expenses", body: "Signed-in members split equally, by exact amounts, % or shares. Everyone sees updates live." },
  { icon: Icon.Wallet, title: "Settle up", body: "See the fewest payments that square everyone, then record them in one tap." },
];

const TRUST = [
  { icon: Icon.Shield, title: "Private by link", body: "Unguessable links, rotatable codes, no public directory." },
  { icon: Icon.Zap, title: "Live for everyone", body: "Balances, expenses and activity sync instantly on every device." },
  { icon: Icon.Download, title: "Take it with you", body: "One-click CSV export for the books. Free forever, no tiers." },
];

export default function Landing() {
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[24px] border border-slate-200/70 bg-white px-5 py-7 sm:px-8 sm:py-10 lg:px-10 dark:border-white/[0.08] dark:bg-[#0e1621]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-[-80px] h-72 w-72 rounded-full bg-teal-500/15 blur-3xl dark:bg-teal-400/10" />
          <div className="absolute -bottom-28 left-[-60px] h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-400/[0.07]" />
        </div>
        <div className="relative grid items-center gap-7 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="teal"><span className="h-1.5 w-1.5 rounded-full bg-current" /> Free · Guests view · Members add</Badge>
              <Badge tone="neutral" className="hidden min-[480px]:inline-flex">Mobile + desktop</Badge>
            </div>
            <h1 className="mt-3 max-w-xl text-balance text-[28px] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-4xl lg:text-[44px] dark:text-white">
              Split bills with friends, settle up in seconds
            </h1>
            <p className="mt-2.5 max-w-xl text-pretty text-[15px] leading-relaxed text-slate-500 sm:text-base dark:text-slate-400">
              One free account to create groups and add expenses. Guests open your link and view everything live — no install, nothing to pay for.
            </p>
            <div className="mt-5 flex flex-col gap-2.5 min-[420px]:flex-row">
              <Link to="/create" className="flex-1 min-[420px]:flex-none">
                <Button size="lg" className="w-full min-[420px]:w-auto">
                  Create a group <Icon.ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/join" className="flex-1 min-[420px]:flex-none">
                <Button size="lg" variant="secondary" className="w-full min-[420px]:w-auto">
                  Join with an invite
                </Button>
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5"><Icon.Check className="h-4 w-4 text-teal-700 dark:text-teal-300" /> 30-second setup</span>
              <span className="inline-flex items-center gap-1.5"><Icon.Check className="h-4 w-4 text-teal-700 dark:text-teal-300" /> Equal, exact, % &amp; shares</span>
              <span className="inline-flex items-center gap-1.5"><Icon.Check className="h-4 w-4 text-teal-700 dark:text-teal-300" /> Simplest settle-up</span>
            </div>
          </div>

          {/* Live preview mock */}
          <div aria-hidden="true" className="hidden select-none md:block">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-[var(--shadow-pop)] lg:p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-3 dark:bg-white/[0.05]">
                <div className="flex items-center gap-2.5">
                  <Avatar name="Goa Trip" className="h-9 w-9 text-xs" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Goa Trip</p>
                    <p className="tnum text-xs text-slate-500 dark:text-slate-400">5 members · $842 total</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-600/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">● Live</span>
              </div>
              <div className="mt-2.5 space-y-2">
                {[
                  ["Seafood dinner", "$128.00 · Priya paid", "$128.00"],
                  ["Taxi to Anjuna", "$32.50 · Arjun paid", "$32.50"],
                  ["Villa · 2 nights", "$540.00 · split 5 ways", "$540.00"],
                ].map(([t, s, a]) => (
                  <div key={t} className="flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 dark:bg-white/[0.05]">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
                      <Icon.Receipt className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{s}</span>
                    </span>
                    <span className="tnum text-[13px] font-bold text-slate-900 dark:text-white">{a}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2.5 rounded-xl bg-teal-700 px-3.5 py-3 text-white dark:bg-teal-400 dark:text-teal-950">
                  <Icon.Scale className="h-4 w-4 shrink-0" />
                  <span className="text-[13px] font-semibold">Arjun → Priya $46.20 settles all</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MyGroups />
      <RecentGroups />

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">How it works</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-700/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                  <s.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <span className="tnum mr-1.5 text-slate-400 dark:text-slate-500">{i + 1}.</span>{s.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">Why groups trust it</h2>
          <ul className="mt-3 space-y-3">
            {TRUST.map((t) => (
              <li key={t.title} className="flex gap-2.5 rounded-xl bg-slate-50/80 px-3 py-2.5 dark:bg-white/[0.03]">
                <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" />
                <span>
                  <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t.title}</span>
                  <span className="block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {!import.meta.env.VITE_CONVEX_URL && <SetupBanner />}
    </div>
  );
}

function SetupBanner() {
  return (
    <div className="rounded-[20px] border border-dashed border-amber-400/60 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/[0.07] dark:text-amber-200">
      <b>Connect Convex (free) + Vercel (free):</b>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
        <li><code className="rounded bg-amber-900/10 px-1 py-0.5 font-mono text-[13px]">npx convex dev</code> → creates free project, follow login</li>
        <li>Copy URL to <code className="rounded bg-amber-900/10 px-1 py-0.5 font-mono text-[13px]">.env</code> as <code className="rounded bg-amber-900/10 px-1 py-0.5 font-mono text-[13px]">VITE_CONVEX_URL</code></li>
        <li><code className="rounded bg-amber-900/10 px-1 py-0.5 font-mono text-[13px]">npx convex deploy</code> for prod DB, then deploy here to Vercel</li>
      </ol>
    </div>
  );
}
