/**
 * Offline RSA / JWKS / JWT fixtures for #66 check-run provenance holes.
 * Stand-in for GitHub Actions OIDC; never production material.
 */
import { createSign, generateKeyPairSync } from "node:crypto";
import {
  HEBMU_SEAL_CHECK_RUN_NAME,
  HEBMU_SEAL_OIDC_AUD,
  HEBMU_SEAL_OIDC_ISS,
  SEALED_SHIPPING_SCHEMA_V4,
} from "../check-run-crypto.mjs";

export {
  HEBMU_SEAL_CHECK_RUN_NAME,
  HEBMU_SEAL_OIDC_AUD,
  HEBMU_SEAL_OIDC_ISS,
  SEALED_SHIPPING_SCHEMA_V4,
};

/** @type {string} */
export const SUITE_JWT_KID = "hebmu-adversarial-oidc-kid";

/** Fixed clock for deterministic exp checks (2026-11-08T12:00:00Z). */
export const SUITE_NOW_SEC = 1_783_627_200;

/** @type {number} */
export const SUITE_RUN_ID = 900001;

/** @type {number} */
export const SUITE_RUN_ATTEMPT = 1;

/** @type {string} */
export const SUITE_ACTOR = "adversarial-bot";

const SUITE_RSA = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001,
});

const FOREIGN_RSA = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001,
});

/**
 * @param {import("node:crypto").KeyObject} publicKey
 * @param {string} kid
 * @returns {{ keys: Array<Record<string, unknown>> }}
 */
function jwksFromPublic(publicKey, kid) {
  const jwk = publicKey.export({ format: "jwk" });
  return {
    keys: [
      {
        ...jwk,
        kid,
        use: "sig",
        alg: "RS256",
      },
    ],
  };
}

export const SUITE_JWKS = jwksFromPublic(SUITE_RSA.publicKey, SUITE_JWT_KID);

/**
 * @param {unknown} value
 * @returns {string}
 */
function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * @param {import("node:crypto").KeyObject} privateKey
 * @param {Record<string, unknown>} claims
 * @param {string} [kid]
 * @returns {string}
 */
function forgeRs256Jwt(privateKey, claims, kid = SUITE_JWT_KID) {
  const header = { alg: "RS256", typ: "JWT", kid };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const sig = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey)
    .toString("base64url");
  return `${signingInput}.${sig}`;
}

/**
 * @typedef {{
 *   repository: string;
 *   run_id?: number;
 *   run_attempt?: number;
 *   actor?: string;
 *   event_name?: string;
 *   workflow?: string;
 *   exp?: number;
 *   iss?: string;
 *   aud?: string;
 * }} ForgeJwtOpts
 */

/**
 * @param {ForgeJwtOpts} opts
 * @returns {string}
 */
export function forgeSuiteCheckRunJwt(opts) {
  const runId = opts.run_id ?? SUITE_RUN_ID;
  const claims = {
    iss: opts.iss ?? HEBMU_SEAL_OIDC_ISS,
    aud: opts.aud ?? HEBMU_SEAL_OIDC_AUD,
    repository: opts.repository,
    event_name: opts.event_name ?? "workflow_dispatch",
    workflow: opts.workflow ?? "seal-shipping",
    run_id: String(runId),
    run_attempt: String(opts.run_attempt ?? SUITE_RUN_ATTEMPT),
    actor: opts.actor ?? SUITE_ACTOR,
    exp: opts.exp ?? SUITE_NOW_SEC + 3600,
    iat: SUITE_NOW_SEC,
    sub: `repo:${opts.repository}:ref:refs/heads/main`,
  };
  return forgeRs256Jwt(SUITE_RSA.privateKey, claims);
}

/**
 * JWT signed by a foreign RSA key (not in SUITE_JWKS).
 *
 * @param {ForgeJwtOpts} opts
 * @returns {string}
 */
export function forgeForeignCheckRunJwt(opts) {
  const runId = opts.run_id ?? SUITE_RUN_ID;
  const claims = {
    iss: opts.iss ?? HEBMU_SEAL_OIDC_ISS,
    aud: opts.aud ?? HEBMU_SEAL_OIDC_AUD,
    repository: opts.repository,
    event_name: opts.event_name ?? "workflow_dispatch",
    workflow: opts.workflow ?? "seal-shipping",
    run_id: String(runId),
    run_attempt: String(opts.run_attempt ?? SUITE_RUN_ATTEMPT),
    actor: opts.actor ?? SUITE_ACTOR,
    exp: opts.exp ?? SUITE_NOW_SEC + 3600,
    iat: SUITE_NOW_SEC,
    sub: `repo:${opts.repository}:ref:refs/heads/main`,
  };
  return forgeRs256Jwt(FOREIGN_RSA.privateKey, claims, "foreign-kid");
}

/**
 * @param {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   headRefOid: string;
 *   verdict?: "PASS" | "FAIL";
 *   sealedAt?: string;
 *   by?: string;
 *   jwt: string;
 * }} args
 * @returns {Record<string, unknown>}
 */
export function assembleCheckRunSealWire(args) {
  /** @type {Record<string, unknown>} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V4,
    owner: args.owner,
    repo: args.repo,
    pr: args.pr,
    headRefOid: args.headRefOid,
    verdict: args.verdict ?? "PASS",
    sealedAt: args.sealedAt ?? "2026-11-08T00:00:00.000Z",
    mint: { kind: "check-run", jwt: args.jwt },
  };
  if (args.by) wire.by = args.by;
  return wire;
}

/**
 * @typedef {"ok" | "absent" | "unavailable"} CheckRunStubKind
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
 */

/**
 * @param {{
 *   kind?: CheckRunStubKind;
 *   runId?: number;
 *   conclusion?: string;
 *   headSha?: string;
 *   detail?: string;
 * }} [opts]
 * @returns {CheckRunEvidence}
 */
export function stubCheckRunEvidence(opts = {}) {
  const kind = opts.kind ?? "ok";
  if (kind === "absent") return { status: "absent" };
  if (kind === "unavailable") {
    return {
      status: "unavailable",
      detail: opts.detail ?? "simulated check-runs API failure",
    };
  }
  return {
    status: "ok",
    runId: opts.runId ?? SUITE_RUN_ID,
    conclusion: opts.conclusion ?? "success",
    headSha: opts.headSha ?? "",
  };
}

/**
 * @param {{
 *   name?: string;
 *   externalId?: string | null;
 *   conclusion?: string | null;
 *   headSha?: string;
 *   empty?: boolean;
 *   status?: number;
 * }} [opts]
 * @returns {{ status: number; body: unknown }}
 */
export function stubCheckRunsApiResponse(opts = {}) {
  if (typeof opts.status === "number" && opts.status >= 400) {
    return {
      status: opts.status,
      body: { message: "simulated check-runs failure" },
    };
  }
  if (opts.empty) {
    return { status: 200, body: { check_runs: [] } };
  }
  return {
    status: 200,
    body: {
      check_runs: [
        {
          name: opts.name ?? HEBMU_SEAL_CHECK_RUN_NAME,
          external_id:
            opts.externalId === undefined
              ? String(SUITE_RUN_ID)
              : opts.externalId,
          conclusion: opts.conclusion ?? "success",
          head_sha: opts.headSha ?? "",
        },
      ],
    },
  };
}
