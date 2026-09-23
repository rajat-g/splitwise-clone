import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmt, fromCents } from "../lib/split";
import { categoryColor, categoryLabel, normalizeCategory } from "../lib/categories";
import { Card, EmptyState, Icon, Progress, SectionTitle, Stat } from "./ui";

const mid = (m) => String(m._id ?? m.id);

// Compact axis amounts: $1.2k instead of $1200.00.
export function shortMoney(v, currency) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${currency}${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${currency}${Math.round(n)}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
}

// Keep long member names inside the chart axis.
export function truncateName(n) {
  const s = String(n);
  return s.length > 12 ? `${s.slice(0, 11)}…` : s;
}

// Dark-mode aware tooltip: plain div, styled with Tailwind.
export function ChartTip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[var(--shadow-pop)] dark:border-white/10 dark:bg-[#0e1621]">
      {label !== undefined && label !== "" && (
        <p className="mb-1 text-xs font-bold text-slate-900 dark:text-white">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <p key={`${p.dataKey ?? p.name}-${i}`} className="tnum flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color || p.payload?.fill || p.fill }}
            />
            <span className="capitalize">{p.name}</span>
            <span className="font-bold text-slate-900 dark:text-white">{fmt(p.value, currency)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

const tickProps = { fill: "currentColor", fontSize: 12 };
const gridProps = { stroke: "currentColor", strokeOpacity: 0.12, vertical: false };

export default function Insights({ expenses, members, currency, displayOf }) {
  const items = useMemo(
    () => (expenses ?? []).filter((e) => !e.isSettlement),
    [expenses]
  );

  const model = useMemo(() => {
    const totalCents = items.reduce((a, e) => a + (e.amountCents || 0), 0);
    const byCat = new Map();
    for (const e of items) {
      const c = normalizeCategory(e.category);
      const row = byCat.get(c) ?? { id: c, totalCents: 0, count: 0 };
      row.totalCents += e.amountCents || 0;
      row.count += 1;
      byCat.set(c, row);
    }
    const categories = [...byCat.values()]
      .map((r) => ({
        ...r,
        total: fromCents(r.totalCents),
        share: totalCents ? (r.totalCents / totalCents) * 100 : 0,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);

    const byMonth = new Map();
    for (const e of items) {
      const key = String(e.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      byMonth.set(key, (byMonth.get(key) ?? 0) + (e.amountCents || 0));
    }
    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, cents]) => ({ key, month: monthLabel(key), total: fromCents(cents) }));

    const paid = {};
    const share = {};
    members.forEach((m) => { paid[mid(m)] = 0; share[mid(m)] = 0; });
    for (const e of items) {
      const pk = String(e.paidBy);
      if (paid[pk] !== undefined) paid[pk] += e.amountCents || 0;
      for (const s of e.splits ?? []) {
        const sk = String(s.memberId);
        if (share[sk] !== undefined) share[sk] += s.amountCents || 0;
      }
    }
    const perMember = members.map((m) => ({
      name: displayOf(m),
      paid: fromCents(paid[mid(m)] || 0),
      share: fromCents(share[mid(m)] || 0),
    }));

    const biggest = items.reduce((best, e) =>
      !best || (e.amountCents || 0) > (best.amountCents || 0) ? e : best, null);
    const topPayer = perMember.reduce((best, m) =>
      !best || m.paid > best.paid ? m : best, null);

    return {
      total: fromCents(totalCents),
      count: items.length,
      avg: items.length ? fromCents(totalCents / items.length) : 0,
      categories, monthly, perMember, biggest, topPayer,
      topCategory: categories[0] ?? null,
    };
  }, [items, members, displayOf]);

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <EmptyState
          icon={<Icon.Chart className="h-6 w-6" />}
          title="No insights yet"
          body="Add an expense with a category and totals, trends and charts will appear here."
        />
      </Card>
    );
  }

  const pieData = model.categories.map((c) => ({
    name: categoryLabel(c.id), value: Math.round(c.total * 100) / 100, fill: categoryColor(c.id),
  }));

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
        <Stat
          label="Top category"
          value={model.topCategory ? categoryLabel(model.topCategory.id) : "—"}
          sub={model.topCategory ? `${model.topCategory.share.toFixed(0)}% of spending · ${fmt(model.topCategory.total, currency)}` : ""}
          icon={<Icon.Receipt className="h-4 w-4" />} tone="amber"
        />
        <Stat
          label="Biggest expense"
          value={model.biggest ? fmt(fromCents(model.biggest.amountCents), currency) : "—"}
          sub={model.biggest ? String(model.biggest.description).slice(0, 28) : ""}
          icon={<Icon.Zap className="h-4 w-4" />} tone="teal"
        />
        <Stat
          label="Average expense"
          value={fmt(model.avg, currency)}
          sub={`across ${model.count} expense${model.count === 1 ? "" : "s"}`}
          icon={<Icon.Scale className="h-4 w-4" />} tone="neutral"
        />
        <Stat
          label="Top payer"
          value={model.topPayer ? model.topPayer.name : "—"}
          sub={model.topPayer ? `paid ${fmt(model.topPayer.paid, currency)}` : ""}
          icon={<Icon.Wallet className="h-4 w-4" />} tone="emerald"
        />
      </div>

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Spending by category" sub="Share of total across all expenses." />
          <div className="tnum mx-auto mt-2 h-56 max-w-xs text-slate-500 dark:text-slate-400">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTip currency={currency} />} />
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} strokeWidth={0}>
                  {pieData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize={20} fontWeight={800}>
                  {fmt(model.total, currency).length > 9 ? shortMoney(model.total, currency) : fmt(model.total, currency)}
                </text>
                <text x="50%" y="58%" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize={11} opacity={0.7}>
                  total
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2.5">
            {model.categories.map((c) => (
              <li key={c.id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c.id) }} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">
                    {categoryLabel(c.id)}
                    <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">×{c.count}</span>
                  </span>
                  <span className="tnum shrink-0 text-xs text-slate-400 dark:text-slate-500">{c.share.toFixed(0)}%</span>
                  <span className="tnum w-20 shrink-0 text-right text-sm font-bold text-slate-900 dark:text-white">{fmt(c.total, currency)}</span>
                </div>
                <Progress value={c.share} tone="teal" className="mt-1.5" />
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-4 sm:gap-5">
          <Card className="p-5 sm:p-6">
            <SectionTitle title="Spending over time" sub="Totals per month." />
            {model.monthly.length <= 1 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Only one month so far — the trend builds up as you add expenses across months.
              </p>
            ) : (
              <div className="tnum mt-3 h-52 text-slate-500 dark:text-slate-400">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.monthly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" tick={tickProps} axisLine={false} tickLine={false} />
                    <YAxis tick={tickProps} axisLine={false} tickLine={false} width={52}
                      tickFormatter={(v) => shortMoney(v, currency)} />
                    <Tooltip content={<ChartTip currency={currency} />} cursor={{ fill: "currentColor", opacity: 0.08 }} />
                    <Bar dataKey="total" name="Spent" fill="#14b8a6" radius={[8, 8, 2, 2]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionTitle title="Paid vs share" sub="Who fronted money vs their portion." />
            <div className="tnum mt-3 h-56 text-slate-500 dark:text-slate-400">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.perMember} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" tick={tickProps} axisLine={false} tickLine={false}
                    tickFormatter={(v) => shortMoney(v, currency)} />
                  <YAxis type="category" dataKey="name" tick={tickProps} axisLine={false} tickLine={false} width={96}
                    tickFormatter={(n) => truncateName(n)} />
                  <Tooltip content={<ChartTip currency={currency} />} cursor={{ fill: "currentColor", opacity: 0.08 }} />
                  <Bar dataKey="paid" name="Paid" fill="#10b981" radius={[2, 8, 8, 2]} maxBarSize={16} />
                  <Bar dataKey="share" name="Share" fill="#f59e0b" radius={[2, 8, 8, 2]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Paid
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Share
              </span>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
