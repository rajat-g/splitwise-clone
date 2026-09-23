# FairSplit — Splitwise clone (Convex + Vercel, both free)

Realtime group expense splitting. Guests can open a link and view everything — only signed-in members can add. Free email + password accounts (Convex Auth) required for any write.

## Features

- Groups with per-group currency, unguessable link (`publicId`) + rotatable 10-char invite code
- Members by name, scoped to their group (add/rename/remove with validation, per-member settle shortcut, self leave flow, remove blocked on non-zero balance, validated server-side)
- Expenses with equal / exact / % / shares splits, edit/delete (settlements immutable)
- Live balances + simplified debts ("who pays whom"), settle-up payments
- Activity feed, CSV export, recent-groups on device
- Free account (Convex Auth email + password) required to create groups, add/edit/delete expenses, settle up, manage members, rotate codes; guests have read-only access; My groups sync across devices
- Responsive UI for mobile, tablet, desktop; light + dark themes

## Vendors (2, both $0)

1. **Convex** — realtime DB + validators (`convex/`) + auth. Free: 1M calls/mo.
2. **Vercel** — static hosting for `dist/`. Free hobby tier.

No third-party auth provider. Password login runs on your Convex project — nothing extra to pay for.

## Run locally

```bash
npm install
npx convex dev        # login, creates free project, generates convex/_generated
# copy its URL to .env as VITE_CONVEX_URL=...
npm run dev           # http://localhost:5173
```

## Auth setup (one time, free, required for writes)

All mutations (create group, expenses, settlements, members, rotate code) require sign-in — enforced server-side. Queries (view group, expenses, balances, activity) stay public so guests can view via link.

One command (Windows, macOS, Linux) — generates the keys and sets them, no copy-paste:

```bash
npm run setup:auth              # dev deployment
npm run setup:auth -- --prod    # production deployment
```

Then `npx convex dev` (or `npx convex deploy` for prod) to push functions.

Manual alternative: `node scripts/generate-auth-keys.mjs`, then
`npx convex env set JWT_PRIVATE_KEY "<value>"` and
`npx convex env set JWKS '<value>'` (quoting differs per shell — the script avoids this).

Account behavior:

- Sign in/up from the header button. Sign-up fields: name, email, password (min 8 chars).
- Groups get `ownerUserId` and appear under **My groups** on Home, on any device.
- Guests opening an invite link can view balances, expenses, members, activity — add/edit/delete buttons are hidden and the backend rejects writes with "Sign in to make changes."
- No email verification or password reset wired. Adding reset needs an email sender (e.g. Resend free tier) — ask if you want it.

## Offline mode

Signed-in members can keep adding transactions with no connection. They queue on-device (localStorage) and sync automatically when back online.

- Works offline: add expense, edit expense, delete expense, record settle-up payment. Queued rows show a **queued** badge and count toward balances immediately.
- Viewable offline: last saved copy of a previously opened group (members, expenses, balances, activity). A group never opened on the device shows an offline notice instead.
- Needs connection: group creation, member add/remove, invite-code rotation, sign-in itself.
- Sync: auto-runs on reconnect/sign-in; or **Sync now** in the queue bar. Retried syncs are deduped by `clientId`, so a failed-then-retried add can never insert twice. Edits to a not-yet-synced add merge into it; deleting one just drops it.
- Conflicts: if an op fails on replay (e.g. data changed meanwhile), it stays in the queue with the server error and **Retry** / **Discard** actions. Retrying a single op syncs pending ops too, in order.
- Queue survives reloads and sign-outs; it syncs after the next sign-in.

## Deploy

```bash
npx convex deploy
npx convex env set SITE_URL https://your-app.vercel.app --prod
# Vercel: import repo, set env VITE_CONVEX_URL to the PROD Convex URL, deploy.
# vercel.json already handles SPA rewrites (/g/:id).
```

`JWT_PRIVATE_KEY` / `JWKS` are backend env vars (Convex dashboard or `npx convex env set`). They do not go in Vercel. Only `VITE_CONVEX_URL` goes in Vercel.

## Env vars

| Where | Var | Purpose |
|---|---|---|
| `.env` / Vercel | `VITE_CONVEX_URL` | Convex dev or prod URL |
| Convex backend | `JWT_PRIVATE_KEY` | Auth signing key (from generator script) |
| Convex backend | `JWKS` | Auth public keys (from generator script) |
| Convex backend | `SITE_URL` | Dev (`http://localhost:5173`) and prod (`--prod`) app URL |

See `.env.example`.

## Project structure

- `convex/schema.ts` — groups, members, expenses, activity + `authTables`
- `convex/auth.ts`, `auth.config.ts`, `http.ts` — Convex Auth (Password)
- `convex/users.ts` — `viewer`, `updateName`
- `convex/groups.ts` — create (attaches `ownerUserId` when signed in), `myGroups`, invite-code rotation
- `convex/members.ts`, `convex/expenses.ts` — server-validated mutations (`expenses` dedupes offline retries via `clientId`)
- `src/lib/offline.js` — offline outbox queue + snapshot cache
- `src/lib/sync.js` — FIFO replay of queued ops on reconnect
- `src/lib/useOnline.js` — online/offline detection hook
- `src/components/OutboxBar.jsx` — queued-changes bar with sync / retry / discard
- `src/main.jsx` — `ConvexAuthProvider`
- `src/components/Auth.jsx` — sign in/up dialog + account menu
- `src/components/Layout.jsx` — header (account, theme), footer
- `src/pages/Home.jsx` — hero, create/join, My groups, Recent groups
- `src/pages/GroupPage.jsx` — expenses / balances / members / activity tabs
- `scripts/generate-auth-keys.mjs` — JWT key generator for auth setup

## Why server validation matters here

- Validation lives on the server (`convex/expenses.ts`, `members.ts`):
  splits must sum to amount, payer/splits must be group members,
  settlements exactly 1 recipient, remove-member refused unless balance is
  exactly 0 (computed server-side in cents — no client trust).
- Money stored as integer cents — no float drift.
- No `list-all-groups` query exists → private by link by construction.
  `myGroups` only returns groups owned by the signed-in user. Member add is
  name-into-group only — there is no user directory, no text search across
  groups, and nothing to enumerate.

## Privacy

Group `publicId` (21-char secret) is the URL. `inviteCode` (10-char,
brute-force resistant) resolves via indexed lookup and can be rotated
by anyone holding the link. No enumeration endpoint.

## Testing

```bash
npm test           # all tests (backend + UI)
npm run test:watch # watch mode
npm run coverage   # with coverage report (thresholds: 90% lines/functions/statements, 85% branches)
```

- Backend (`convex/*.test.ts`): real function executions via `convex-test` (edge runtime), including auth flows with seeded users.
- Frontend (`src/**/*.test.{js,jsx}`): jsdom + Testing Library with mocked Convex hooks.
- 246 tests covering splits math, debt simplification, offline queue/sync, members, expenses, groups, auth, categories, and every page/component.

## Troubleshooting

- `Connect Convex to go live` screen → `VITE_CONVEX_URL` missing in `.env`; run `npx convex dev` and copy the URL.
- Sign-in fails after code change → backend env missing: check `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` via `npx convex env list`; re-run `npx convex dev`.
- Auth works locally but not on Vercel → set prod `SITE_URL` with `--prod`, `npx convex deploy`, and confirm Vercel has the prod `VITE_CONVEX_URL`.
