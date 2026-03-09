/**
 * Normalize a URL for consistent caching and comparison.
 * - Ensures https:// protocol
 * - Lowercases hostname
 * - Removes default ports (80/443)
 * - Removes trailing slashes
 * - Sorts query parameters
 * - Removes fragment/hash
 * - Removes common tracking params (utm_*, fbclid, etc.)
 */
export function normalizeUrl(input: string): string {
  // Add protocol if missing
  let raw = input.startsWith("http") ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  // Lowercase hostname
  url.hostname = url.hostname.toLowerCase();

  // Force https
  url.protocol = "https:";

  // Remove default ports
  if (url.port === "443" || url.port === "80") {
    url.port = "";
  }

  // Remove fragment
  url.hash = "";

  // Remove tracking params
  const trackingParams = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "ref",
  ];
  for (const param of trackingParams) {
    url.searchParams.delete(param);
  }

  // Sort remaining query params
  url.searchParams.sort();

  // Build final URL and remove trailing slash (but keep root /)
  let normalized = url.toString();
  if (normalized.endsWith("/") && url.pathname !== "/") {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
