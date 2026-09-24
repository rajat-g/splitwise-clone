import { useState } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Alert, Avatar, Button, Field, TextInput } from "./ui";
import { Sheet } from "./Sheet";
import { useOnline } from "../lib/useOnline";
import { getOutbox, opBelongsTo, useOutbox } from "../lib/offline";
import { syncAllUserOps } from "../lib/sync";

function friendlyError(err) {
  const raw = typeof err === "string" ? err : (err?.data ?? err?.message ?? "");
  // Convex wraps backend throws, e.g.:
  // "[CONVEX A(auth:signIn)] [Request ID: …] Server Error
  //  Uncaught Error: InvalidSecret Called by client"
  // Strip the transport noise before matching so users never see it.
  const m = String(raw)
    .replace(/\[CONVEX[^\]]*\]/gi, "")
    .replace(/\[Request ID:[^\]]*\]/gi, "")
    .replace(/server error/gi, "")
    .replace(/uncaught (convex)?error:\s*/gi, "")
    .replace(/called by client\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // Wrong password (Convex Auth code is "InvalidSecret"). Kept generic on
  // purpose — it must not reveal whether the email is registered.
  if (/invalidsecret/i.test(m)) return "Incorrect email or password. Check both and try again.";
  if (/already exists|already in use|account exists/i.test(m))
    return "An account with this email already exists. Try signing in instead.";
  if (/could not verify code|invalid code/i.test(m))
    return "That code didn't match. Check the email and try again.";
  if (/invalid credentials|incorrect|not found|no user/i.test(m))
    return "Email or password didn't match. Check both and try again.";
  if (/at least 8/i.test(m)) return "Password must be at least 8 characters.";
  if (/valid email/i.test(m)) return "Enter a valid email address.";
  return m.slice(0, 280) || "Something went wrong. Try again.";
}

