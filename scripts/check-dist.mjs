#!/usr/bin/env node
// Build-artifact sanity (#13's failure class: a silently-empty
// import.meta.glob still exits 0). Run after `npm run build`.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

// One hashed copy of each theme image, under dist/assets/, nothing at the
// dist root. New theme assets: add a line here.
const images = ["campus-cover.jpeg", "campus-end.jpeg", "hebmu-logo.png"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

let fail = false;
for (const name of images) {
  const dot = name.lastIndexOf(".");
  const hashed = new RegExp(
    `^assets/${name.slice(0, dot)}-[A-Za-z0-9_-]{8}\\.${name.slice(dot + 1)}$`,
  );
  // Count the exact root-level name (a static-copy artifact) plus hashed copies.
  const copies = walk("dist")
    .map((f) => relative("dist", f))
    .filter((f) => f === name || hashed.test(f));
  const ok = copies.length === 1 && hashed.test(copies[0]);
  console[ok ? "log" : "error"](
    ok
      ? `✓ ${name}: 1 hashed copy (${copies[0]})`
      : `✗ ${name}: ${copies.length} copy(ies) — ${copies.join(", ") || "none"}`,
  );
  fail ||= !ok;
}

process.exit(fail ? 1 : 0);
