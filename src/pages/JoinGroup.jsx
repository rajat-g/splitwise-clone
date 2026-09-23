import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { normalizeInviteCode } from "../lib/split";
import { getDisplayName, setDisplayName } from "../lib/identity";
import { Alert, Button, Card, Field, TextInput } from "../components/ui";

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
    <div className="mx-auto w-full max-w-xl">
      <div className="pt-1 sm:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Join with an invite
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
          Paste the link or 10-character code your friend shared. No account needed to look around — sign in only to add.
        </p>
      </div>

      <Card className="mt-4 p-5 sm:p-7">
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
  );
}
