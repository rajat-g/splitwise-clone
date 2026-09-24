// Wipe all data through a resumable sequence of bounded Convex mutations.
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

function runConvex(convexArgs) {
  const res = spawnSync(process.execPath, [convexBin(), ...convexArgs], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false,
  });
  if (res.error) throw new Error(`Could not launch the Convex CLI: ${res.error.message}.`);
  if (res.status !== 0) {
    process.stderr.write(res.stderr || "");
    throw new Error(`Convex CLI exited with status ${res.status}.`);
  }
  return String(res.stdout || "");
}

function parseJsonResult(output) {
  const text = output.trim();
  try {
    return JSON.parse(text);
  } catch {
    // Convex CLI versions may add non-JSON status text around the result.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function isDeletionSummary(value) {
  const requiredTables = ["groups", "members", "expenses", "activity", "users"];
  return value && typeof value === "object" && !Array.isArray(value)
    && requiredTables.every((table) => Number.isInteger(value[table]) && value[table] >= 0)
    && Object.values(value).every((count) => Number.isInteger(count) && count >= 0);
}

console.log(`Convex wipe -> ${PROD ? "PROD" : "dev/local"} deployment`);
console.log("Tables: groups, members, expenses, activity, users, auth* (all rows)");
console.log("Auth sessions die with the wipe: everyone signs in again.\n");

if (!YES) {
  console.log("Dry run (nothing changed). Re-run with --yes to actually wipe:");
  console.log(`  node scripts/wipe.mjs --yes${PROD ? " --prod" : ""}`);
  process.exit(0);
}

const started = runConvex([
  "run", "wipe:wipeAll", JSON.stringify({ confirm: "WIPE-EVERYTHING" }), ...SCOPE,
]);
const startResult = parseJsonResult(started);
const jobId = typeof startResult?.jobId === "string" ? startResult.jobId : null;
if (!jobId && isDeletionSummary(startResult)) {
  console.log("Wipe complete. The deployment returned the deleted-row counts directly:");
  console.log(JSON.stringify(startResult, null, 2));
  process.exit(0);
}
if (!jobId) {
  process.stdout.write(started);
  throw new Error(
    "The wipe response was not recognized. The operation may already have started; " +
    "check the deployment before running the wipe again."
  );
}

console.log("Wipe scheduled; waiting for bounded deletion batches to finish…");
for (let attempt = 0; attempt < 3600; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const output = runConvex([
    "run", "wipe:status", JSON.stringify({ jobId }), ...SCOPE,
  ]);
  if (/["']?status["']?\s*:\s*["']?complete/.test(output)) {
    console.log("Wipe complete.");
    process.exit(0);
  }
  if (/null\b/.test(output)) throw new Error("The wipe job status was removed before completion.");
}
throw new Error(`Wipe job ${jobId} is still running after one hour. It will continue in Convex; check its status with npx convex run wipe:status '{"jobId":"${jobId}"}'${PROD ? " --prod" : ""}.`);
