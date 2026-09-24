import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { getDisplayName } from "../lib/identity";
import { Avatar, Icon } from "./ui";
import { AccountButton, AuthDialog } from "./Auth";

const THEME_KEY = "fairsplit:theme";

const NAV = [
  { to: "/", label: "Home", icon: Icon.Home, end: true },
  { to: "/create", label: "Create group", icon: Icon.Plus },
  { to: "/join", label: "Join", icon: Icon.Link },
];

function navCls({ isActive }) {
  return `flex min-h-[2.65rem] items-center rounded-xl px-4 text-[13px] font-bold transition-colors ${
    isActive
      ? "bg-lime-200 text-emerald-950 dark:bg-lime-300/15 dark:text-lime-200"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
  }`;
}

function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Layout({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const [authOpen, setAuthOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const name = getDisplayName();
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", theme === "dark" ? "#151b27" : "#f4f6fa"
    );
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="app-header sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#151b27]/90">
        <div className="app-header-inner mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            {pathname !== "/" && (
              <Link to="/" aria-label="Back to home"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 md:hidden dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100">
                <Icon.ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="FairSplit home">
              <img src="/icons/icon.svg" alt="" aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded-[13px] shadow-[0_5px_14px_-7px_rgb(20_39_29/0.7)]" />
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-extrabold leading-none tracking-tight text-slate-900 dark:text-white">
                  FairSplit
                </span>
                <span className="mt-0.5 hidden text-[11px] font-medium leading-none text-slate-400 min-[420px]:block dark:text-slate-500">
                  Split bills with friends
                </span>
              </span>
            </Link>
          </div>
          <nav aria-label="Primary" className="app-primary-nav mobile-bottom-nav">
            <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-1 px-4 sm:px-6 lg:px-8">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={navCls}>
                  <n.icon className="nav-icon h-[18px] w-[18px]" />
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {!isAuthenticated && name ? (
              <span className="hidden min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-slate-700 min-[480px]:flex dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
                <Avatar name={name} className="h-6 w-6 text-[10px] ring-1" />
                <span className="max-w-28 truncate">{name}</span>
              </span>
            ) : !isAuthenticated ? (
              <span className="hidden rounded-full bg-lime-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 min-[560px]:inline-block dark:bg-lime-300/10 dark:text-lime-200">
                Guests view free
              </span>
            ) : null}
            <AccountButton onSignIn={() => setAuthOpen(true)} />
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="grid h-10 w-10 place-items-center rounded-xl border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800 cursor-pointer dark:text-slate-400 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-slate-100"
            >
              {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-9 lg:px-8">{children}</main>
      <footer className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8 dark:text-slate-500">
        <div className="flex flex-col items-center gap-2.5 border-t border-slate-200/70 pt-5 text-center dark:border-white/[0.07]">
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-semibold">
            {["Private by link", "Free accounts", "Live balances", "Free forever"].map((t) => (
              <span key={t} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                {t}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600">FairSplit · everyone sees the same numbers</p>
        </div>
      </footer>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
