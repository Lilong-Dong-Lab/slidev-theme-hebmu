#!/usr/bin/env node
/**
 * specs↔props drift check. Two directions:
 *
 * (a) every prop defined in a layouts/ or components/ SFC must be
 *     documented somewhere in docs/specs.md (backticked name);
 * (b) for each specs section mapped to an SFC below, every prop name in
 *     its **Props** block must exist on that SFC — or be inherited from
 *     KeynoteShell/KeynoteChrome, be a ThemeConfigs key, or appear on the
 *     KNOWN_WORDS list (types, values, and non-prop identifiers that
 *     legitimately appear in Props prose).
 *
 * Earned by the FigureWithOptionalCaption drift (`figureUrl`/`figureCaption`
 * documented, `url`/`caption` real) — see the retro that followed 0.4.0.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const specs = readFileSync("docs/specs.md", "utf8");
const findings = [];

/** Prop names from an SFC's defineProps type block. */
function propsOf(relPath) {
  const src = readFileSync(join(root, relPath), "utf8");
  const m = src.match(/defineProps<([\s\S]*?)>\s*\(/);
  if (!m) return [];
  return [...m[1].matchAll(/(\w+)\??\s*:/g)]
    .map((x) => x[1])
    .filter((n) => !n.endsWith("Props"));
}

const shellProps = propsOf("components/KeynoteShell.vue");
const chromeProps = propsOf("components/KeynoteChrome.vue");

// ThemeConfigs keys, parsed from layout-helper.ts so the check cannot drift
// from the interface itself.
const helperSrc = readFileSync(join(root, "layout-helper.ts"), "utf8");
const themeConfigBlock = helperSrc.match(
  /export interface ThemeConfigs \{([\s\S]*?)\n\}/,
)?.[1];
const themeConfigKeys = themeConfigBlock
  ? [...themeConfigBlock.matchAll(/(\w+)\??\s*:/g)].map((x) => x[1])
  : [];

// Non-prop identifiers that legitimately appear inside **Props** prose:
// type names, literal values, and named helpers.
const KNOWN_WORDS = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "Date",
  "undefined",
  "true",
  "false",
  "normal",
  "compact",
  "none",
  "l",
  "r",
  "t",
  "b",
  "col",
  "row",
  "resolveUrl",
  "resolveAssetUrl",
  "ContentItemInput",
  "KeynoteShellProps",
  "KeynoteChromeProps",
  "figure-side", // historical layout name cited in prose
  "object-position", // CSS property cited in prose
]);

/** specs.md section heading → SFC whose props that section documents. */
const SECTION_FILES = {
  cover: "layouts/cover.vue",
  section: "layouts/section.vue",
  default: "layouts/default.vue",
  figure: "layouts/figure.vue",
  "table-of-contents": "layouts/table-of-contents.vue",
  break: "layouts/break.vue",
  end: "layouts/end.vue",
  KeynoteShell: "components/KeynoteShell.vue",
  Pagination: "components/Pagination.vue",
  FigureWithOptionalCaption: "components/FigureWithOptionalCaption.vue",
};

// ---- Direction (a): every SFC prop is documented somewhere in specs.md ----
for (const dir of ["layouts", "components"]) {
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith(".vue")) continue;
    for (const name of propsOf(join(dir, file))) {
      // `\`name\`` with a word boundary also matches inline-type docs like
      // `\`url: string\``, not just bare-table names.
      const docRe = new RegExp("`" + name + "\\b");
      if (!docRe.test(specs)) {
        findings.push(
          `(a) ${dir}/${file}: prop \`${name}\` is not documented in docs/specs.md`,
        );
      }
    }
  }
}

// ---- Direction (b): each mapped section's **Props** names exist on the SFC
const sections = specs.split(/^### /m).slice(1);
for (const section of sections) {
  const title = section.slice(0, section.indexOf("\n")).trim();
  const mapped = SECTION_FILES[title];
  if (!mapped) continue;

  const allowed = new Set([
    ...propsOf(mapped),
    ...shellProps,
    ...chromeProps,
    ...themeConfigKeys,
    ...KNOWN_WORDS,
  ]);

  const propsStart = section.indexOf("**Props**");
  if (propsStart === -1) continue;
  const rest = section.slice(propsStart);
  const nextBold = rest.slice(10).search(/\n\*\*/);
  const propsRegion = nextBold === -1 ? rest : rest.slice(0, nextBold + 10);

  for (const m of propsRegion.matchAll(/`(\w[\w-]*)`/g)) {
    const name = m[1];
    if (/^\d+$/.test(name)) continue; // backticked default values like `10`
    if (!allowed.has(name)) {
      findings.push(
        `(b) specs.md ### ${title}: \`${name}\` is not a prop of ${mapped} ` +
          "(nor inherited, a ThemeConfigs key, or on KNOWN_WORDS)",
      );
    }
  }
}

if (findings.length > 0) {
  console.error(`check:specs — ${findings.length} drift finding(s):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("check:specs — no drift between docs/specs.md and SFC props");
