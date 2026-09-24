import { useState } from "react";
import { Alert, Button, Field, Select, TextInput } from "./ui";
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

export default function SettleModal({ members, balances, currency, initial, onClose, onSave, saving }) {
  const debtors = members.filter((m) => (balances[mid(m)] || 0) < -0.005);
  const creditors = members.filter((m) => (balances[mid(m)] || 0) > 0.005);
  const [from, setFrom] = useState(initial?.from ?? (debtors[0] ? mid(debtors[0]) : members[0] ? mid(members[0]) : ""));
  const [to, setTo] = useState(initial?.to ?? (creditors[0] ? mid(creditors[0]) : members[1] ? mid(members[1]) : ""));
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!from || !to || from === to) return setError("Choose two different people — who paid, and who receives.");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than 0.");
    onSave({ from, to, amount: Number(amount) });
  };

  return (
    <Sheet title="Settle up" subtitle="Record a cash or UPI payment. Balances update for everyone." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="Paid by">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {members.map((m) => <option key={mid(m)} value={mid(m)}>{optionLabel(m, members)}</option>)}
            </Select>
          </Field>
          <Field label="Received by">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {members.map((m) => <option key={mid(m)} value={mid(m)}>{optionLabel(m, members)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={`Amount (${currency})`} hint="Settlements are permanent in the feed — delete the entry if you make a mistake.">
          <TextInput type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum !min-h-[3rem] !text-lg !font-bold" autoFocus />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse gap-2.5 pt-1 min-[420px]:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={saving} className="flex-[2]">
            {saving ? "Recording…" : "Record payment"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
