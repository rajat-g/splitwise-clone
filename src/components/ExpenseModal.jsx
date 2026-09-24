import { useState } from "react";
import { buildSplits, localDateString } from "../lib/split";
import { DEFAULT_CATEGORY, EXPENSE_CATEGORIES, normalizeCategory } from "../lib/categories";
import { Alert, Avatar, Button, Field, Select, TextInput } from "./ui";
import { Sheet } from "./Sheet";

const mid = (m) => String(m._id ?? m.id);
const displayOf = (m) => m?.name || String(m?.email ?? "").trim() || "Unknown";
// Emails stay out of the list unless two members share a display name —
// then only the colliding rows show theirs to stay distinguishable.
const optionLabel = (m, all) => {
  const name = displayOf(m);
  const email = String(m?.email ?? "").trim().toLowerCase();
  if (!email || name.toLowerCase() === email) return name;
  const clash = (all || []).some(
    (o) => o !== m && String(o?.name || "").trim().toLowerCase() === name.toLowerCase()
  );
  return clash ? `${name} (${email})` : name;
};
const MODES = [["equal", "Equal"], ["exact", "Exact"], ["percent", "%"], ["shares", "Shares"]];

// Editing restores the saved mode so the existing split stays intact.
function initialMode(expense) {
  return expense?.splitMode ?? "equal";
}

export default function ExpenseModal({ members, currency, initial, onClose, onSave, saving }) {
  const [description, setDescription] = useState(initial?.description || "");
  const [amount, setAmount] = useState(initial?.amount?.toString() || "");
  const [paidBy, setPaidBy] = useState(initial?.paidBy ? String(initial.paidBy) : (members[0] ? mid(members[0]) : ""));
  const [date, setDate] = useState(initial?.date || localDateString());
  const [category, setCategory] = useState(() => initial?.category ?? DEFAULT_CATEGORY);
  const [mode, setMode] = useState(() => initialMode(initial));
  const [included, setIncluded] = useState(() => {
    if (initial?.splits) return Object.keys(initial.splits).map(String);
    return members.map(mid);
  });
  const [values, setValues] = useState(() => ({ ...(initial?.splits || {}) }));
  const [error, setError] = useState("");

  const toggle = (id) =>
    setIncluded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (!description.trim()) return setError("Add a short description, like “Dinner”.");
    const { splits, error: err } = buildSplits({ amount, memberIds: included, mode, values });
    if (err) return setError(err);
    if (!paidBy) return setError("Choose who paid.");
    onSave({ description, amount: Number(amount), paidBy, splits, date, category: normalizeCategory(category), splitMode: mode });
  };

  return (
    <Sheet title={initial ? "Edit expense" : "Add an expense"} subtitle="Everyone in the group sees it instantly." onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Description">
          <TextInput placeholder="Dinner, taxi, groceries…" value={description}
            onChange={(e) => setDescription(e.target.value)} autoFocus maxLength={140} />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={`Amount (${currency})`}>
            <TextInput type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" />
          </Field>
          <Field label="Paid by">
            <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {members.map((m) => <option key={mid(m)} value={mid(m)}>{optionLabel(m, members)}</option>)}
              {!members.some((m) => mid(m) === String(paidBy)) && initial?.paidByName && (
                <option value={paidBy} disabled>{initial.paidByName} (left)</option>
              )}
            </Select>
          </Field>
          <Field label="Date" className="col-span-2 sm:col-span-1">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Category" className="col-span-2 sm:col-span-1">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">Split</span>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200/70 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04]" role="group" aria-label="Split mode">
            {MODES.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setMode(v)} aria-pressed={mode === v}
                className={`min-h-[2.75rem] rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  mode === v
                    ? "bg-white text-slate-900 shadow-[0_1px_4px_rgb(15_23_42/0.12)] dark:bg-white/15 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}>{l}</button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            {mode === "equal" && "Split evenly across everyone checked below."}
            {mode === "exact" && "Enter the exact amount each person owes."}
            {mode === "percent" && "Percentages must add up to 100."}
            {mode === "shares" && "Split proportionally — e.g. 2 shares pays double of 1."}
          </p>
        </div>

        <ul className="thin-scroll max-h-60 space-y-1 overflow-y-auto rounded-2xl border border-slate-200/70 bg-slate-50/40 p-1.5 dark:border-white/10 dark:bg-white/[0.02]">
          {members.map((m) => {
            const id = mid(m);
            const on = included.includes(id);
            return (
              <li key={id}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white dark:hover:bg-white/[0.05] ${on ? "" : "opacity-45"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(id)}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-teal-700 dark:accent-teal-400" />
                  <Avatar name={m.name} className="h-7 w-7 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{optionLabel(m, members)}</span>
                  {on && mode !== "equal" && (
                    <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${optionLabel(m, members)} ${mode === "percent" ? "percent" : mode === "shares" ? "shares" : "amount"}`}
                      placeholder={mode === "percent" ? "%" : mode === "shares" ? "shares" : "0.00"}
                      className="tnum w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                      value={values[id] ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
                    />
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {error && <Alert>{error}</Alert>}

        <div className="flex flex-col-reverse gap-2.5 pt-1 min-[420px]:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={saving} className="flex-[2]">
            {saving ? "Saving…" : initial ? "Save changes" : "Add expense"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
