---
name: web-content-extractor
description: Extract clean, LLM-friendly markdown from any web page. Handles standard HTML, React Server Components (RSC/Next.js), and client-side rendered pages. Use when building scrapers, content pipelines, or reader-mode features.
version: 3.0.0
---

# Web Content Extraction

A modular pipeline for converting web pages to clean markdown. Designed for Cloudflare Workers using the streaming HTMLRewriter API for near-zero CPU cost.

## Architecture

```
pipeline.ts — single orchestrator
  1. fetcher.ts    → fetch + metadata from <head>
  2. extractor.ts  → extract <article>/<main>, strip footers, truncate
  3. html-rewriter → streaming HTMLRewriter, 120+ selectors
  4. markdown.ts   → HTML → Markdown, 8-stage cleanup, RSC fallback
  5. formatter.ts  → word cap, metadata header, response assembly
```

All numeric limits and filter lists are in JSON config files (`src/config/`), not hardcoded.

## Config Files

| File | Purpose |
|---|---|
| `limits.json` | All numeric limits (max HTML bytes, max words, fetch timeout, cache TTL, rate limit) |
| `exclude-selectors.json` | HTMLRewriter selectors organized by category |
| `footer-sections.json` | Section heading IDs to strip (references, bibliography, etc.) |
| `content-containers.json` | Container tags to extract (`article`, `main`) |

## Stage 1: Fetch + Metadata (`fetcher.ts`)

Fetch HTML with browser-like headers. Extract metadata from `<head>` section only using fast regex — **no DOM parsing**.

```typescript
export async function fetchPage(url: string): Promise<FetchResult> {
  // Fetch with timeout from limits.json
  const html = await response.text();

  // Extract metadata from <head> only — much smaller search surface
  const headEnd = html.indexOf("</head>");
  const headHtml = headEnd > 0 ? html.substring(0, headEnd) : html.substring(0, 10_000);

  const title = extractMeta(headHtml, "og:title") || ...;
  return { html, title, description, metadata };
}
```

## Stage 2: Content Extraction (`extractor.ts`)

Three-phase content narrowing, all using string scanning (no DOM):

```typescript
export function extractMainContent(html: string): string {
  // Phase 1: Extract <article> or <main> container
  let content = extractContainer(html) || html;

  // Phase 2: Strip footer sections (References, External links, etc.)
  content = stripFooterSections(content);

  // Phase 3: Truncate to safety-net byte limit
  if (content.length > limits.maxHtmlBytes) { ... }

  return content;
}
```

**Container extraction** uses indexOf-based nesting-aware scanning. **Footer stripping** finds the earliest `id="references"` (etc.) heading and cuts everything after it.

> **Example:** Wikipedia SRK page: 943KB → extract `<main>` (889KB) → strip footer (237KB) → only article prose remains.

## Stage 3: HTML Cleaning (`html-rewriter.ts`)

Cloudflare's built-in **HTMLRewriter** — streaming parser, near-zero CPU. Selectors loaded from `exclude-selectors.json`.

```typescript
export async function cleanWithRewriter(html: string, baseUrl: string): Promise<string> {
  return await new HTMLRewriter()
    .on("*", new MainContentHandler())
    .on("a[href]", new LinkNormalizeHandler(baseUrl))
    .on("img[src]", new LinkNormalizeHandler(baseUrl))
    .transform(new Response(html)).text();
}
```

## Stage 4: Markdown Conversion (`markdown.ts`)

`node-html-markdown` with 8 post-processing cleaners applied in order.

## Stage 5: RSC Fallback (`rsc-extractor.ts`)

If markdown has < `minWordCount` words, try extracting Next.js RSC flight data from `self.__next_f.push()` script tags.

## Stage 6: Formatting (`formatter.ts`)

Truncate markdown at `maxResponseWords` (paragraph boundary), build metadata header, assemble response.

## Limits & Hard Caps

All values from `limits.json`:

| Limit | Default | Purpose |
|---|---|---|
| `maxHtmlBytes` | 256KB | Safety-net truncation after extraction |
| `maxResponseWords` | 10,000 | Word cap for final markdown |
| `minWordCount` | 50 | Threshold for RSC fallback |
| `fetchTimeoutMs` | 30,000 | HTTP fetch timeout |
| `cacheTtlSeconds` | 3,600 | D1 cache TTL |
| `rateLimitRequests` | 10 | Requests per window |
| `rateLimitWindowSeconds` | 60 | Rate limit window |

## CPU Optimization

- **HTMLRewriter** — streaming vs DOM parsing
- **Footer stripping** — removes 69% of Wikipedia's `<main>` block before processing
- **Content container extraction** — narrows HTML to just `<article>`/`<main>`
- **Head-only metadata** — avoids regex on full HTML
- **Pre-compiled regex** in cleaners
- **No cheerio, no Readability**

## Reference Implementation

See the `ctxr` project at `/Users/anish/Desktop/Developer/ctxr/src/`:

- `config/` — JSON config files (limits, selectors, footer sections, containers)
- `core/pipeline.ts` — Orchestrator
- `core/fetcher.ts` — HTTP fetch + metadata
- `core/extractor.ts` — Content extraction + footer stripping
- `core/html-rewriter.ts` — HTMLRewriter streaming cleaner
- `core/selectors.ts` — Loads selectors from JSON
- `core/rsc-extractor.ts` — Next.js RSC parser
- `core/formatter.ts` — Response formatting
- `core/markdown.ts` — HTML → Markdown + cleaners
