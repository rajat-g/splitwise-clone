export function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

export function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function memberKey(m) {
  return String(m._id ?? m.id);
}

function expenseAmountCents(e) {
  if (Number.isInteger(e.amountCents)) return e.amountCents;
  return toCents(e.amount);
}

function expenseSplitsCents(e) {
  // Shape: [{ memberId, amountCents }]
  if (Array.isArray(e.splits)) {
    return e.splits.map((s) => ({ id: String(s.memberId), cents: s.amountCents }));
  }
  return Object.entries(e.splits || {}).map(([id, amt]) => ({ id: String(id), cents: toCents(amt) }));
}

export const CURRENCIES = ["$", "€", "£", "₹", "¥", "₩", "A$", "C$", "R$", "₺", "₽", "₴", "₦", "₱", "฿", "kr", "CHF", "zł"];

export function fmt(amount, currency = "$") {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(n).toFixed(2)}`;
}

/**
 * Compute per-member balances from expenses.
 * Returns dollars (float, 2dp). Convention: >0 means others owe them.
 */
export function computeBalances(members, expenses) {
  const balCents = {};
  members.forEach((m) => (balCents[memberKey(m)] = 0));
  for (const e of expenses) {
    const amt = expenseAmountCents(e);
    const paidBy = String(e.paidBy);
    if (e.isSettlement) {
      if (balCents[paidBy] !== undefined) balCents[paidBy] += amt;
      const receiver = expenseSplitsCents(e)[0];
      if (receiver && balCents[receiver.id] !== undefined) balCents[receiver.id] -= receiver.cents;
    } else {
      if (balCents[paidBy] !== undefined) balCents[paidBy] += amt;
      for (const s of expenseSplitsCents(e)) {
        if (balCents[s.id] !== undefined) balCents[s.id] -= s.cents;
      }
    }
  }
  const out = {};
  for (const k of Object.keys(balCents)) out[k] = fromCents(balCents[k]);
  return out;
}

/** Greedy debt simplification: minimize number of payments. */
export function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, b] of Object.entries(balances)) {
    const r = Math.round(b * 100) / 100;
    if (r > 0.005) creditors.push({ id, amt: r });
    else if (r < -0.005) debtors.push({ id, amt: -r });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const x = Math.round(Math.min(d.amt, c.amt) * 100) / 100;
    out.push({ from: d.id, to: c.id, amount: x });
    d.amt = Math.round((d.amt - x) * 100) / 100;
    c.amt = Math.round((c.amt - x) * 100) / 100;
    if (d.amt < 0.005) i++;
    if (c.amt < 0.005) j++;
  }
  return out;
}

/** Build splits map from UI split mode. Returns { splits, error }. */
export function buildSplits({ amount, memberIds, mode, values }) {
  const total = Number(amount) || 0;
  if (total <= 0) return { error: "Enter an amount greater than 0." };
  if (!memberIds.length) return { error: "Select at least one person for this expense." };
  const splits = {};

  if (mode === "equal") {
    const share = Math.floor((total / memberIds.length) * 100) / 100;
    let remainder = Math.round((total - share * memberIds.length) * 100) / 100;
    memberIds.forEach((id, idx) => {
      splits[id] = share + (idx === 0 ? remainder : 0);
    });
  } else if (mode === "exact") {
    let sumCents = 0;
    for (const id of memberIds) {
      const v = Number(values?.[id]) || 0;
      const cents = Math.round(v * 100);
      splits[id] = cents / 100;
      sumCents += cents;
    }
    const totalCents = Math.round(total * 100);
    if (sumCents !== totalCents) {
      return { error: `Exact amounts add to ${(sumCents / 100).toFixed(2)}, must equal ${(totalCents / 100).toFixed(2)}.` };
    }
  } else if (mode === "percent") {
    let pctSum = 0;
    for (const id of memberIds) pctSum += Number(values?.[id]) || 0;
    if (Math.abs(pctSum - 100) > 0.01) return { error: `Percentages add to ${pctSum}%, must equal 100%.` };
    memberIds.forEach((id, idx) => {
      const pct = Number(values?.[id]) || 0;
      splits[id] = idx === memberIds.length - 1
        ? Math.round((total - Object.values(splits).reduce((a, b) => a + b, 0)) * 100) / 100
        : Math.round(((total * pct) / 100) * 100) / 100;
    });
  } else if (mode === "shares") {
    let totalShares = 0;
    for (const id of memberIds) totalShares += Number(values?.[id]) || 0;
    if (totalShares <= 0) return { error: "Enter at least 1 share." };
    memberIds.forEach((id, idx) => {
      const s = Number(values?.[id]) || 0;
      splits[id] = idx === memberIds.length - 1
        ? Math.round((total - Object.values(splits).reduce((a, b) => a + b, 0)) * 100) / 100
        : Math.round(((total * s) / totalShares) * 100) / 100;
    });
  }
  return { splits };
}

export function splitsMapToArray(splitsMap) {
  return Object.entries(splitsMap || {}).map(([memberId, amt]) => ({
    memberId,
    amountCents: toCents(amt),
  }));
}

/** Normalize an expense back to modal-friendly { amount, splitsMap }. */
export function expenseToForm(e) {
  if (!e) return null;
  const splitsMap = {};
  for (const s of expenseSplitsCents(e)) splitsMap[s.id] = fromCents(s.cents);
  return { ...e, amount: fromCents(expenseAmountCents(e)), splits: splitsMap };
}

/** Display grouping: "KX7Q9M2PAB" -> "KX7Q-9M2P-AB". */
export function formatInviteCode(code) {
  const c = String(code || "");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

/** Strip spaces/dashes, uppercase — matches server normalizeCode. */
export function normalizeInviteCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const SPLIT_MODE_LABELS = { equal: "Equal", exact: "Exact", percent: "%", shares: "Shares" };

/** Human label for how an expense was split. Infers for docs saved before splitMode existed. */
export function splitTypeLabel(e) {
  const m = String(e?.splitMode ?? "").trim().toLowerCase();
  if (SPLIT_MODE_LABELS[m]) return SPLIT_MODE_LABELS[m];
  const splits = Array.isArray(e?.splits) ? e.splits : [];
  if (splits.length <= 1) return "Equal";
  const first = splits[0]?.amountCents;
  return splits.every((s) => s.amountCents === first) ? "Equal" : "Custom";
}
