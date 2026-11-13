#!/usr/bin/env node
/**
 * pd-diagram single-scale-knob contract (#80): font-size lives only on
 * .hebmu-pd-frame — inner roles inherit it, so deck-side dense overrides
 * reach them. A direct declaration beats inheritance and silently reverts
 * those overrides to the default.
 *
 * Usage: node scripts/check-styles.mjs [css-path]
 * css-path defaults to styles/pd-diagram.css; the argv exists so the clean
 * path can be tested against a scratch copy.
 */
import { readFileSync } from "node:fs";

const cssPath = process.argv[2] ?? "styles/pd-diagram.css";

// The frame is the scale knob; the arrow is decorative typography, not a
// scaled cell role, so it owns its size.
const EXEMPT = new Set([".hebmu-pd-frame", ".hebmu-pd-arrow"]);

const violations = [];
for (const [, selector, body] of readFileSync(cssPath, "utf8").matchAll(
  /([^{}]+)\{([^}]*)\}/g,
)) {
  const roles = [...selector.matchAll(/\.hebmu-pd-[a-z-]+/g)].map((m) => m[0]);
  if (roles.length === 0 || roles.every((r) => EXEMPT.has(r))) continue;
  const decl = body.match(/font-size\s*:[^;}]*/)?.[0];
  if (decl) {
    violations.push([
      selector.replace(/\s+/g, " ").trim(),
      decl.replace(/\s+/g, " "),
    ]);
  }
}

if (violations.length > 0) {
  for (const [selector, decl] of violations) {
    console.error(`✗ ${selector}: ${decl}`);
  }
  console.error(
    "pd-diagram single-scale-knob contract: font-size lives only on " +
      ".hebmu-pd-frame; inner roles inherit it.",
  );
  process.exit(1);
}

console.log("✓ pd-diagram: font-size only on .hebmu-pd-frame");
