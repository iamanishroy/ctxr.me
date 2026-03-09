import { Hono } from "hono";
import { scrape } from "./scrape";
import { cleanHtml } from "./html-cleaner";
import { htmlToMarkdown } from "./markdown";
import { normalizeUrl } from "./normalize-url";
import type { PageMetadata } from "./types";

type Bindings = {
  DB: D1Database;
};

const read = new Hono<{ Bindings: Bindings }>();

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Build a metadata header block for LLM consumption
 */
function buildMetadataHeader(
  targetUrl: string,
  title: string,
  description: string,
  metadata?: PageMetadata,
): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`Title: ${title}`);
  }

  if (description) {
    lines.push(`Description: ${description}`);
  }

  lines.push(`URL Source: ${targetUrl}`);

  if (metadata?.language) {
    lines.push(`Language: ${metadata.language}`);
  }

  if (metadata?.author) {
    lines.push(`Author: ${metadata.author}`);
  }

  if (metadata?.ogSiteName) {
    lines.push(`Site Name: ${metadata.ogSiteName}`);
  }

  if (metadata?.canonical && metadata.canonical !== targetUrl) {
    lines.push(`Canonical URL: ${metadata.canonical}`);
  }

  if (metadata?.ogType) {
    lines.push(`Content Type: ${metadata.ogType}`);
  }

  if (metadata?.keywords?.length) {
    lines.push(`Keywords: ${metadata.keywords.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * GET /<url>
 * Returns markdown content with metadata header
 * e.g. domain.com/https://example.com
 */
read.get("/*", async (c) => {
  const rawUrl = c.req.path.slice(1);

  if (!rawUrl) {
    return c.text("Missing URL. Usage: domain.com/<url>", 400);
  }

  const targetUrl = normalizeUrl(rawUrl);
  const now = Math.floor(Date.now() / 1000);

  try {
    // Check D1 cache
    const cached = await c.env.DB.prepare(
      "SELECT response, created_at FROM cache WHERE url = ? AND created_at > ?",
    )
      .bind(targetUrl, now - CACHE_TTL_SECONDS)
      .first<{ response: string; created_at: number }>();

    if (cached) {
      return c.text(cached.response, 200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Cache": "HIT",
      });
    }

    // Cache miss — scrape, clean, convert (single cheerio parse)
    const scraped = await scrape(targetUrl);
    const {
      cleanedHtml: cleaned,
      title: readabilityTitle,
      excerpt: readabilityExcerpt,
    } = cleanHtml(scraped.$, targetUrl);
    const markdown = htmlToMarkdown(cleaned);

    // Prefer Readability's title/excerpt when scraped ones are empty
    const title = scraped.title || readabilityTitle || "";
    const description = scraped.description || readabilityExcerpt || "";

    const header = buildMetadataHeader(
      targetUrl,
      title,
      description,
      scraped.metadata,
    );

    const body = markdown || "No content could be extracted from this URL.";
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const fullResponse = `${header}\nWord Count: ${wordCount}\n\n---\n\n${body}`;

    // Store in D1 cache (upsert)
    await c.env.DB.prepare(
      "INSERT INTO cache (url, response, created_at) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET response = excluded.response, created_at = excluded.created_at",
    )
      .bind(targetUrl, fullResponse, now)
      .run();

    return c.text(fullResponse, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Cache": "MISS",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.text(`Error: ${message}`, 500);
  }
});

export default read;
