#!/usr/bin/env node
/**
 * GitHub Actions OIDC identity for sealed-shipping v4 (#66).
 *
 * Owns JWT / JWKS / claim-pinning / check-run evidence. Callers hold only
 * SealIdentityVerifier + FetchCheckRun. Zero npm deps (node:crypto RS256).
 *
 *   node scripts/check-run-crypto.mjs --self-test
 */
import {
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";
import { get as httpsGet } from "node:https";
import { fileURLToPath } from "node:url";

/** @type {string} */
export const SEALED_SHIPPING_SCHEMA_V4 = "hebmu.sealed-shipping.v4";

/** @type {string} */
export const HEBMU_SEAL_CHECK_RUN_NAME = "hebmu-seal";

/** @type {string} */
export const HEBMU_SEAL_OIDC_AUD = "hebmu-seal";

/** @type {string} */
export const HEBMU_SEAL_OIDC_ISS = "https://token.actions.githubusercontent.com";

/** @type {string} */
export const HEBMU_SEAL_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks";

/** @type {string} */
export const HEBMU_SEAL_WORKFLOW_NAME = "seal-shipping";

/**
 * @typedef {import("./attestation-crypto.mjs").ShippingClaims} ShippingClaims
 *
 * @typedef {{
 *   kind: "check-run";
 *   jwt: string;
 * }} CheckRunMintWire
 *
 * @typedef {{
 *   schema: "hebmu.sealed-shipping.v4";
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   headRefOid: string;
 *   verdict: "PASS" | "FAIL";
 *   sealedAt: string;
 *   by?: string;
 *   mint: CheckRunMintWire;
 * }} CheckRunSealWire
 *
 * @typedef {{
 *   readonly __brand: "CheckRunSealAttestation";
 *   readonly schema: "hebmu.sealed-shipping.v4";
 *   readonly claims: ShippingClaims;
 *   readonly runId: number;
 *   readonly runAttempt: number;
 *   readonly actor: string;
 *   readonly jwt: string;
 * }} CheckRunSealAttestation
 *
 * @typedef {{
 *   status: "verified";
 *   attestation: CheckRunSealAttestation;
 * } | {
 *   status: "unusable";
 * } | {
 *   status: "forged";
 * }} CheckRunSealVerifyResult
 *
 * @typedef {(
 *   jwt: string,
 *   expect: { repository: string },
 * ) => Promise<CheckRunSealVerifyResult>} SealIdentityVerifier
 *
 * @typedef {{
 *   status: "ok";
 *   runId: number;
 *   conclusion: string;
 *   headSha: string;
 * } | {
 *   status: "absent";
 * } | {
 *   status: "unavailable";
 *   detail: string;
 * }} CheckRunEvidence
 *
 * @typedef {(
 *   target: { owner: string; repo: string },
 *   headRefOid: string,
 * ) => Promise<CheckRunEvidence>} FetchCheckRun
 *
 * @typedef {{
 *   iss: string;
 *   aud: string | string[];
 *   repository: string;
 *   event_name: string;
 *   workflow: string;
 *   run_id: string | number;
 *   run_attempt: string | number;
 *   actor: string;
 *   exp: number;
 * }} ParsedOidcClaims
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * @param {string} part
 * @returns {Buffer | null}
 */
function b64urlDecode(part) {
  try {
    return Buffer.from(part, "base64url");
  } catch {
    return null;
  }
}

/**
 * @param {ShippingClaims} claims
 * @param {string} jwt
 * @returns {CheckRunSealWire}
 */
export function mintCheckRunSealWire(claims, jwt) {
  if (typeof jwt !== "string" || !jwt) {
    throw new Error("check-run-crypto: mintCheckRunSealWire requires jwt");
  }
  if (!claims || typeof claims.owner !== "string" || !claims.owner) {
    throw new Error("check-run-crypto: mintCheckRunSealWire requires claims");
  }
  /** @type {CheckRunSealWire} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V4,
    owner: claims.owner,
    repo: claims.repo,
    pr: claims.pr,
    headRefOid: claims.headRefOid,
    verdict: claims.verdict,
    sealedAt: claims.sealedAt,
    mint: { kind: "check-run", jwt },
  };
  if (typeof claims.by === "string" && claims.by) wire.by = claims.by;
  return wire;
}

/**
 * @param {CheckRunSealAttestation} attestation
 * @returns {CheckRunSealWire}
 */
export function wireFromCheckRunSeal(attestation) {
  if (!attestation || attestation.__brand !== "CheckRunSealAttestation") {
    throw new Error(
      "check-run-crypto: wireFromCheckRunSeal requires CheckRunSealAttestation",
    );
  }
  return mintCheckRunSealWire(attestation.claims, attestation.jwt);
}

/**
 * Structural parse only. No crypto.
 *
 * @param {unknown} raw
 * @returns {CheckRunSealWire | null}
 */
function parseCheckRunSealWireShape(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.schema !== SEALED_SHIPPING_SCHEMA_V4) return null;
  if (typeof rec.owner !== "string" || !rec.owner) return null;
  if (typeof rec.repo !== "string" || !rec.repo) return null;
  const pr = Number(rec.pr);
  if (!Number.isInteger(pr) || pr <= 0) return null;
  if (typeof rec.headRefOid !== "string" || !rec.headRefOid) return null;
  if (rec.verdict !== "PASS" && rec.verdict !== "FAIL") return null;
  if (typeof rec.sealedAt !== "string" || !rec.sealedAt) return null;
  const mint = rec.mint;
  if (!mint || typeof mint !== "object") return null;
  const mintRec = /** @type {Record<string, unknown>} */ (mint);
  if (mintRec.kind !== "check-run") return null;
  if (typeof mintRec.jwt !== "string" || !mintRec.jwt) return null;
  /** @type {CheckRunSealWire} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V4,
    owner: rec.owner,
    repo: rec.repo,
    pr,
    headRefOid: rec.headRefOid,
    verdict: rec.verdict,
    sealedAt: rec.sealedAt,
    mint: { kind: "check-run", jwt: mintRec.jwt },
  };
  if (typeof rec.by === "string" && rec.by) wire.by = rec.by;
  return wire;
}

/**
 * @param {string} jwt
 * @returns {{ header: Record<string, unknown>; payload: Record<string, unknown>; signingInput: string; signature: Buffer } | null}
 */
function decodeJwtParts(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [hPart, pPart, sPart] = parts;
  const hBuf = b64urlDecode(hPart);
  const pBuf = b64urlDecode(pPart);
  const sBuf = b64urlDecode(sPart);
  if (!hBuf || !pBuf || !sBuf) return null;
  try {
    const header = JSON.parse(hBuf.toString("utf8"));
    const payload = JSON.parse(pBuf.toString("utf8"));
    if (!header || typeof header !== "object") return null;
    if (!payload || typeof payload !== "object") return null;
    return {
      header: /** @type {Record<string, unknown>} */ (header),
      payload: /** @type {Record<string, unknown>} */ (payload),
      signingInput: `${hPart}.${pPart}`,
      signature: sBuf,
    };
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {ParsedOidcClaims | null}
 */
function parsePinnedOidcClaims(payload) {
  if (typeof payload.iss !== "string" || !payload.iss) return null;
  if (payload.aud === undefined || payload.aud === null) return null;
  if (typeof payload.repository !== "string" || !payload.repository) return null;
  if (typeof payload.event_name !== "string" || !payload.event_name) return null;
  if (typeof payload.workflow !== "string" || !payload.workflow) return null;
  if (payload.run_id === undefined || payload.run_id === null) return null;
  if (payload.run_attempt === undefined || payload.run_attempt === null) {
    return null;
  }
  if (typeof payload.actor !== "string" || !payload.actor) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }
  return {
    iss: payload.iss,
    aud: /** @type {string | string[]} */ (payload.aud),
    repository: payload.repository,
    event_name: payload.event_name,
    workflow: payload.workflow,
    run_id: /** @type {string | number} */ (payload.run_id),
    run_attempt: /** @type {string | number} */ (payload.run_attempt),
    actor: payload.actor,
    exp: payload.exp,
  };
}

/**
 * @param {string | string[]} aud
 * @param {string} expected
 * @returns {boolean}
 */
function audMatches(aud, expected) {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

/**
 * @param {string | number} raw
 * @returns {number | null}
 */
function parsePositiveInt(raw) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * @param {{
 *   fetchJwks?: () => Promise<{ keys: Array<Record<string, unknown>> }>;
 *   nowSec?: () => number;
 *   expectedAud?: string;
 *   expectedIss?: string;
 *   expectedWorkflow?: string;
 *   expectedEventName?: string;
 * }} [opts]
 * @returns {SealIdentityVerifier}
 */
export function createGhIdentityVerifier(opts = {}) {
  const fetchJwks = opts.fetchJwks ?? defaultFetchTokenJwks;
  const nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000));
  const expectedAud = opts.expectedAud ?? HEBMU_SEAL_OIDC_AUD;
  const expectedIss = opts.expectedIss ?? HEBMU_SEAL_OIDC_ISS;
  const expectedWorkflow = opts.expectedWorkflow ?? HEBMU_SEAL_WORKFLOW_NAME;
  const expectedEventName = opts.expectedEventName ?? "workflow_dispatch";

  return async (jwt, expect) => {
    if (typeof jwt !== "string" || !jwt) return { status: "unusable" };
    if (!expect || typeof expect.repository !== "string" || !expect.repository) {
      return { status: "unusable" };
    }
    const parts = decodeJwtParts(jwt);
    if (!parts) return { status: "unusable" };
    if (parts.header.alg !== "RS256") return { status: "forged" };
    if (typeof parts.header.kid !== "string" || !parts.header.kid) {
      return { status: "forged" };
    }

    const pinned = parsePinnedOidcClaims(parts.payload);
    if (!pinned) return { status: "forged" };

    if (pinned.iss !== expectedIss) return { status: "forged" };
    if (!audMatches(pinned.aud, expectedAud)) return { status: "forged" };
    if (pinned.repository !== expect.repository) return { status: "forged" };
    if (pinned.event_name !== expectedEventName) return { status: "forged" };
    if (pinned.workflow !== expectedWorkflow) return { status: "forged" };
    if (pinned.exp <= nowSec()) return { status: "forged" };

    const runId = parsePositiveInt(pinned.run_id);
    const runAttempt = parsePositiveInt(pinned.run_attempt);
    if (runId === null || runAttempt === null) return { status: "forged" };

    /** @type {{ keys: Array<Record<string, unknown>> }} */
    let jwks;
    try {
      jwks = await fetchJwks();
    } catch {
      return { status: "unusable" };
    }
    if (!jwks || !Array.isArray(jwks.keys)) return { status: "unusable" };
    const jwk = jwks.keys.find(
      (k) => k && typeof k === "object" && k.kid === parts.header.kid,
    );
    if (!jwk) return { status: "forged" };

    let keyObject;
    try {
      keyObject = createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      return { status: "forged" };
    }

    let ok = false;
    try {
      ok = createVerify("RSA-SHA256")
        .update(parts.signingInput)
        .verify(keyObject, parts.signature);
    } catch {
      return { status: "forged" };
    }
    if (!ok) return { status: "forged" };

    // Identity-only success. Tip binding is assert/policy via check-run evidence.
    return {
      status: "verified",
      attestation: {
        __brand: "CheckRunSealAttestation",
        schema: SEALED_SHIPPING_SCHEMA_V4,
        claims: {
          owner: "",
          repo: "",
          pr: 0,
          headRefOid: "",
          verdict: "PASS",
          sealedAt: "",
        },
        runId,
        runAttempt,
        actor: pinned.actor,
        jwt,
      },
    };
  };
}

/**
 * Brand claims from the wire fields, not JWT payload mirrors.
 *
 * @param {unknown} raw
 * @param {{
 *   identity: SealIdentityVerifier;
 * }} deps
 * @returns {Promise<CheckRunSealVerifyResult>}
 */
export async function verifyCheckRunSealWire(raw, deps) {
  if (!deps || typeof deps.identity !== "function") {
    return { status: "unusable" };
  }
  const wire = parseCheckRunSealWireShape(raw);
  if (!wire) return { status: "unusable" };

  const idResult = await deps.identity(wire.mint.jwt, {
    repository: `${wire.owner}/${wire.repo}`,
  });
  if (idResult.status === "unusable") return { status: "unusable" };
  if (idResult.status === "forged") return { status: "forged" };

  /** @type {ShippingClaims} */
  const claims = {
    owner: wire.owner,
    repo: wire.repo,
    pr: wire.pr,
    headRefOid: wire.headRefOid,
    verdict: wire.verdict,
    sealedAt: wire.sealedAt,
  };
  if (wire.by) claims.by = wire.by;

  return {
    status: "verified",
    attestation: {
      __brand: "CheckRunSealAttestation",
      schema: SEALED_SHIPPING_SCHEMA_V4,
      claims,
      runId: idResult.attestation.runId,
      runAttempt: idResult.attestation.runAttempt,
      actor: idResult.attestation.actor,
      jwt: wire.mint.jwt,
    },
  };
}

/**
 * @param {unknown} raw
 * @param {{ identity: SealIdentityVerifier }} deps
 * @returns {Promise<"missing" | "unusable" | "forged">}
 */
export async function classifyCheckRunSealRaw(raw, deps) {
  if (raw === undefined || raw === null) return "missing";
  const result = await verifyCheckRunSealWire(raw, deps);
  if (result.status === "verified") return "unusable";
  return result.status;
}

/**
 * @returns {Promise<{ keys: Array<Record<string, unknown>> }>}
 */
function defaultFetchTokenJwks() {
  return new Promise((resolve, reject) => {
    const req = httpsGet(HEBMU_SEAL_OIDC_JWKS_URL, (res) => {
      /** @type {Buffer[]} */
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          reject(
            new Error(
              `check-run-crypto: JWKS HTTP ${res.statusCode ?? 0}`,
            ),
          );
          return;
        }
        try {
          const parsed = JSON.parse(body);
          if (!parsed || !Array.isArray(parsed.keys)) {
            reject(new Error("check-run-crypto: JWKS missing keys"));
            return;
          }
          resolve(parsed);
        } catch (err) {
          reject(
            err instanceof Error
              ? err
              : new Error("check-run-crypto: JWKS parse failed"),
          );
        }
      });
    });
    req.on("error", reject);
  });
}

