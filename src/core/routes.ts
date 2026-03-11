/**
 * HTTP routes — thin shell that delegates to the pipeline.
 * Only handles: URL parsing, caching, and HTTP responses.
 */

import { Hono } from "hono";
import limits from "../config/limits.json";
import { extractContent } from "./pipeline";
import { formatResponse } from "./formatter";
import { normalizeUrl } from "./normalize-url";

type Bindings = {
  DB: D1Database;
};

const read = new Hono<{ Bindings: Bindings }>();

/**
 * GET /<url>
 * Returns LLM-friendly markdown with metadata header.
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
      .bind(targetUrl, now - limits.cacheTtlSeconds)
      .first<{ response: string; created_at: number }>();

    if (cached) {
      return c.text(cached.response, 200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Cache": "HIT",
      });
    }

    // Cache miss — run the extraction pipeline
    const result = await extractContent(targetUrl);

    const fullResponse = formatResponse(
      targetUrl,
      result.title,
      result.description,
      result.markdown,
      result.metadata,
    );

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
