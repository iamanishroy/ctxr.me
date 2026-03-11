/**
 * HTTP fetcher — fetches a page and extracts metadata from <head>.
 * Single responsibility: network I/O + metadata parsing.
 */

import limits from "../config/limits.json";
import type { PageMetadata, FetchResult } from "./types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

/**
 * Fetch a page and extract metadata from <head> via regex.
 * Returns the full raw HTML and parsed metadata.
 */
export async function fetchPage(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    limits.fetchTimeoutMs,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("html") &&
      !contentType.includes("text") &&
      !contentType.includes("xml")
    ) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await response.text();

    // Extract metadata from <head> only — much smaller search surface
    const headEnd = html.indexOf("</head>");
    const headHtml =
      headEnd > 0 ? html.substring(0, headEnd) : html.substring(0, 10_000);

    const title =
      extractMeta(headHtml, "og:title") ||
      extractMeta(headHtml, "twitter:title") ||
      headHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
      "";

    const description =
      extractMeta(headHtml, "description") ||
      extractMeta(headHtml, "og:description") ||
      "";

    const metadata = extractMetadata(headHtml, url);

    return { html, title, description, metadata };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${limits.fetchTimeoutMs}ms`);
    }

    throw error;
  }
}

// ─── Helpers ──────────────────────────────────────────────

/** Fast regex extraction of a single meta tag value. */
function extractMeta(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*?)["']` +
      `|<meta[^>]+content=["']([^"']*?)["'][^>]+(?:name|property)=["']${name}["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] || m?.[2] || "";
}

function extractMetadata(html: string, baseUrl: string): PageMetadata {
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*?)["']/i,
  );

  return {
    title:
      extractMeta(html, "og:title") ||
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
    description: extractMeta(html, "description") || undefined,
    language: langMatch?.[1] || undefined,
    canonical: canonicalMatch?.[1]
      ? resolveUrl(canonicalMatch[1], baseUrl)
      : undefined,
    author: extractMeta(html, "author") || undefined,
    keywords: (() => {
      const kw = extractMeta(html, "keywords");
      return kw
        ? kw
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : undefined;
    })(),
    ogType: extractMeta(html, "og:type") || undefined,
    ogSiteName: extractMeta(html, "og:site_name") || undefined,
  };
}

function resolveUrl(
  url: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}
