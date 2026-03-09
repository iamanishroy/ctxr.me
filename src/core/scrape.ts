import * as cheerio from "cheerio";
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
const MAX_HTML_BYTES = 1512_000; // 512KB after stripping

// Pre-compiled regex for stripping heavy non-content tags
const STRIP_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<style[^>]*>[\s\S]*?<\/style>/gi,
  /<svg[^>]*>[\s\S]*?<\/svg>/gi,
  /<noscript[^>]*>[\s\S]*?<\/noscript>/gi,
  /<!--[\s\S]*?-->/g,
  /<link[^>]*>/gi,
];

/**
 * Extract metadata from <head> using fast regex (no cheerio needed).
 */
function extractMetadataFromHead(
  html: string,
  baseUrl: string,
): {
  title: string;
  description: string;
  metadata: PageMetadata;
} {
  const meta = (name: string): string => {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*?)["']|<meta[^>]+content=["']([^"']*?)["'][^>]+(?:name|property)=["']${name}["']`,
      "i",
    );
    const m = html.match(re);
    return m?.[1] || m?.[2] || "";
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title =
    meta("og:title") || meta("twitter:title") || titleMatch?.[1]?.trim() || "";
  const description = meta("description") || meta("og:description") || "";

  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*?)["']/i,
  );
  const keywordsStr = meta("keywords");

  const metadata: PageMetadata = {
    title,
    description,
    language: langMatch?.[1] || undefined,
    canonical: canonicalMatch?.[1]
      ? resolveUrl(canonicalMatch[1], baseUrl)
      : undefined,
    author: meta("author") || undefined,
    keywords: keywordsStr
      ? keywordsStr
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : undefined,
    ogType: meta("og:type") || undefined,
    ogSiteName: meta("og:site_name") || undefined,
  };

  return { title, description, metadata };
}

/**
 * Strip heavy non-content tags from HTML string (fast, no DOM parsing).
 */
function preStripHtml(html: string): string {
  let stripped = html;
  for (const re of STRIP_PATTERNS) {
    stripped = stripped.replace(re, "");
  }
  return stripped;
}

/**
 * Fetches HTML from a URL and extracts metadata.
 * Metadata is extracted with regex (no cheerio).
 * Body content is pre-stripped and truncated before cheerio.load().
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

    // 1. Extract metadata from <head> with regex — zero cheerio cost
    const { title, description, metadata } = extractMetadataFromHead(
      rawHtml,
      url,
    );

    // 2. Strip heavy tags before cheerio sees the HTML
    let cleanedForParse = preStripHtml(rawHtml);

    // 3. Truncate to keep cheerio.load() fast
    if (cleanedForParse.length > MAX_HTML_BYTES) {
      cleanedForParse = cleanedForParse.substring(0, MAX_HTML_BYTES);
    }

    // 4. Lightweight cheerio parse on pre-cleaned HTML
    const $ = cheerio.load(cleanedForParse);

    return {
      title,
      description,
      rawHtml,
      $,
      metadata,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${FETCH_TIMEOUT}ms`);
    }

    throw error;
  }
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
