---
name: web-content-extractor
description: Extract clean, LLM-friendly markdown from any web page. Handles standard HTML, React Server Components (RSC/Next.js), and client-side rendered pages. Use when building scrapers, content pipelines, or reader-mode features.
version: 2.2.0
---

# Web Content Extraction

A multi-stage pipeline for converting web pages to clean markdown. Designed for Cloudflare Workers using the streaming HTMLRewriter API for near-zero CPU cost.

## Architecture

```
Raw HTML → Metadata from <head>
    → Extract <article>/<main> container
    → Truncate at 256KB
    → HTMLRewriter (streaming clean)
    → Markdown → Post-process → Cap at 10,000 words
                                    ↓ (sparse result?)
                               RSC Extractor (Next.js)
```

## Stage 1: Fetch + Metadata

Fetch HTML with browser-like headers. Extract metadata from `<head>` section only (not full HTML) using fast regex — **no DOM parsing**.

```typescript
// Extract <head> for metadata — much smaller search surface
const headEnd = rawHtml.indexOf("</head>");
const headHtml = headEnd > 0 ? rawHtml.substring(0, headEnd) : rawHtml.substring(0, 10_000);

const title = extractMeta(headHtml, "og:title") ||
  headHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";
```

After metadata extraction, extract the content container and truncate:

```typescript
const CONTENT_TAGS = ["article", "main"];

// Phase 1: Extract content container from FULL HTML (before truncation)
let rawHtml = extractContentContainer(fullHtml) || fullHtml;

// Phase 2: Truncate to stay within CPU limits
const MAX_HTML_BYTES = 256_000; // 256KB
if (rawHtml.length > MAX_HTML_BYTES) {
  const cutPoint = rawHtml.lastIndexOf(">", MAX_HTML_BYTES);
  rawHtml = rawHtml.substring(0, cutPoint > 0 ? cutPoint + 1 : MAX_HTML_BYTES);
}
```

> **Important:** Content container extraction runs on the FULL HTML before truncation. This narrows a 947KB Wikipedia page to its ~300KB `<main>` block, then truncates to 256KB. Much less for downstream processing.

## Stage 2: Content Cleaning (HTMLRewriter)

Use Cloudflare's built-in **HTMLRewriter** — a streaming parser that processes HTML tag-by-tag without building a DOM tree.

### MainContentHandler

Removes non-content elements by matching tag name, class, ID, and ARIA attributes against 120+ pre-parsed selectors:

```typescript
// selectors.ts — pre-parsed at module init
const EXCLUDE_PATTERNS = EXCLUDE_SELECTORS.map((selector) => {
  if (selector.startsWith(".")) return { className: selector.slice(1) };
  if (selector.startsWith("#")) return { id: selector.slice(1) };
  if (selector.startsWith("[")) return { attr: { name, value } };
  return { tag: selector };
});

// html-rewriter.ts
class MainContentHandler implements HTMLRewriterElementContentHandlers {
  element(element: Element) {
    // Check tag, class, id, attrs against pre-parsed patterns
    if (shouldRemove) element.remove();
  }
}
```

### LinkNormalizeHandler

Converts relative URLs to absolute for `<a>`, `<img>`, and `<link>` tags.

```typescript
export async function cleanWithRewriter(rawHtml: string, baseUrl: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("*", new MainContentHandler())
    .on("a[href]", new LinkNormalizeHandler(baseUrl))
    .on("img[src]", new LinkNormalizeHandler(baseUrl));

  return await rewriter.transform(new Response(rawHtml)).text();
}
```

> **Key advantage:** Content container extraction happens upstream in `scrape.ts`, so HTMLRewriter only processes the extracted `<article>`/`<main>` content (not the full page).

## Stage 2b: RSC Extraction (Next.js fallback)

If HTMLRewriter's result has < 50 words, fall back to RSC extraction for Next.js pages. Content is embedded in `<script>self.__next_f.push()</script>` tags as flight data.

**Detection:** `rawHtml.includes("__next_f")`

**Extraction pattern:**
1. Find all `self.__next_f.push([1,"..."])` payloads via regex on rawHtml
2. Unescape the flight data (nested escaping: `\\n`, `\\"`, etc.)
3. Extract headings: `"as":"h1"..."children":"Title Text"`
4. Extract body: `"children":"Long text content..."` (≥40 chars)
5. **Sort by match index** to preserve document order (critical)

**Filter out false positives** — skip children strings containing `{`, `function`, `/_next/`, or starting with `$`.

## Stage 3: HTML → Markdown

Use `node-html-markdown` with custom code block translators that handle language detection via `class="language-*"` attributes.

## Stage 4: Post-processing Pipeline

8 cleaners, applied in order:

| Cleaner | Purpose |
|---|---|
| `processMultiLineLinks` | Escape newlines inside `[link text]` |
| `removeNavigationAidLinks` | Strip "Skip to content", "Back to top" links |
| `removeEmptyLinks` | Remove `[](url)` patterns |
| `cleanBrokenTables` | Fix pipe-only rows, extract layout table content |
| `truncateLongAltText` | Cap image alt text at 120 chars |
| `collapseRedundantHeadings` | Remove consecutive duplicate headings |
| `fixCodeBlockFormatting` | Merge stray language IDs into code fences |
| `removeExcessiveNewlines` | Collapse 3+ newlines to 2 |

> **Performance tip:** Pre-compile all regex patterns at module level, not inside functions.

## CPU Optimization & Hard Limits

| Limit | Value | Purpose |
|---|---|---|
| HTML truncation | 256KB | Caps HTML fed to HTMLRewriter + markdown converter |
| Metadata from `<head>` only | ~first few KB | Avoids regex on full HTML |
| Markdown word cap | 10,000 words | Prevents abuse; truncates at paragraph boundary |
| Rate limit | 10 req/min/IP | Prevents scraping abuse |

- **HTMLRewriter** is the single biggest optimization — streaming vs DOM parsing
- **Content container extraction** — scans for `<article>` / `<main>` after HTMLRewriter cleaning
- **Pre-compiled regex** in post-processing cleaners
- **No cheerio, no Readability** in the critical path

## Reference Implementation

See the `ctxr` project at `/Users/anish/Desktop/Developer/ctxr/src/core/`:

- `scrape.ts` — Fetch + regex metadata
- `html-rewriter.ts` — HTMLRewriter streaming content cleaner
- `selectors.ts` — 120+ non-content CSS selectors
- `rsc-extractor.ts` — Next.js RSC flight data parser
- `markdown.ts` — HTML → Markdown pipeline
- `md-cleaners.ts` — 8 post-processing cleaners
- `md-translators.ts` — Custom code block translators
- `normalize-url.ts` — URL normalization
