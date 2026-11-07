# Build asset bundling

A production build of `example.md` must embed theme images as hashed files under
`dist/assets/`. A green `slidev build` alone is not enough; a broken
`import.meta.glob` can still exit 0 with missing images.

## Sub-features

- `build-exit` runs a clean static build.
- `dist-manifest` checks the expected hashed asset set via `check:dist`.

## How to get to it (user POV)

- From the theme repo, run the documented build and dist check scripts.
- Inspect `dist/` only through `npm run check:dist` (do not eyeball hashes).

## Driving it with verify-hebmu

Preconditions:

- Repo root with dependencies installed.
- No need for a live `launch.sh` instance for this feature.

- **Build.** Run `npm run build`. Exit code must be `0`.
- **Check dist.** Run `npm run check:dist`. Exit code must be `0`. Stdout must
  not report missing theme images.
- **Proof.** Paste both exit codes and the last lines of `check:dist` output in
  the agent reply. Optionally copy the log to
  `.cursor/skills/verify-hebmu/artifacts/proof/$RUN_ID/check-dist.txt`
  (create the directory if no browser run exists).

## Gotchas

- `npm run build` exit 0 is necessary but not sufficient.
- Do not "fix" a red `check:dist` by editing the checker unless the manifest
  intentionally changed; fix bundling in `layout-helper.ts` / assets instead.
- Export/screenshot (`npm run screenshot`) is a separate visual path and is not
  required for this feature's proof.
