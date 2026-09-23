// Shared design vocabulary: buttons, inputs, cards, icons.
// Light + dark aware, 44px+ touch targets, tabular money.

function Svg({ children, className = "h-5 w-5", ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  Plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  Check: (p) => <Svg {...p}><path d="M4 12.5 9.5 18 20 6.5" /></Svg>,
  X: (p) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  Users: (p) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.6c2.4.3 4.2 2 5 4.9" /></Svg>,
  Receipt: (p) => <Svg {...p}><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z" /><path d="M9.5 8h5M9.5 12h5" /></Svg>,
  Scale: (p) => <Svg {...p}><path d="M12 3v18M5 7l7-4 7 4" /><path d="M3 13.5 5 7l2 6.5a2.1 2.1 0 0 1-4 0ZM17 13.5 19 7l2 6.5a2.1 2.1 0 0 1-4 0Z" /><path d="M8 21h8" /></Svg>,
  Clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>,
  Copy: (p) => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>,
  Download: (p) => <Svg {...p}><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>,
  Sun: (p) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></Svg>,
  Moon: (p) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></Svg>,
  ArrowRight: (p) => <Svg {...p}><path d="M4 12h15m0 0-5-5m5 5-5 5" /></Svg>,
  ArrowLeft: (p) => <Svg {...p}><path d="M20 12H5m0 0 5-5m-5 5 5 5" /></Svg>,
  Refresh: (p) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v4h-4" /></Svg>,
  Pencil: (p) => <Svg {...p}><path d="m14.5 5.5 4 4L8 20l-5 1 1-5L14.5 5.5Z" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M4 7h16M10 4h4M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" /><path d="M10 11v6M14 11v6" /></Svg>,
  Wallet: (p) => <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M16 13.5h5v-3h-5a1.5 1.5 0 0 0 0 3Z" /></Svg>,
  Split: (p) => <Svg {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.2 7.2 15.7 11M8.2 16.8 15.7 13" /></Svg>,
  Link: (p) => <Svg {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></Svg>,
  Shield: (p) => <Svg {...p}><path d="M12 3 5 6v5c0 5 3.4 8.4 7 10 3.6-1.6 7-5 7-10V6l-7-3Z" /><path d="m9.5 12 2 2 3.5-4" /></Svg>,
  Chart: (p) => <Svg {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3" /></Svg>,
  Calendar: (p) => <Svg {...p}><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></Svg>,
  Zap: (p) => <Svg {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></Svg>,
};

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] min-h-[2.75rem] px-4 text-sm whitespace-nowrap";

export function Button({ variant = "primary", size, className = "", ...rest }) {
  const sizes = {
    sm: "min-h-[2.5rem] px-3.5 text-[13px] rounded-lg",
    lg: "min-h-[3.25rem] px-6 text-[15px] rounded-2xl",
    icon: "min-h-[2.75rem] min-w-[2.75rem] p-2",
  };
  const variants = {
    primary:
      "bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900 shadow-[0_2px_8px_-2px_rgb(15_118_110/0.5)] dark:bg-teal-400 dark:text-teal-950 dark:hover:bg-teal-300 dark:shadow-[0_2px_12px_-2px_rgb(45_212_191/0.4)]",
    secondary:
      "bg-white text-slate-800 border border-slate-200 shadow-[0_1px_2px_rgb(15_23_42/0.06)] hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 dark:bg-white/[0.06] dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/10 dark:hover:border-white/15",
    soft:
      "bg-teal-700/10 text-teal-800 hover:bg-teal-700/15 active:bg-teal-700/20 dark:bg-teal-400/10 dark:text-teal-200 dark:hover:bg-teal-400/15",
    ghost:
      "text-slate-600 hover:bg-slate-900/[0.06] active:bg-slate-900/10 dark:text-slate-300 dark:hover:bg-white/10",
    dangerGhost:
      "text-red-600 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:hover:bg-red-500/10",
  };
  return (
    <button className={`${btnBase} ${sizes[size] || ""} ${variants[variant]} ${className}`} {...rest} />
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] transition-all hover:border-slate-300 hover:bg-white focus:border-teal-600 focus:bg-white focus:ring-4 focus:ring-teal-600/10 focus:outline-none min-h-[2.75rem] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:focus:border-teal-400 dark:focus:bg-white/[0.06] dark:focus:ring-teal-400/10";

export function TextInput(props) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Select(props) {
  return (
    <select {...props} className={`${inputCls} pr-9 cursor-pointer ${props.className || ""}`} />
  );
}

export function Card({ className = "", ...rest }) {
  return (
    <section
      className={`rounded-[20px] border border-slate-200/70 bg-white shadow-[var(--shadow-card)] dark:border-white/[0.08] dark:bg-[#0e1621] dark:shadow-[0_1px_2px_rgb(0_0_0/0.4)] ${className}`}
      {...rest}
    />
  );
}

export function Badge({ tone = "neutral", className = "", children }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
    teal: "bg-teal-700/10 text-teal-800 dark:bg-teal-400/10 dark:text-teal-200",
    emerald: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    rose: "bg-rose-600/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

const AVATARS = [
  "bg-teal-100 text-teal-900 dark:bg-teal-400/15 dark:text-teal-200",
  "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-200",
  "bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-200",
  "bg-lime-100 text-lime-900 dark:bg-lime-400/15 dark:text-lime-200",
];

export function Avatar({ name, className = "h-9 w-9 text-sm" }) {
  const n = String(name || "?").trim();
  const initials = n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return (
    <span aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-bold ring-2 ring-white dark:ring-white/10 ${AVATARS[h % AVATARS.length]} ${className}`}>
      {initials}
    </span>
  );
}

export function AvatarStack({ names, max = 4, className = "" }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={`flex items-center ${className}`} aria-hidden="true">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} className="h-7 w-7 text-[10px] -ml-2 first:ml-0 ring-2" />
      ))}
      {rest > 0 && (
        <span className="grid h-7 w-7 -ml-2 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white ring-2 ring-white dark:bg-white dark:text-slate-900 dark:ring-slate-900">
          +{rest}
        </span>
      )}
    </span>
  );
}

export function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/15 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}

export function Stat({ label, value, sub, icon, tone = "neutral" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-500 dark:bg-white/[0.07] dark:text-slate-400",
    teal: "bg-teal-700/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300",
    emerald: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/60 bg-slate-50/60 px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      {icon && (
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
        <span className="tnum block truncate text-[15px] font-bold text-slate-900 dark:text-white">{value}</span>
        {sub && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}

export function Progress({ value, tone = "teal", className = "" }) {
  const tones = {
    teal: "bg-teal-600 dark:bg-teal-400",
    emerald: "bg-emerald-600 dark:bg-emerald-400",
    rose: "bg-rose-500 dark:bg-rose-400",
    amber: "bg-amber-500 dark:bg-amber-400",
  };
  return (
    <span className={`block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10 ${className}`} aria-hidden="true">
      <span className={`block h-full rounded-full transition-all ${tones[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center sm:py-12">
      <span className="grid h-13 w-13 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3.5 text-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-500">
        {icon}
      </span>
      <p className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 4, className = "" }) {
  return (
    <div role="status" aria-label="Loading" className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-white/10" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/5 rounded bg-slate-200 dark:bg-white/10" />
            <div className="h-2.5 w-3/5 rounded bg-slate-100 dark:bg-white/5" />
          </div>
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-white/10" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function Tabs({ options, value, onChange, className = "" }) {
  return (
    <div role="tablist" aria-label="Group sections"
      className={`no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-[var(--shadow-card)] dark:border-white/[0.08] dark:bg-[#0e1621] ${className}`}>
      {options.map(([v, label, IconCmp, count]) => {
        const active = v === value;
        return (
          <button key={v} role="tab" aria-selected={active} onClick={() => onChange(v)}
            className={`flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-all duration-150 cursor-pointer sm:px-4 ${
              active
                ? "bg-slate-900 text-white shadow-[0_2px_8px_-2px_rgb(15_23_42/0.4)] dark:bg-white dark:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
            }`}>
            {IconCmp && <IconCmp className="h-4 w-4 shrink-0" />}
            <span className="hidden min-[380px]:inline sm:inline">{label}</span>
            <span className="min-[380px]:hidden sm:hidden">{label.split(" ")[0]}</span>
            {typeof count === "number" && (
              <span className={`tnum rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${active ? "bg-white/20 dark:bg-slate-900/10" : "bg-slate-100 dark:bg-white/10"}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Alert({ children }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
      <span aria-hidden="true" className="mt-0.5">ⓘ</span>
      <span>{children}</span>
    </p>
  );
}

export function SectionTitle({ title, sub, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
