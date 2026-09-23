import { categoryLabel } from "../lib/categories";
import { fmt, fromCents, splitTypeLabel } from "../lib/split";
import { Avatar, Badge, Button, Card, EmptyState, Icon, SectionTitle } from "./ui";

const mid = (m) => String(m._id ?? m.id);
const titleOf = (m) => m?.name || String(m?.email ?? "").trim() || "Unknown";

function Money({ cents, currency, className = "" }) {
  return <span className={`tnum ${className}`}>{fmt(fromCents(cents), currency)}</span>;
}

export function SimplifiedDebts({ settlements, currency, nameOf, isAuthenticated, onRecord, onSettle }) {
  const moving = settlements.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        title="Simplified debts"
        sub="Who pays whom, restructured to need the fewest payments. Nobody's total changes — only the paths are optimized, recalculated on every expense or payment."
        action={isAuthenticated && settlements.length > 0 && (
          <Button size="sm" variant="soft" onClick={onSettle}>
            <Icon.Wallet className="h-4 w-4" /> Settle
          </Button>
        )}
      />
      {settlements.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-600/10 px-3.5 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
          <Icon.Check className="h-4 w-4 shrink-0" /> Everyone is settled up.
        </p>
      ) : (
        <>
          <p className="tnum mt-3 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            {settlements.length} payment{settlements.length === 1 ? "" : "s"} move{settlements.length === 1 ? "s" : ""} {fmt(moving, currency)} in total
          </p>
          <ul className="mt-3 space-y-2">
          {settlements.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-slate-50/50 px-3.5 py-3 text-sm dark:border-white/[0.07] dark:bg-white/[0.03]">
              <span className="flex shrink-0 items-center">
                <Avatar name={nameOf(s.from)} className="h-7 w-7 text-[11px]" />
                <Avatar name={nameOf(s.to)} className="-ml-2 h-7 w-7 text-[11px]" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                {nameOf(s.from)} <span className="text-slate-400 dark:text-slate-500">→</span> {nameOf(s.to)}
              </span>
              <Money cents={Math.round(s.amount * 100)} currency={currency} className="shrink-0 font-bold text-slate-900 dark:text-white" />
              {isAuthenticated && (
                <button
                  onClick={() => onRecord(s)}
                  title={`Record payment from ${nameOf(s.from)} to ${nameOf(s.to)}`}
                  className="min-h-[2.5rem] shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-teal-700 transition-colors hover:bg-teal-700/10 cursor-pointer dark:text-teal-300 dark:hover:bg-teal-400/10">
                  Record
                </button>
              )}
            </li>
          ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        {isAuthenticated
          ? "Tip: record a payment and balances update live for everyone in the group."
          : "Tip: sign in to record a payment — balances then update live for everyone."}
      </p>
    </Card>
  );
}

export function DetailedSummary({ expenses, members, currency, nameOf }) {
  const items = (expenses ?? []).filter((e) => !e.isSettlement);

  if (members.length === 0 || items.length === 0) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <EmptyState
          icon={<Icon.Receipt className="h-6 w-6" />}
          title="No summary yet"
          body={members.length === 0
            ? "Add members and expenses first — each person's line-by-line share will appear here."
            : "Add an expense and each person's share of every bill will appear here."}
        />
      </Card>
    );
  }

  const perMember = members.map((m) => {
    const id = mid(m);
    const rows = items
      .filter((e) => (e.splits ?? []).some((s) => String(s.memberId) === id))
      .map((e) => ({
        expense: e,
        shareCents: (e.splits ?? []).find((s) => String(s.memberId) === id)?.amountCents ?? 0,
      }));
    const totalCents = rows.reduce((a, r) => a + r.shareCents, 0);
    return { member: m, rows, totalCents };
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {perMember.map(({ member, rows, totalCents }) => (
        <Card key={String(member._id)} className="overflow-hidden">
          <div className="flex items-center gap-3 px-5 pb-3 pt-4 sm:px-6">
            <Avatar name={titleOf(member)} className="h-9 w-9 text-[13px]" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
                {titleOf(member)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {rows.length} expense{rows.length === 1 ? "" : "s"} · their share{" "}
                <Money cents={totalCents} currency={currency} className="font-bold text-slate-700 dark:text-slate-200" />
              </p>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500 sm:px-6 dark:text-slate-400">
              Not part of any expense yet.
            </p>
          ) : (
            <div className="overflow-x-auto px-2 pb-2 sm:px-4">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th scope="col" className="px-3 py-2">Expense</th>
                    <th scope="col" className="px-3 py-2">Paid by</th>
                    <th scope="col" className="px-3 py-2 text-right">Total</th>
                    <th scope="col" className="px-3 py-2 text-right">Their share</th>
                    <th scope="col" className="px-3 py-2 text-right">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ expense: e, shareCents }) => (
                    <tr key={String(e._id)} className="border-t border-slate-100 dark:border-white/[0.06]">
                      <td className="max-w-44 truncate px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                        <span className="block truncate">{e.description}</span>
                        <span className="tnum mt-0.5 block truncate text-xs font-normal text-slate-400 dark:text-slate-500">
                          {e.date}{e.category ? ` · ${categoryLabel(e.category)}` : ""}
                        </span>
                      </td>
                      <td className="max-w-28 truncate px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {nameOf(e.paidBy)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money cents={e.amountCents} currency={currency} className="text-slate-600 dark:text-slate-300" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money cents={shareCents} currency={currency} className="font-bold text-slate-900 dark:text-white" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Badge tone="neutral">{splitTypeLabel(e)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 dark:border-white/10">
                    <td colSpan={3} className="px-3 py-2.5 text-left font-bold text-slate-900 dark:text-white">Total</td>
                    <td className="px-3 py-2.5 text-right">
                      <Money cents={totalCents} currency={currency} className="font-extrabold text-slate-900 dark:text-white" />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
