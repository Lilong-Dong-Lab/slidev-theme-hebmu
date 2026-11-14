#!/usr/bin/env node
/**
 * Pre-push release gate (#81): when the working package.json version
 * differs from the newest version already out there — origin/main or the
 * newest semver tag, whichever is higher — run scripts/check-release.mjs;
 * a bump whose CHANGELOG notes are missing cannot be pushed. Equal
 * versions exit 0 silently.
 * Called by the pre-push hook installed via npm run setup:hooks; a nonzero
 * exit aborts the push (bypass: git push --no-verify, CI still enforces).
 * Runnable standalone as npm run check:push.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const parse = (v) =>
  /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v ?? "")?.slice(1).map(Number) ?? null;
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// A gate must not crash: unreadable or malformed package.json degrades to
// unknown-local (null), which takes the conservative check path below.
let local = null;
try {
  local = parse(JSON.parse(readFileSync("package.json", "utf8")).version);
} catch {
  local = null;
}

const remote = spawnSync("git", ["show", "origin/main:package.json"], {
  encoding: "utf8",
});
let remoteVersion = null;
if (remote.status === 0) {
  try {
    remoteVersion = parse(JSON.parse(remote.stdout).version);
  } catch {
    remoteVersion = null;
  }
}
const tags = spawnSync("git", ["tag", "--list"], { encoding: "utf8" });
const tagVersion =
  tags.status === 0
    ? tags.stdout
        .split("\n")
        .map((t) => parse(t))
        .filter(Boolean)
        .sort(cmp)
        .at(-1) ?? null
    : null;
// "Already out there" means either source carries the version, so the
// comparison takes the newest of the two — a matching tag silences even
// when origin/main trails behind it.
const pushed = [remoteVersion, tagVersion].filter(Boolean).sort(cmp).at(-1) ?? null;
// No resolvable comparison version (no origin/main, no tags): 0.0.0 makes
// the gate run check:release, so the first push after adopting it always
// checks — the conservative direction.
const baseline = pushed ?? [0, 0, 0];

if (local && cmp(local, baseline) === 0) process.exit(0);

if (!local) {
  // Fail closed with a clean message: an unknown local version still
  // routes to check:release rather than crashing the push with a trace.
  console.error("pre-push: package.json unreadable or malformed — running check:release");
} else {
  console.error(
    `pre-push: version ${local.join(".")} != pushed ` +
      `${baseline.join(".")} — running check:release`,
  );
}
const check = spawnSync("node", ["scripts/check-release.mjs"], {
  stdio: "inherit",
});
process.exit(check.status ?? 1);
