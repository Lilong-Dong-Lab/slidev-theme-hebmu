#!/usr/bin/env node
/**
 * Installs the #81 pre-push release gate: writes .git/hooks/pre-push so
 * every push runs scripts/check-push.mjs. Idempotent — safe to rerun.
 */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";

const HOOK_PATH = ".git/hooks/pre-push";
const MARKER = "check-push.mjs";
const HOOK_BODY = `#!/bin/sh
# Installed by scripts/setup-hooks.mjs (#81). Runs the release gate
# before pushing. Bypass: git push --no-verify (CI still enforces).
node scripts/check-push.mjs
`;

let existing = null;
try {
  existing = readFileSync(HOOK_PATH, "utf8");
} catch {
  // no existing hook — first install
}

if (existing !== null && !existing.includes(MARKER)) {
  // Never clobber another tool's hook; the gate opts in, it does not
  // take over .git/hooks.
  console.error("setup:hooks — existing pre-push hook is not ours; not touched");
  process.exit(1);
}

writeFileSync(HOOK_PATH, HOOK_BODY);
chmodSync(HOOK_PATH, 0o755);
console.log("setup:hooks — wrote .git/hooks/pre-push (release gate #81)");
