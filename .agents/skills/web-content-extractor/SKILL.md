---
name: web-content-extractor
description: Extract clean, LLM-friendly markdown from any web page. Handles standard HTML, React Server Components (RSC/Next.js), and client-side rendered pages. Use when building scrapers, content pipelines, or reader-mode features.
version: 2.0.0
---

# Web Content Extraction

A multi-stage pipeline for converting web pages to clean markdown. Designed for Cloudflare Workers using the streaming HTMLRewriter API for near-zero CPU cost.

## Architecture

```
Raw HTML → HTMLRewriter (streaming clean) → Markdown → Post-process
                                                ↓ (sparse result?)
                                           RSC Extractor (Next.js)
```

## Stage 1: Fetch + Metadata

Fetch HTML with browser-like headers. Extract metadata from `<head>` using fast regex — **no DOM parsing**.

```typescript
function extractMeta(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*?)["']`,
    "i",
  );
  return html.match(re)?.[1] || "";
}

const title = extractMeta(rawHtml, "og:title") ||
  rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";
```

> **Important:** No cheerio or DOM parsing is used for metadata. This alone saves significant CPU time.

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

### Usage

```typescript
export async function cleanWithRewriter(rawHtml: string, baseUrl: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("*", new MainContentHandler())
    .on("a[href]", new LinkNormalizeHandler(baseUrl))
    .on("img[src]", new LinkNormalizeHandler(baseUrl));

  const response = new Response(rawHtml, { headers: { "content-type": "text/html" } });
  return await rewriter.transform(response).text();
}
```

> **Key advantage:** HTMLRewriter is built into the Workers runtime. It processes HTML in a single streaming pass with near-zero CPU overhead — no DOM tree, no memory allocation for parsed nodes.

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

## CPU Optimization Notes

- **HTMLRewriter** is the single biggest optimization — streaming vs DOM parsing
- **Regex metadata** from `<head>` — avoids cheerio entirely  
- **RSC extraction** on raw HTML string — no DOM dependency
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
