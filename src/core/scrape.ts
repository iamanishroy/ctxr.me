import type { PageMetadata, ScrapedData } from "./types";

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

const FETCH_TIMEOUT = 30000;

/**
 * Fetches HTML from a URL and extracts metadata via regex (no DOM parsing).
 */
export async function scrape(url: string): Promise<ScrapedData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

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

    const rawHtml = await response.text();

    // Extract metadata with regex — zero DOM cost
    const title = extractMeta(rawHtml, "og:title") ||
      extractMeta(rawHtml, "twitter:title") ||
      rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";

    const description =
      extractMeta(rawHtml, "description") ||
      extractMeta(rawHtml, "og:description") || "";

    const metadata = extractMetadata(rawHtml, url);

    return { title, description, rawHtml, metadata };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${FETCH_TIMEOUT}ms`);
    }

    throw error;
  }
}

/** Fast regex extraction of a single meta tag value. */
function extractMeta(html: string, name: string): string {
  // Match both name="..." content="..." and content="..." name="..." orderings
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
    title: extractMeta(html, "og:title") ||
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
        ? kw.split(",").map((k) => k.trim()).filter(Boolean)
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
