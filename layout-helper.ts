import hebmuLogoUrl from "./public/hebmu-logo.png?url";
import campusCoverUrl from "./public/campus-cover.jpeg?url";
import campusEndUrl from "./public/campus-end.jpeg?url";

const bundledThemeAssets: Record<string, string> = {
  "/hebmu-logo.png": hebmuLogoUrl,
  "/campus-cover.jpeg": campusCoverUrl,
  "/campus-end.jpeg": campusEndUrl,
};

/** Resolve theme-owned public assets for img/background URLs. */
export function resolveAssetUrl(url: string) {
  if (!url.startsWith("/")) return url;
  const bundled = bundledThemeAssets[url];
  if (bundled) return bundled;
  // Fallback for extra theme public files under Slidev static-copy (`dest: theme`).
  // file: symlink installs may nest this path; prefer adding known files to bundledThemeAssets.
  const baseUrl = import.meta.env.BASE_URL;
  const prefix = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${prefix}theme/public${url}`;
}

export function resolveUrl(url: string) {
  if (!url.startsWith("/")) return url;
  const baseUrl = import.meta.env.BASE_URL;
  const prefix = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${prefix}${url.slice(1)}`;
}

export type FooterMode = "compact" | "full" | "none";

export interface ThemeConfigs {
  footerAuthor?: string;
  footerDepartment?: string;
  footerEmail?: string;
  footerMode?: FooterMode;
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
  hideFrame: false,
  hideTitle: false,
  slideTitle: undefined as unknown as string,
};
