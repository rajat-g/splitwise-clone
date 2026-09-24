import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { normalizeInviteCode } from "../lib/split";
import { getDisplayName, setDisplayName } from "../lib/identity";
import { Alert, Button, Card, Field, Icon, TextInput } from "../components/ui";

export default function JoinGroup() {
  const nav = useNavigate();
  const [name, setName] = useState(getDisplayName());
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState("");

  const [codeToResolve, setCodeToResolve] = useState(null);
  const codeResult = useQuery(api.groups.getByCode, codeToResolve ? { code: codeToResolve } : "skip");
  const resolvingCode = codeToResolve !== null && codeResult === undefined;

  useEffect(() => {
    if (!codeToResolve || codeResult === undefined) return;
    if (codeResult === null) {
      setError("Code not found. Ask the owner for a fresh invite link.");
    } else if (codeResult?.publicId) {
      setJoinInput("");
      nav(`/g/${codeResult.publicId}`);
    }
    setCodeToResolve(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeToResolve, codeResult]);

  const handleJoin = (e) => {
    e.preventDefault();
    setError("");
    const v = joinInput.trim();
    if (!v) {
      setError("Paste an invite link or invite code.");
      return;
    }
    if (name.trim()) setDisplayName(name.trim());
    const m = v.match(/\/g\/([A-Za-z0-9_-]{10,})/);
    if (m) return nav(`/g/${m[1]}`);
    if (/^[A-Za-z0-9_-]{21}$/.test(v)) return nav(`/g/${v}`);
    const code = normalizeInviteCode(v);
    if (code.length !== 10) {
      setError("That code doesn't look right — it should be 10 characters.");
      return;
    }
    setCodeToResolve(code);
  };

  return (
    <div className="form-page mx-auto w-full max-w-5xl">
      <aside className="form-intro">
        <span className="form-kicker"><Icon.Link className="h-4 w-4" /> Open a shared space</span>
        <h1 className="mt-4 text-4xl font-black leading-[1.02] tracking-[-0.045em] text-slate-900 sm:text-5xl dark:text-white">
          Join with an invite
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600 dark:text-slate-300">
          Paste the link or 10-character code your friend shared. No account needed to look around — sign in only to add.
        </p>
        <ul className="form-benefits">
          <li className="form-benefit"><span className="form-benefit-icon"><Icon.Zap className="h-5 w-5" /></span><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">See updates as they happen</span></li>
          <li className="form-benefit"><span className="form-benefit-icon"><Icon.Scale className="h-5 w-5" /></span><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Check balances at a glance</span></li>
          <li className="form-benefit"><span className="form-benefit-icon"><Icon.Shield className="h-5 w-5" /></span><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">No account needed to view</span></li>
        </ul>
      </aside>

      <div className="form-main">
      <Card className="p-5 sm:p-7">
        <form onSubmit={handleJoin} className="space-y-3.5">
          <Field label="Invite link or code">
            <TextInput placeholder="Paste link or code" value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)} aria-label="Invite link or code"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              className="font-mono !text-sm" autoFocus />
          </Field>
          <Field
            label="Your name (optional)"
            hint="If it matches a member, your balance is highlighted in the group."
          >
            <TextInput placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="nickname" maxLength={40} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={resolvingCode} size="lg" className="w-full">
            {resolvingCode ? "Checking…" : "Open group"}
          </Button>
        </form>
      </Card>

      <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
        No invite yet? <Link to="/create" className="font-semibold text-teal-700 hover:underline dark:text-teal-300">Create a group</Link>
      </p>
      </div>
    </div>
  );
}
