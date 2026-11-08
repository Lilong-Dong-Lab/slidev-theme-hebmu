#!/usr/bin/env node
/**
 * CI/local adversarial land-path gate (#53).
 *
 * Offline. Injectable tip APIs only. No live gh / network.
 *
 * Usage:
 *   npm run check:adversarial-land
 *   node scripts/check-adversarial-land.mjs
 *   node scripts/check-adversarial-land.mjs --list
 */
import { fileURLToPath } from "node:url";
import {
  HOLE_IDS,
  runAdversarialLandSuite,
} from "./adversarial-land/run-suite.mjs";

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--list")) {
    for (const id of HOLE_IDS) console.log(id);
    return 0;
  }

  const report = await runAdversarialLandSuite();
  for (const line of report.lines) {
    if (line.startsWith("FAIL")) {
      console.error(line);
    } else {
      console.log(line);
    }
  }
  return report.ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
