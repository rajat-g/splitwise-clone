import { Button, Icon } from "./ui";

function opLabel(op) {
  if (op.kind === "add") {
    const desc = op.entry?.description || "expense";
    return op.entry?.isSettlement ? `Payment queued: ${desc}` : `Expense queued: ${desc}`;
  }
  if (op.kind === "update") return "Edit queued";
  return "Delete queued";
}

export function OutboxBar({ items, online, syncing, onSync, onRetry, onDiscard }) {
  if (!items.length) return null;
  const pending = items.filter((o) => o.status !== "failed");
  const failed = items.filter((o) => o.status === "failed");

  return (
    <div className="rounded-[20px] border border-amber-500/25 bg-amber-50 px-4 py-3.5 sm:px-5 dark:border-amber-400/20 dark:bg-amber-400/[0.06]">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
          <Icon.Clock className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            {pending.length > 0 ? (
              <span>
                <b className="tnum">{pending.length} change{pending.length === 1 ? "" : "s"}</b> waiting to sync
                {!online && " — you're offline"}
                {syncing && " — syncing…"}
              </span>
            ) : (
              <span><b>{failed.length} change{failed.length === 1 ? "" : "s"}</b> couldn&apos;t sync</span>
            )}
          </span>
        </p>
        <Button size="sm" variant="secondary" onClick={onSync} disabled={!online || syncing || pending.length === 0} className="shrink-0">
          <Icon.Refresh className="h-4 w-4" />
          {syncing ? "Syncing…" : online ? "Sync now" : "Offline"}
        </Button>
      </div>
      {failed.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {failed.map((o) => (
            <li key={o.opId} className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-[13px] dark:bg-white/[0.04]">
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                {opLabel(o)}
                {o.error && <span className="text-slate-400 dark:text-slate-500"> — {o.error}</span>}
              </span>
              <button onClick={() => onRetry(o.opId)} disabled={!online}
                className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-teal-700 hover:bg-teal-700/10 cursor-pointer disabled:opacity-40 dark:text-teal-300">
                Retry
              </button>
              <button onClick={() => onDiscard(o.opId)}
                className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-red-600 hover:bg-red-50 cursor-pointer dark:text-red-400 dark:hover:bg-red-500/10">
                Discard
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
