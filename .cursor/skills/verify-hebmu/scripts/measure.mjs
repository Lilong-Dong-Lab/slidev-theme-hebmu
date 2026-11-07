#!/usr/bin/env node
/**
 * Measure visible Keynote chrome geometry on example.md slides.
 * Usage: node measure.mjs [--base URL] <slideIndex...>
 * Requires playwright-chromium from the theme's node_modules.
 */
import { chromium } from "playwright-chromium";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { base: process.env.HEBMU_VERIFY_URL || "http://127.0.0.1:3030/", slides: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") {
      out.base = argv[++i];
      if (!out.base.endsWith("/")) out.base += "/";
    } else if (/^\d+$/.test(a)) {
      out.slides.push(Number(a));
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!out.slides.length) throw new Error("Pass at least one slide index");
  return out;
}

async function measureSlide(page, base, n) {
  await page.goto(`${base}${n}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const pageTitle = await page.title();
  const metrics = await page.evaluate(() => {
    const roundPx = (v) => {
      if (v == null || v === "auto" || v === "") return v;
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.round(n) : v;
    };
    const layout = [...document.querySelectorAll(".slidev-layout")].find(
      (el) => el.getBoundingClientRect().height > 50,
    );
    if (!layout) return { error: "no visible .slidev-layout" };

    const stage = layout.querySelector(".keynote-stage");
    let stagePadding = null;
    if (stage) {
      const scs = getComputedStyle(stage);
      stagePadding = {
        top: scs.paddingTop,
        right: scs.paddingRight,
        bottom: scs.paddingBottom,
        left: scs.paddingLeft,
        shorthand: `${scs.paddingTop} ${scs.paddingRight} ${scs.paddingBottom} ${scs.paddingLeft}`,
      };
    }

    const logoEl = layout.querySelector(".keynote-logo");
    let logo = null;
    if (logoEl) {
      const lcs = getComputedStyle(logoEl);
      logo = {
        top: roundPx(lcs.top),
        left: roundPx(lcs.left),
        width: roundPx(lcs.width),
        height: roundPx(lcs.height),
      };
    }

    const titleEl = layout.querySelector(".keynote-slide-title");
    let title = null;
    if (titleEl) {
      const tcs = getComputedStyle(titleEl);
      title = {
        top: roundPx(tcs.top),
        left: roundPx(tcs.left),
        right: roundPx(tcs.right),
        minHeight: roundPx(tcs.minHeight),
      };
    }

    const coverLogo = layout.querySelector(".cover-logo");
    let cover = null;
    if (coverLogo) {
      const ccs = getComputedStyle(coverLogo);
      cover = {
        width: roundPx(ccs.width),
        height: roundPx(ccs.height),
        naturalWidth: coverLogo.naturalWidth,
      };
    }

    return {
      classes: layout.className,
      stagePadding,
      logo,
      title,
      cover,
    };
  });

  await page.evaluate(() => {
    document.querySelectorAll("[data-hebmu-pin]").forEach((el) => el.removeAttribute("data-hebmu-pin"));
    const layout = [...document.querySelectorAll(".slidev-layout")].find(
      (el) => el.getBoundingClientRect().height > 50,
    );
    if (layout) layout.setAttribute("data-hebmu-pin", "1");
  });

  return { slide: n, pageTitle, ...metrics };
}

const { base, slides } = parseArgs(process.argv.slice(2));
const outDir = process.env.HEBMU_VERIFY_PROOF_DIR;
if (!outDir) {
  console.error("measure.mjs: set HEBMU_VERIFY_PROOF_DIR");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const results = [];
for (const n of slides) {
  const row = await measureSlide(page, base, n);
  results.push(row);
  const shot = path.join(outDir, `slide-${n}.png`);
  const pin = page.locator("[data-hebmu-pin=\"1\"]");
  if (await pin.count()) {
    await pin.screenshot({ path: shot });
  } else {
    await page.screenshot({ path: shot });
  }
  console.error(`measured slide ${n} -> ${shot}`);
}
await browser.close();

const metricsPath = path.join(outDir, "metrics.json");
fs.writeFileSync(metricsPath, JSON.stringify(results, null, 2));
console.log(metricsPath);
