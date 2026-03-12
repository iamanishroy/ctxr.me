/**
 * Rate limiter middleware — IP-based request throttling.
 * Uses a single row per IP with a sliding window counter.
 * 1 row read + 1 row write per request (vs N reads/writes before).
 */

import { createMiddleware } from "hono/factory";
import limits from "./config/limits.json";

export const rateLimiter = () => {
  return createMiddleware<{ Bindings: { DB: D1Database } }>(async (c, next) => {
    // Skip rate limiting for landing page and health check
    const path = c.req.path;
    if (path === "/" || path === "/ok") {
      return next();
    }

    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - limits.rateLimitWindowSeconds;

    // Single UPSERT: resets counter if window expired, else increments.
    // RETURNING gives us the new count — 1 read + 1 write total.
    const result = await c.env.DB.prepare(
      `INSERT INTO rate_limits (ip, count, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT(ip) DO UPDATE SET
         count = CASE
           WHEN rate_limits.window_start < ? THEN 1
           ELSE rate_limits.count + 1
         END,
         window_start = CASE
           WHEN rate_limits.window_start < ? THEN ?
           ELSE rate_limits.window_start
         END
       RETURNING count`,
    )
      .bind(ip, now, windowStart, windowStart, now)
      .first<{ count: number }>();

    const count = result?.count ?? 0;

    if (count > limits.rateLimitRequests) {
      return c.json(
        { error: "Rate limit exceeded", retryAfter: limits.rateLimitWindowSeconds },
        429,
        { "Retry-After": String(limits.rateLimitWindowSeconds) },
      );
    }

    await next();
  });
};
