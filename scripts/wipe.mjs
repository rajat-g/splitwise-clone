// Wipe all data (all tables) on a Convex deployment via the guarded
// `wipe:wipeAll` internal mutation. Exists because `npx convex run` with
// inline JSON args is unreliable on Windows shells (PowerShell/cmd mangle
// the quotes) — this passes argv exactly, on every OS.
//
// Usage:
//   node scripts/wipe.mjs --yes              # dev/local deployment
//   node scripts/wipe.mjs --yes --prod       # production deployment (!!)
// Without --yes it only prints what WOULD happen. There is no undo.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const _require = createRequire(import.meta.url);

function convexBin() {
  const pkgPath = _require.resolve("convex/package.json");
  const pkg = _require("convex/package.json");
  const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.convex;
  if (!binRel) throw new Error('Unexpected "convex" package layout (no bin entry).');
  return path.join(path.dirname(pkgPath), binRel);
}

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const YES = args.includes("--yes");
const SCOPE = PROD ? ["--prod"] : [];

console.log(`Convex wipe -> ${PROD ? "PROD" : "dev/local"} deployment`);
console.log("Tables: groups, members, expenses, activity, users, auth* (all rows)");
console.log("Auth sessions die with the wipe: everyone signs in again.\n");

if (!YES) {
  console.log("Dry run (nothing changed). Re-run with --yes to actually wipe:");
  console.log(`  node scripts/wipe.mjs --yes${PROD ? " --prod" : ""}`);
  process.exit(0);
}

const res = spawnSync(
  process.execPath,
  [convexBin(), "run", "wipe:wipeAll", '{"confirm":"WIPE-EVERYTHING"}', ...SCOPE],
  { encoding: "utf8", stdio: "inherit", shell: false }
);
if (res.error) throw new Error(`Could not launch the Convex CLI: ${res.error.message}.`);
process.exit(res.status ?? 1);
