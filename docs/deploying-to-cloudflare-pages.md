# Deploying Slidev to Cloudflare Pages

Slidev builds to a static SPA (`dist/`), which Cloudflare Pages can serve directly. This guide covers the setup for projects using the `slidev-theme-hebmu` theme.

## Build Configuration

Ensure `package.json` has a build script:

```json
{
  "scripts": {
    "build": "slidev build"
  }
}
```

### Useful build flags

| Flag | Purpose |
|------|---------|
| `--base /path/` | Deploy under a subpath (must start and end with `/`) |
| `--out dir` | Change output directory (default: `dist`) |
| `--without-notes` | Exclude speaker notes from the build |
| `--download` | Include downloadable PDF in the SPA |

## SPA Routing

Slidev is a SPA — all routes must resolve to `index.html`. Create `public/_redirects`:

```
/*  /index.html  200
```

This is the Cloudflare Pages equivalent of Netlify's `[[redirects]]` or Vercel's `rewrites`.

## Deploy Options

### Option A: Git integration (recommended)

1. Push the Slidev project to GitHub or GitLab.
2. Cloudflare Dashboard → Pages → Create a project → Connect the repo.
3. Configure:
   - **Build command**: `bun run build` (or `npm run build`)
   - **Build output directory**: `dist`
   - **Environment variable**: `NODE_VERSION=20` (or `22`)
4. Deploy. Cloudflare redeploys on every push to the configured branch.

### Option B: Direct upload (CI-free)

```bash
bun run build
npx wrangler pages deploy dist --project-name=my-slides
```

Good for quick deploys or when the theme has local dependencies that remote CI cannot resolve.

### Option C: GitHub Actions → Cloudflare Pages

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - uses: oven-sh/setup-bun@v2

      - run: bun install

      - run: bun run build

      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist --project-name=my-slides
```

## Theme Deployment: Local Path Dependencies

`slidev-theme-hebmu` uses a `file:` path dependency in consumer projects:

```json
{ "slidev-theme-hebmu": "file:../../../Teaching_Resources/Template_Lectures/slidev-theme-hebmu" }
```

Remote CI (Cloudflare Build, GitHub Actions) cannot resolve `file:` paths that point outside the repo. Choose one of these strategies:

### Strategy 1: Monorepo (simplest for CI)

Put the theme and slide deck in the same repository:

```
my-lecture/
├── theme/          # slidev-theme-hebmu source
└── slides/         # course slide deck
    └── package.json  # "slidev-theme-hebmu": "file:../theme"
```

Both directories are in the repo, so CI resolves the path.

### Strategy 2: Git submodule

```bash
git submodule add <theme-repo-url> themes/slidev-theme-hebmu
```

Then in `package.json`:
```json
{ "slidev-theme-hebmu": "file:themes/slidev-theme-hebmu" }
```

CI clones with `--recurse-submodules` (configure in Cloudflare build settings or GitHub Actions).

### Strategy 3: Publish to npm

Publish the theme (public or private package) and use a version dependency:

```json
{ "slidev-theme-hebmu": "^1.0.0" }
```

For private packages, set `NPM_TOKEN` as a Cloudflare Pages environment variable and create a `.npmrc`:

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

### Strategy 4: Build locally, deploy the output

Build locally where the `file:` path works, then deploy only the `dist/` folder:

```bash
bun run build
npx wrangler pages deploy dist --project-name=my-slides
```

No CI needed. Best for infrequent updates.

## Limitations of Static Builds

These Slidev features require the dev server and **do not work** in the static SPA build:

- Presenter mode
- Drawing / annotations
- Live editing

The static SPA is a **read-only interactive viewer** — navigation, animations, code blocks, and Mermaid diagrams all work.

## Reference

- Slidev hosting docs: https://sli.dev/guide/hosting
- Cloudflare Pages docs: https://developers.cloudflare.com/pages/
- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/
