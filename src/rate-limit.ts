import { createMiddleware } from "hono/factory";

const MAX_REQUESTS = 10;
const WINDOW_SECONDS = 60;

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
    const windowStart = now - WINDOW_SECONDS;

    // Clean up expired entries and count current window in a batch
    const [, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        "DELETE FROM rate_limits WHERE ip = ? AND timestamp < ?",
      ).bind(ip, windowStart),
      c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM rate_limits WHERE ip = ? AND timestamp >= ?",
      ).bind(ip, windowStart),
    ]);

    const count = (countResult.results[0] as { count: number }).count;

    if (count >= MAX_REQUESTS) {
      return c.json(
        { error: "Rate limit exceeded", retryAfter: WINDOW_SECONDS },
        429,
        { "Retry-After": String(WINDOW_SECONDS) },
      );
    }

    // Record this request
    await c.env.DB.prepare(
      "INSERT INTO rate_limits (ip, timestamp) VALUES (?, ?)",
    )
      .bind(ip, now)
      .run();

    await next();
  });
};
