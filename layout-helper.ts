export function resolveAssetUrl(url: string) {
  const baseUrl = import.meta.env.BASE_URL;
  if (!url.startsWith("/")) return url;
  if (baseUrl.endsWith("/")) return baseUrl + url.slice(1);
  return baseUrl + url;
}
