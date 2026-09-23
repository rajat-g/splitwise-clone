// One-command Convex Auth key setup — works on Windows, macOS, and Linux.
// Generates JWT_PRIVATE_KEY + JWKS and sets them on your Convex deployment
// via `npx convex env set` (values passed as argv, so no shell-quoting
// issues in PowerShell, cmd, or bash).
//
// Usage:
//   node scripts/setup-auth.mjs              # dev deployment
//   node scripts/setup-auth.mjs --prod       # production deployment
//   node scripts/setup-auth.mjs --dry-run    # show what would run, change nothing
//
// Requires: `npx convex dev` to have been run once (Convex project + login).

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const _require = createRequire(import.meta.url);

function convexBin() {
  const pkgPath = _require.resolve("convex/package.json");
  const pkg = _require("convex/package.json");
  const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.convex;
  if (!binRel) throw new Error('Unexpected "convex" package layout (no bin entry).');
  return path.join(path.dirname(pkgPath), binRel);
}

function runConvex(convexArgs, { capture = false } = {}) {
  // Run the Convex CLI directly with this Node binary: exact argv on every
  // OS. Deliberately no npx and no shell — both mangle secret values with
  // spaces on Windows (PowerShell/cmd quoting, npm shims).
  let bin;
  try {
    bin = convexBin();
  } catch {
    throw new Error('Could not find the local "convex" package. Run "npm install" in the project first.');
  }
  const res = spawnSync(process.execPath, [bin, ...convexArgs], {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });
  if (res.error) {
    throw new Error(`Could not launch the Convex CLI: ${res.error.message}.`);
  }
  return res;
}

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const DRY_RUN = args.includes("--dry-run");
const SCOPE = PROD ? ["--prod"] : [];

function mask(s) {
  const v = String(s);
  if (v.length <= 16) return "***";
  return `${v.slice(0, 8)}...${v.slice(-4)} (${v.length} chars, hidden)`;
}

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

console.log(`Convex Auth setup -> ${PROD ? "PROD" : "dev"} deployment\n`);

if (DRY_RUN) {
  console.log("[dry-run] would run:");
  console.log(`  npx convex env set JWT_PRIVATE_KEY ${mask(privateKey)} ${SCOPE.join(" ")}`.trimEnd());
  console.log(`  npx convex env set JWKS ${mask(jwks)} ${SCOPE.join(" ")}`.trimEnd());
  console.log("\n[dry-run] nothing changed.");
  process.exit(0);
}

for (const [name, value] of [["JWT_PRIVATE_KEY", privateKey], ["JWKS", jwks]]) {
  // "--" ends option parsing: values starting with "-" (like the
  // "-----BEGIN ..." key) must not be mistaken for CLI flags.
  const res = runConvex(["env", "set", "--", name, value, ...SCOPE]);
  if (res.status !== 0) {
    console.error(
      `\nFailed to set ${name} (exit ${res.status}). ` +
        `Are you logged in? Run "npx convex dev" once, then retry${PROD ? " (note: --prod needs a deployed project)" : ""}.`
    );
    process.exit(1);
  }
  console.log(`  [ok] ${name} set (${value.length} chars)`);
}

// Verify both vars are visible on the deployment.
try {
  const list = runConvex(["env", "list", ...SCOPE], { capture: true });
  const out = String(list.stdout || "");
  if (list.status === 0 && out.includes("JWT_PRIVATE_KEY") && out.includes("JWKS")) {
    console.log("  [ok] verified via `npx convex env list`");
  } else {
    console.warn("  [warn] could not verify via `npx convex env list` — check manually.");
  }
} catch {
  console.warn("  [warn] could not verify via `npx convex env list` — check manually.");
}

console.log(
  `\nDone. Next: run "npx convex dev"${PROD ? ' (or "npx convex deploy")' : ""} to push functions, then sign in from the app header.`
);
console.log("Note: SITE_URL is only needed for OAuth/magic-link providers — not for email + password.");
