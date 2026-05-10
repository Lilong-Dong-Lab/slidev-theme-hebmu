export function resolveAssetUrl(url: string) {
  const baseUrl = import.meta.env.BASE_URL;
  if (!url.startsWith("/")) return url;
  if (baseUrl.endsWith("/")) return baseUrl + url.slice(1);
  return baseUrl + url;
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