export function AuthDialog({ onClose }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState("signIn");
  const [step, setStep] = useState("credentials");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signedIn = (result) => !!(result && typeof result === "object" && result.signingIn);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "signUp" && !name.trim()) {
      setError("Enter your name — friends will see it on expenses.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("email", email.trim().toLowerCase());
      form.set("password", password);
      form.set("flow", mode === "signUp" ? "signUp" : "signIn");
      if (mode === "signUp") form.set("name", name.trim());
      const result = await signIn("password", form);
      // Verified session → done. Otherwise the backend emailed a one-time
      // code instead of signing in — collect it below, never close early.
      if (signedIn(result)) {
        onClose();
        return;
      }
      setCode("");
      setCodeNotice(mode === "signUp" ? "Account created — verify it below to finish signing in." : "");
      setStep("code");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("flow", "email-verification");
      form.set("email", email.trim().toLowerCase());
      form.set("code", code.trim());
      const result = await signIn("password", form);
      if (signedIn(result)) {
        onClose();
        return;
      }
      setError("That code didn't match. Check the email and try again.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setError("");
    setCodeNotice("");
    setBusy(true);
    try {
      // Re-running sign-in re-issues a fresh code (the account exists now).
      const form = new FormData();
      form.set("email", email.trim().toLowerCase());
      form.set("password", password);
      form.set("flow", "signIn");
      const result = await signIn("password", form);
      if (signedIn(result)) {
        onClose();
        return;
      }
      setCodeNotice("Sent a fresh code — check your inbox.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const backToCredentials = () => {
    setError("");
    setCodeNotice("");
    setCode("");
    setStep("credentials");
  };

  if (step === "code") {
    return (
      <Sheet
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${email.trim().toLowerCase()}. It expires in 15 minutes — enter it to prove this address is yours.`}
        onClose={onClose}
      >
        <form onSubmit={submitCode} className="space-y-3.5">
          <Field label="Verification code">
            <TextInput placeholder="123456" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code" inputMode="numeric" maxLength={6} autoFocus />
          </Field>
          {codeNotice && <p className="rounded-xl bg-teal-700/10 px-3.5 py-2.5 text-sm font-medium text-teal-800 dark:bg-teal-400/10 dark:text-teal-200">{codeNotice}</p>}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy || code.trim().length !== 6} className="w-full !min-h-[3rem]">
            {busy ? "Verifying…" : "Verify and sign in"}
          </Button>
          <p className="flex items-center justify-center gap-4 text-center text-sm text-slate-500 dark:text-slate-400">
            <button type="button" onClick={resendCode} disabled={busy}
              className="font-semibold text-teal-700 hover:underline disabled:opacity-50 cursor-pointer dark:text-teal-300">
              Resend code
            </button>
            <button type="button" onClick={backToCredentials} disabled={busy}
              className="font-semibold text-teal-700 hover:underline disabled:opacity-50 cursor-pointer dark:text-teal-300">
              Use a different email
            </button>
          </p>
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={mode === "signUp" ? "Create your account" : "Welcome back"}
      subtitle={mode === "signUp" ? "Free forever. Syncs your groups across devices." : "Sign in to see groups you created on any device."}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3.5">
        {mode === "signUp" && (
          <Field label="Your name">
            <TextInput placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} />
          </Field>
        )}
        <Field label="Email">
          <TextInput type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
        </Field>
        <Field label="Password" hint={mode === "signUp" ? "At least 8 characters. Stored securely, never shown to friends." : undefined}>
          <TextInput type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signUp" ? "new-password" : "current-password"} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={busy} className="w-full !min-h-[3rem]">
          {busy ? "Please wait…" : mode === "signUp" ? "Create free account" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {mode === "signUp" ? "Already have an account? " : "New here? "}
          <button type="button" onClick={() => { setError(""); setMode(mode === "signUp" ? "signIn" : "signUp"); }}
            className="font-semibold text-teal-700 hover:underline cursor-pointer dark:text-teal-300">
            {mode === "signUp" ? "Sign in" : "Create account"}
          </button>
        </p>
        <p className="text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Guests can open your link and view everything — only signed-in members can add.
        </p>
      </form>
    </Sheet>
  );
}

export function AccountButton({ onSignIn }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const { signOut } = useAuthActions();
  const convexClient = useConvex();
  const online = useOnline();
  const outbox = useOutbox();
  const [menu, setMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Queued writes belong to the account that created them. Never let them
  // silently ride along into another session: flush while online, warn while
  // offline. They stay queued for this account either way.
  const myUnsynced = (list) =>
    (list || []).filter(
      (o) => (o.status === "pending" || o.status === "failed") && opBelongsTo(o, viewer?._id ?? null)
    );

  const handleSignOut = async () => {
    const count = myUnsynced(outbox).length;
    if (count === 0) {
      setMenu(false);
      await signOut();
      return;
    }
    if (!online) {
      if (!confirm(
        `You have ${count} unsynced change${count === 1 ? "" : "s"}. ` +
        "They only sync under this account — keep this account signed in until they sync, or sign out and let them sync when you sign back in.\n\n" +
        "Sign out anyway?"
      )) return;
      setMenu(false);
      await signOut();
      return;
    }
    setSigningOut(true);
    try {
      await syncAllUserOps(convexClient, viewer?._id ?? null);
    } finally {
      setSigningOut(false);
    }
    const left = myUnsynced(getOutbox()).length;
    if (left > 0 && !confirm(
      `${left} change${left === 1 ? "" : "s"} couldn't sync ` +
      "(they stay queued for this account). Sign out anyway?"
    )) return;
    setMenu(false);
    await signOut();
  };

  if (isLoading) {
    return <span className="h-10 w-20 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" aria-label="Checking session" />;
  }

  if (!isAuthenticated) {
    return (
      <Button variant="secondary" onClick={onSignIn} className="!min-h-[2.5rem]">
        Sign in
      </Button>
    );
  }

  const label = viewer?.name || viewer?.email?.split("@")[0] || "Account";
  return (
    <span className="relative">
      <button onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
        className="flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/10">
        <Avatar name={label} className="h-7 w-7 text-[11px]" />
        <span className="max-w-24 truncate max-sm:hidden">{label}</span>
      </button>
      {menu && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />
          <span role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-pop)] animate-rise dark:border-white/10 dark:bg-[#0e1621]">
            <span className="block px-4 py-3">
              <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{label}</span>
              {viewer?.email && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{viewer.email}</span>}
              <span className="mt-1.5 inline-block rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Free account</span>
            </span>
            <span className="block border-t border-slate-100 dark:border-white/[0.07]">
              <button onClick={handleSignOut} disabled={signingOut}
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10">
                {signingOut ? "Syncing…" : "Sign out"}
              </button>
            </span>
          </span>
        </>
      )}
    </span>
  );
}
