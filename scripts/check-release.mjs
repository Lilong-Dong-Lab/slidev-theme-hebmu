#!/usr/bin/env node
/**
 * Release bookkeeping check: package.json's version must equal the newest
 * semver heading in CHANGELOG.md (Keep a Changelog). Catches a version bump
 * whose release notes still sit under [Unreleased] — the 0.4.0 miss that
 * earned this check.
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const headings = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(
  (m) => m[1],
);

if (headings.length === 0) {
  console.error("check:release — CHANGELOG.md has no release headings");
  process.exit(1);
}

const newest = headings[0]; // headings appear newest-first in the file
if (newest !== pkg.version) {
  console.error(
    `check:release — package.json is ${pkg.version} but the newest ` +
      `CHANGELOG heading is [${newest}]. Cut the release heading or ` +
      "revert the bump — a release here is the version bump plus notes.",
  );
  process.exit(1);
}

console.log(
  `check:release — package.json ${pkg.version} matches CHANGELOG [${newest}]`,
);
