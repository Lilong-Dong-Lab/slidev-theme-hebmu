/**
 * Theme-owned image assets, self-registering: every file under assets/ is
 * bundled via Vite `?url` imports, so consumer decks resolve them as hashed
 * asset URLs regardless of install mode. The dir is deliberately NOT
 * `public/` — a public dir would make Slidev's static-copy emit every image
 * a second time next to the hashed copy (#13).
 */
// Both literals below must change together (glob pattern must stay a literal
// — Vite cannot statically analyze template strings — and the lookup key
// mirrors it). Move = edit both lines.
const bundledThemeAssets = import.meta.glob("./assets/**/*", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

/** `/logo.png` → bundled URL, or undefined when it is not a theme asset. */
function bundledAssetUrl(url: string) {
  return bundledThemeAssets[`./assets${url}`];
}

/** Resolve theme-owned assets for img/background URLs. */
export function resolveAssetUrl(url: string) {
  if (!url.startsWith("/")) return url;
  return bundledAssetUrl(url) ?? resolveUrl(url);
}

/**
 * Resolve a user-supplied URL. Known theme asset names resolve to the bundled
 * copy; anything else is served from the deck's public root (BASE_URL).
 */
export function resolveUrl(url: string) {
  if (!url.startsWith("/")) return url;
  const bundled = bundledAssetUrl(url);
  if (bundled) return bundled;
  const baseUrl = import.meta.env.BASE_URL;
  const prefix = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${prefix}${url.slice(1)}`;
}

export type FooterMode = "compact" | "none";

export interface ThemeConfigs {
  /** Chrome footer (compact mode). */
  footerDepartment?: string;
  footerMode?: FooterMode;
  /** `end` layout contact block. */
  footerAuthor?: string;
  footerEmail?: string;
  footerTel?: string;
  footerWechat?: string;
  logoUrl?: string;
  paginationPagesDisabled?: number[];
  paginationX?: "l" | "r";
  paginationY?: "b" | "t";
  contentItems?: (string | object)[];
  contentImageUrl?: string;
  coverBackgroundUrl?: string;
  endBackgroundUrl?: string;
  tocItems?: (string | object)[];
}

export interface KeynoteChromeProps {
  hideFooter?: boolean;
  hideLogo?: boolean;
  hidePage?: boolean;
  hideWave?: boolean;
}

export interface KeynoteShellProps extends KeynoteChromeProps {
  autoSlideTitle?: boolean;
  density?: "normal" | "compact";
  hideFrame?: boolean;
  hideTitle?: boolean;
  slideTitle?: string;
}

export const keynoteChromeDefaults: Required<KeynoteChromeProps> = {
  hideFooter: false,
  hideLogo: false,
  hidePage: false,
  hideWave: false,
};

export const keynoteShellDefaults: Required<KeynoteShellProps> = {
  ...keynoteChromeDefaults,
  autoSlideTitle: true,
  density: "normal",
  // Soft-remove: waves already define the stage; set hideFrame: false to restore the purple rectangle
  hideFrame: true,
  hideTitle: false,
  slideTitle: undefined as unknown as string,
};