/**
 * @param {{
 *   api: (path: string) => { status: number; body: unknown };
 * }} gh
 * @returns {FetchCheckRun}
 */
export function createFetchCheckRun(gh) {
  return async (target, headRefOid) => {
    if (
      !target ||
      typeof target.owner !== "string" ||
      typeof target.repo !== "string" ||
      typeof headRefOid !== "string" ||
      !headRefOid
    ) {
      return { status: "unavailable", detail: "missing target or headRefOid" };
    }
    const path =
      `repos/${target.owner}/${target.repo}/commits/` +
      `${encodeURIComponent(headRefOid)}/check-runs`;
    /** @type {{ status: number; body: unknown }} */
    let resp;
    try {
      resp = gh.api(path);
    } catch (err) {
      return {
        status: "unavailable",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    if (resp.status < 200 || resp.status >= 300) {
      return {
        status: "unavailable",
        detail: `check-runs HTTP ${resp.status}`,
      };
    }
    const body = resp.body;
    if (!body || typeof body !== "object") {
      return { status: "unavailable", detail: "check-runs body not object" };
    }
    const runs = /** @type {Record<string, unknown>} */ (body).check_runs;
    if (!Array.isArray(runs)) {
      return { status: "unavailable", detail: "check-runs missing array" };
    }
    for (const entry of runs) {
      if (!entry || typeof entry !== "object") continue;
      const rec = /** @type {Record<string, unknown>} */ (entry);
      if (rec.name !== HEBMU_SEAL_CHECK_RUN_NAME) continue;
      const externalId =
        typeof rec.external_id === "string" || typeof rec.external_id === "number"
          ? String(rec.external_id)
          : "";
      const runId = parsePositiveInt(externalId);
      if (runId === null) continue;
      const headSha =
        typeof rec.head_sha === "string"
          ? rec.head_sha
          : typeof rec.headSha === "string"
            ? rec.headSha
            : "";
      if (!headSha) continue;
      const conclusion =
        typeof rec.conclusion === "string" && rec.conclusion
          ? rec.conclusion
          : "";
      return {
        status: "ok",
        runId,
        conclusion,
        headSha,
      };
    }
    return { status: "absent" };
  };
}

/**
 * @param {import("node:crypto").KeyObject} signingPrivateKey
 * @param {Record<string, unknown>} claimsOut
 * @param {string} [kid]
 * @returns {string}
 */
export function forgeCheckRunJwtForTest(signingPrivateKey, claimsOut, kid = "test-kid") {
  const header = { alg: "RS256", typ: "JWT", kid };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(claimsOut)}`;
  const sig = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(signingPrivateKey)
    .toString("base64url");
  return `${signingInput}.${sig}`;
}

/**
 * @param {string} label
 * @param {boolean} ok
 */
function assertSelf(label, ok) {
  if (!ok) throw new Error(`check-run-crypto --self-test failed: ${label}`);
  console.log(`ok  ${label}`);
}

/**
 * Offline self-test (no network).
 * @returns {Promise<void>}
 */
export async function runCheckRunCryptoSelfTest() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const { privateKey: foreignPrivate } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const kid = "self-test-kid";
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid,
    use: "sig",
    alg: "RS256",
  };
  const now = 1_783_627_200;
  const goodClaims = {
    iss: HEBMU_SEAL_OIDC_ISS,
    aud: HEBMU_SEAL_OIDC_AUD,
    repository: "Lilong-Dong-Lab/slidev-theme-hebmu",
    event_name: "workflow_dispatch",
    workflow: HEBMU_SEAL_WORKFLOW_NAME,
    run_id: "4242",
    run_attempt: "1",
    actor: "self-test",
    exp: now + 3600,
    iat: now,
  };
  const jwt = forgeCheckRunJwtForTest(privateKey, goodClaims, kid);
  const identity = createGhIdentityVerifier({
    fetchJwks: async () => ({ keys: [jwk] }),
    nowSec: () => now,
  });

  {
    const r = await identity(jwt, {
      repository: "Lilong-Dong-Lab/slidev-theme-hebmu",
    });
    assertSelf("good jwt verifies", r.status === "verified");
    if (r.status === "verified") {
      assertSelf("runId derived", r.attestation.runId === 4242);
      assertSelf("actor derived", r.attestation.actor === "self-test");
    }
  }

  {
    const bad = forgeCheckRunJwtForTest(foreignPrivate, goodClaims, kid);
    const r = await identity(bad, {
      repository: "Lilong-Dong-Lab/slidev-theme-hebmu",
    });
    assertSelf("foreign sig → forged", r.status === "forged");
  }

  {
    const wrongRepo = forgeCheckRunJwtForTest(
      privateKey,
      { ...goodClaims, repository: "Evil/other" },
      kid,
    );
    const r = await identity(wrongRepo, {
      repository: "Lilong-Dong-Lab/slidev-theme-hebmu",
    });
    assertSelf("wrong repository → forged", r.status === "forged");
  }

  {
    const wrongEvent = forgeCheckRunJwtForTest(
      privateKey,
      { ...goodClaims, event_name: "pull_request" },
      kid,
    );
    const r = await identity(wrongEvent, {
      repository: "Lilong-Dong-Lab/slidev-theme-hebmu",
    });
    assertSelf("wrong event_name → forged", r.status === "forged");
  }

  {
    const missingEvent = { ...goodClaims };
    delete /** @type {Record<string, unknown>} */ (missingEvent).event_name;
    const jwtMissing = forgeCheckRunJwtForTest(privateKey, missingEvent, kid);
    const r = await identity(jwtMissing, {
      repository: "Lilong-Dong-Lab/slidev-theme-hebmu",
    });
    assertSelf("missing event_name → forged", r.status === "forged");
  }

  {
    const wire = mintCheckRunSealWire(
      {
        owner: "Lilong-Dong-Lab",
        repo: "slidev-theme-hebmu",
        pr: 66,
        headRefOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      },
      jwt,
    );
    const r = await verifyCheckRunSealWire(wire, { identity });
    assertSelf("v4 wire verifies", r.status === "verified");
    if (r.status === "verified") {
      assertSelf(
        "claims from wire not jwt",
        r.attestation.claims.headRefOid ===
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      );
      assertSelf("brand set", r.attestation.__brand === "CheckRunSealAttestation");
    }
  }

  {
    const r = await verifyCheckRunSealWire(
      { schema: "hebmu.sealed-shipping.v3", mint: { kind: "check-run", jwt } },
      { identity },
    );
    assertSelf("v3 schema → unusable", r.status === "unusable");
  }

  {
    const fetch = createFetchCheckRun({
      api: () => ({
        status: 200,
        body: {
          check_runs: [
            {
              name: HEBMU_SEAL_CHECK_RUN_NAME,
              external_id: "4242",
              conclusion: "success",
              head_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          ],
        },
      }),
    });
    const ev = await fetch(
      { owner: "Lilong-Dong-Lab", repo: "slidev-theme-hebmu" },
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    assertSelf("fetchCheckRun ok", ev.status === "ok");
    if (ev.status === "ok") {
      assertSelf("fetch runId", ev.runId === 4242);
    }
  }

  {
    const fetch = createFetchCheckRun({
      api: () => ({ status: 200, body: { check_runs: [] } }),
    });
    const ev = await fetch(
      { owner: "Lilong-Dong-Lab", repo: "slidev-theme-hebmu" },
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    assertSelf("fetchCheckRun absent", ev.status === "absent");
  }

  {
    const fetch = createFetchCheckRun({
      api: () => ({ status: 500, body: { message: "boom" } }),
    });
    const ev = await fetch(
      { owner: "Lilong-Dong-Lab", repo: "slidev-theme-hebmu" },
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    assertSelf("fetchCheckRun unavailable", ev.status === "unavailable");
  }

  console.log("ok  check-run-crypto self-test passed");
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain && process.argv.includes("--self-test")) {
  runCheckRunCryptoSelfTest().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
