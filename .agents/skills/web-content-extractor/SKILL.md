---
name: web-content-extractor
description: Extract clean, LLM-friendly markdown from any web page. Handles standard HTML, React Server Components (RSC/Next.js), and client-side rendered pages. Use when building scrapers, content pipelines, or reader-mode features.
version: 1.0.0
---

# Web Content Extraction

A multi-stage pipeline for converting web pages to clean markdown. Designed for Cloudflare Workers but the patterns apply to any runtime.

## Architecture

```
Raw HTML → Pre-strip → cheerio.load() → Readability → Markdown → Post-process
                                             ↓ (fallback)
                                        RSC Extractor (Next.js)
                                             ↓ (fallback)
                                        Manual Selectors
```

## Stage 1: Fetch & Pre-strip

Fetch HTML with browser-like headers to avoid bot detection. Before parsing with cheerio, **strip heavy non-content tags** using regex to reduce DOM size and CPU time:

```typescript
const STRIP_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<style[^>]*>[\s\S]*?<\/style>/gi,
  /<svg[^>]*>[\s\S]*?<\/svg>/gi,
  /<noscript[^>]*>[\s\S]*?<\/noscript>/gi,
  /<!--[\s\S]*?-->/g,
  /<link[^>]*>/gi,
];

let stripped = rawHtml;
for (const re of STRIP_PATTERNS) {
  stripped = stripped.replace(re, "");
}
```

> **Important:** If you need RSC extraction, run it on the **original `rawHtml`** BEFORE stripping, since RSC flight data lives inside `<script>` tags.

**Truncation:** For CPU-constrained environments (Cloudflare Workers free tier = 10ms CPU), truncate to 256-512KB after stripping.

## Stage 2: Content Extraction (3-tier fallback)

### Tier 1: Readability (primary)

Use `@jsr/paoramen__cheer-reader` (cheerio-compatible Readability port). Returns parsed article content, title, and excerpt.

```typescript
const result = new Readability($, { charThreshold: 100 }).parse();
```

Check word count on the result. If ≥50 words, return it. If sparse, fall through.

> **Warning:** Readability's `.parse()` **mutates the shared cheerio `$` instance** — it removes scripts, styles, and other tags. Always extract RSC content BEFORE calling Readability.

### Tier 2: RSC Extraction (Next.js fallback)

For pages using React Server Components, content is embedded in `<script>self.__next_f.push()</script>` tags as flight data, not in the visible DOM.

**Detection:** Fast string check — `rawHtml.includes("__next_f")`

**Extraction pattern:**

1. Find all `self.__next_f.push([1,"..."])` payloads via regex on rawHtml
2. Unescape the flight data (nested escaping: `\\n`, `\\"`, etc.)
3. Extract headings: `"as":"h1"..."children":"Title Text"`
4. Extract body: `"children":"Long text content..."` (≥40 chars)
5. **Sort by match index** to preserve document order (critical — without this, all headings group at the top)

```typescript
const elements: { index: number; html: string }[] = [];

// Headings
const headingRe = /"as"\s*:\s*"(h[1-6])"[^}]*?"children"\s*:\s*"([^"]{3,})"/g;
while ((match = headingRe.exec(text)) !== null) {
  elements.push({
    index: match.index,
    html: `<${match[1]}>${clean}</${match[1]}>`,
  });
}

// Body text
const bodyRe = /"children"\s*:\s*"([^"]{40,})"/g;
while ((match = bodyRe.exec(text)) !== null) {
  // Filter out code, URLs, framework internals
  elements.push({ index: match.index, html: `<p>${clean}</p>` });
}

// Sort by position in payload
elements.sort((a, b) => a.index - b.index);
```

**Filter out false positives** — skip children strings containing `{`, `function`, `/_next/`, or starting with `$`.

### Tier 3: Manual Selectors (last resort)

Try content selectors in priority order:

```typescript
const CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  ".content, .post-content, .article-content, .entry-content",
  "#content, #main-content, #main",
  "#app, #root, #__next, #__nuxt",
];
```

Remove non-content elements first:

```typescript
const REMOVE_SELECTORS = [
  "script, style, noscript, iframe, svg",
  "nav, header, footer, aside",
  '[role="navigation"], [role="banner"], [role="contentinfo"]',
  '[aria-hidden="true"], [hidden]',
  ".ad, .ads, .sidebar, .menu, .comments, .social, .cookie, .popup",
];
```

## Stage 3: HTML → Markdown

Use `node-html-markdown` with custom code block translators that handle language detection via `class="language-*"` attributes.

## Stage 4: Post-processing Pipeline

8 cleaners, applied in order:

| Cleaner                     | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `processMultiLineLinks`     | Escape newlines inside `[link text]`             |
| `removeNavigationAidLinks`  | Strip "Skip to content", "Back to top" links     |
| `removeEmptyLinks`          | Remove `[](url)` patterns                        |
| `cleanBrokenTables`         | Fix pipe-only rows, extract layout table content |
| `truncateLongAltText`       | Cap image alt text at 120 chars                  |
| `collapseRedundantHeadings` | Remove consecutive duplicate headings            |
| `fixCodeBlockFormatting`    | Merge stray language IDs into code fences        |
| `removeExcessiveNewlines`   | Collapse 3+ newlines to 2                        |

> **Performance tip:** Pre-compile all regex patterns at module level, not inside functions. Especially important for patterns with large alternations (e.g., 80+ language identifiers for code blocks).

## CPU Optimization Checklist

When targeting Cloudflare Workers free tier (10ms CPU):

- [ ] Pre-strip `<script>/<style>/<svg>` from raw HTML before `cheerio.load()`
- [ ] Truncate HTML to 256-512KB after stripping
- [ ] Extract `<head>` metadata with cheerio on the (smaller) stripped HTML
- [ ] Pre-compile all regex patterns at module level
- [ ] Use `countWords()` helper instead of repeating `html.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length`
- [ ] Skip RSC extraction when `rawHtml` doesn't contain `__next_f`
- [ ] Avoid extra `cheerio.load()` calls — work on the existing `$` instance

## Reference Implementation

See the `ctxr` project at `/Users/anish/Desktop/Developer/ctxr/src/core/` for the complete implementation:

- `scrape.ts` — Fetch + pre-strip + metadata
- `html-cleaner.ts` — 3-tier content extraction
- `rsc-extractor.ts` — Next.js RSC flight data parser
- `markdown.ts` — HTML → Markdown pipeline
- `md-cleaners.ts` — 8 post-processing cleaners
- `md-translators.ts` — Custom code block translators
- `table-utils.ts` — Layout table detection
- `url-fixer.ts` — Relative → absolute URL resolution
