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
const MAX_HTML_BYTES = 256_000; // 256KB after stripping

// Pre-compiled regex for stripping heavy non-content tags before cheerio
const STRIP_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<style[^>]*>[\s\S]*?<\/style>/gi,
  /<svg[^>]*>[\s\S]*?<\/svg>/gi,
  /<noscript[^>]*>[\s\S]*?<\/noscript>/gi,
  /<!--[\s\S]*?-->/g,
  /<link[^>]*>/gi,
];

/**
 * Fetches HTML from a URL and extracts metadata
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

    // Strip heavy non-content tags before parsing
    let strippedHtml = rawHtml;
    for (const re of STRIP_PATTERNS) {
      strippedHtml = strippedHtml.replace(re, "");
    }

    // Truncate to keep cheerio.load() fast
    if (strippedHtml.length > MAX_HTML_BYTES) {
      strippedHtml = strippedHtml.substring(0, MAX_HTML_BYTES);
    }

    const $ = cheerio.load(strippedHtml);

    const title = extractTitle($);
    const description = extractDescription($);
    const metadata = extractMetadata($, url);

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

function extractTitle($: cheerio.CheerioAPI): string {
  return (
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").first().text().trim() ||
    ""
  );
}

function extractDescription($: cheerio.CheerioAPI): string {
  return (
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    ""
  );
}

function extractMetadata($: cheerio.CheerioAPI, baseUrl: string): PageMetadata {
  const metadata: PageMetadata = {};

  metadata.title = extractTitle($);
  metadata.description = extractDescription($);
  metadata.language = $("html").attr("lang") || undefined;
  metadata.canonical = resolveUrl(
    $('link[rel="canonical"]').attr("href"),
    baseUrl,
  );
  metadata.author = $('meta[name="author"]').attr("content") || undefined;

  const keywords = $('meta[name="keywords"]').attr("content");
  if (keywords) {
    metadata.keywords = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  metadata.ogType = $('meta[property="og:type"]').attr("content") || undefined;
  metadata.ogSiteName =
    $('meta[property="og:site_name"]').attr("content") || undefined;

  return metadata;
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
