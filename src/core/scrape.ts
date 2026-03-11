import type { PageMetadata, ScrapedData } from "./types";

/** Max HTML bytes to process — truncate larger pages to stay within CPU limits. */
const MAX_HTML_BYTES = 256_000; // 256KB

/** Max words in the final markdown response — prevents abuse with huge pages. */
export const MAX_RESPONSE_WORDS = 10_000;

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

/** Content container tags to try extracting (in priority order). */
const CONTENT_TAGS = ["article", "main"];

/**
 * Extract <article> or <main> from raw HTML using indexOf scanning.
 * Runs BEFORE truncation so large pages get narrowed to just the content area.
 */
function extractContentContainer(html: string): string | null {
  const lowerHtml = html.toLowerCase();

  for (const tag of CONTENT_TAGS) {
    const openTag = `<${tag}`;
    const closeTag = `</${tag}>`;

    const startIdx = lowerHtml.indexOf(openTag);
    if (startIdx === -1) continue;

    let depth = 1;
    let searchFrom = startIdx + openTag.length;

    while (depth > 0 && searchFrom < lowerHtml.length) {
      const nextOpen = lowerHtml.indexOf(openTag, searchFrom);
      const nextClose = lowerHtml.indexOf(closeTag, searchFrom);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchFrom = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) {
          return html.substring(startIdx, nextClose + closeTag.length);
        }
        searchFrom = nextClose + closeTag.length;
      }
    }
  }

  return null;
}

/**
 * Fetches HTML from a URL and extracts metadata via regex (no DOM parsing).
 * Extracts content container and truncates before returning.
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

    const fullHtml = await response.text();

    // Extract metadata from <head> only — much smaller search surface
    const headEnd = fullHtml.indexOf("</head>");
    const headHtml = headEnd > 0 ? fullHtml.substring(0, headEnd) : fullHtml.substring(0, 10_000);

    const title = extractMeta(headHtml, "og:title") ||
      extractMeta(headHtml, "twitter:title") ||
      headHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";

    const description =
      extractMeta(headHtml, "description") ||
      extractMeta(headHtml, "og:description") || "";

    const metadata = extractMetadata(headHtml, url);

    // Phase 1: Try to extract just the content container (before truncation)
    let rawHtml = extractContentContainer(fullHtml) || fullHtml;

    // Phase 2: Truncate oversized HTML to stay within CPU limits
    if (rawHtml.length > MAX_HTML_BYTES) {
      const cutPoint = rawHtml.lastIndexOf(">", MAX_HTML_BYTES);
      rawHtml = rawHtml.substring(0, cutPoint > 0 ? cutPoint + 1 : MAX_HTML_BYTES);
    }

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
