#!/usr/bin/env node
/**
 * Stale-reference sweep (CODING_STANDARDS.md — stale-reference sweep rule).
 *
 * Usage: npm run check:surface -- <term> [term...]
 *
 * Reports every file:line hit for each term across the repo's source and
 * docs. Report-only on purpose: at removal-scope time the hits ARE the
 * sync checklist; before review, every remaining hit must be intentional
 * (CHANGELOG entries and ADRs mention removed terms on purpose — stray
 * references elsewhere are the finding).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".claude",
  ".agents",
  ".github",
  "slidev-theme-hebmu-demo",
  "slides-exports",
]);
const SKIP_FILES = new Set(["package-lock.json"]);
const EXTS = new Set([".vue", ".ts", ".md", ".css", ".json", ".yml", ".mjs"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(p, files);
    } else if (
      !SKIP_FILES.has(entry) &&
      EXTS.has(entry.slice(entry.lastIndexOf(".")))
    ) {
      files.push(p);
    }
  }
  return files;
}

const terms = process.argv.slice(2);
if (terms.length === 0) {
  console.error("usage: npm run check:surface -- <term> [term...]");
  process.exit(2);
}

const root = process.cwd();
const files = walk(root);
let total = 0;

for (const term of terms) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const found = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) {
          found.push(
            `${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 120)}`,
          );
        }
      });
  }
  console.log(`\n== ${term}: ${found.length} hit(s)`);
  for (const hit of found) console.log(`  ${hit}`);
  total += found.length;
}

console.log(
  `\n${total} hit(s) for ${terms.length} term(s). ` +
    "Every hit must be intentional — stray references are the finding.",
);
