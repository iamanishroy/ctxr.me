# ctxr.me

**Prepend `ctxr.me/` to any URL → get clean, LLM-ready markdown.**

```bash
curl ctxr.me/https://news.ycombinator.com
```

No auth. No API key. No SDK. Just plain HTTP. Sub-second results.

---

## How It Works

1. **Prepend** `ctxr.me/` to any URL
2. ctxr fetches the page, extracts the main content, strips noise
3. Returns clean **structured markdown** — ready for prompts, RAG, or agents

### Example

```bash
$ curl ctxr.me/https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)

Title: Transformer (deep learning architecture) - Wikipedia
URL Source: https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)
Word Count: 8432

---

# Transformer (deep learning architecture)

A **transformer** is a deep learning architecture...
```

Works with `curl`, `fetch()`, Python `requests`, AI agents — anything that speaks HTTP.

---

## Architecture

```
GET /https://example.com
         │
         ▼
┌─────────────────────────────────────────┐
│  pipeline.ts — orchestrator             │
│                                         │
│  1. fetcher.ts                          │
│     Fetch HTML, extract metadata from   │
│     <head> via regex + JSON-LD          │
│                                         │
│  2. extractor.ts                        │
│     Extract <article>/<main> container  │
│     Strip footer sections by heading ID │
│     Truncate to 256KB safety net        │
│                                         │
│  3. html-rewriter.ts                    │
│     HTMLRewriter streaming cleaner      │
│     Strips 120+ non-content selectors   │
│                                         │
│  4. markdown.ts + md-cleaners.ts        │
│     HTML → Markdown, 8-stage cleanup    │
│     RSC fallback for Next.js pages      │
│                                         │
│  5. formatter.ts                        │
│     Cap at 10,000 words, build header   │
│                                         │
│         ▼                               │
│  Return clean markdown                  │
└─────────────────────────────────────────┘
```

### Project Structure

```
ctxr/
├── public/                  # Landing page (static assets)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── favicon.ico
├── src/
│   ├── index.ts             # Hono app entry point
│   ├── rate-limit.ts        # IP-based rate limiting (D1)
│   ├── config/
│   │   ├── limits.json          # All numeric limits
│   │   ├── exclude-selectors.json # HTMLRewriter selectors (by category)
│   │   ├── footer-sections.json   # Section IDs to strip
│   │   ├── content-containers.json # Container tags to extract
│   │   └── cleaner-patterns.json  # Markdown cleaner phrases + thresholds
│   └── core/
│       ├── pipeline.ts      # Extraction orchestrator (entry point)
│       ├── fetcher.ts       # HTTP fetch + metadata + JSON-LD
│       ├── extractor.ts     # Content extraction + footer stripping
│       ├── html-rewriter.ts # HTMLRewriter streaming cleaner
│       ├── selectors.ts     # Loads selectors from JSON config
│       ├── rsc-extractor.ts # Next.js RSC flight data parser
│       ├── formatter.ts     # Response formatting + word truncation
│       ├── markdown.ts      # HTML → Markdown pipeline
│       ├── md-cleaners.ts   # 11 post-processing cleaners
│       ├── md-translators.ts # Custom code block translators
│       ├── normalize-url.ts # URL normalization + deduplication
│       ├── routes.ts        # Thin HTTP handler (cache + pipeline)
│       └── types.ts         # TypeScript interfaces
├── tests/
│   ├── fixtures/            # HTML snippets for deterministic tests
│   ├── extractor.test.ts    # Container extraction + footer stripping
│   ├── formatter.test.ts    # Metadata header + word truncation
│   └── md-cleaners.test.ts  # All 8 post-processing cleaners
├── schema.sql               # D1 database schema
├── wrangler.jsonc            # Cloudflare Workers config
└── .github/workflows/
    └── deploy.yml           # Auto-deploy on push to main
```

### Tech Stack

| Layer               | Technology                                                                            |
| ------------------- | ------------------------------------------------------------------------------------- |
| Runtime             | [Cloudflare Workers](https://workers.cloudflare.com/)                                 |
| Framework           | [Hono](https://hono.dev/)                                                             |
| Database            | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)                       |
| HTML Cleaning       | [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) (streaming) |
| Markdown Conversion | [node-html-markdown](https://github.com/crosstype/node-html-markdown)                 |
| Structured Data     | JSON-LD (`<script type="application/ld+json">`)                                        |
| Testing             | [Vitest](https://vitest.dev/)                                                         |
| Static Assets       | [Cloudflare Workers Assets](https://developers.cloudflare.com/workers/static-assets/) |

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Yarn](https://yarnpkg.com/) (v1)

### Setup

```bash
# Clone the repo
git clone https://github.com/iamanishroy/ctxr.me.git
cd ctxr.me

# Install dependencies
yarn install

# Create the local D1 database
npx wrangler d1 execute ctxr --local --file=schema.sql

# Start dev server
yarn dev
```

The dev server runs at `http://localhost:8787` (or `8788` depending on port availability).

### Test it

```bash
# Health check
curl http://localhost:8787/ok

# Convert a URL
curl http://localhost:8787/https://example.com

# Run unit tests
yarn test
```

---

## Deployment

ctxr.me deploys to **Cloudflare Workers** via GitHub Actions.

### Automatic (CI/CD)

Every push to `main` triggers a deploy via `.github/workflows/deploy.yml`.

1. Add the following to **GitHub Secrets** (Settings → Secrets → Actions):
   - `CLOUDFLARE_API_TOKEN` — your Cloudflare API token
   - `D1_DATABASE_ID` — your D1 database ID (from `wrangler d1 create`)
2. Push to `main`
3. Done

### Manual

```bash
# One-time: create the D1 database
npx wrangler d1 create ctxr

# Apply schema
npx wrangler d1 execute ctxr --file=schema.sql

# Deploy
yarn deploy
```

### Environment

The only binding required is a D1 database named `ctxr`. Update the `database_id` in `wrangler.jsonc` with your own after running `wrangler d1 create`.

---

## Rate Limiting

- **10 requests per minute** per IP address
- Landing page (`/`) and health check (`/ok`) are exempt
- Returns `429` with `Retry-After` header when exceeded
- Rate limit state is stored in D1

## Caching

- Responses are cached in D1 for **1 hour**
- Cache key is the normalized URL (lowercase host, sorted params, no tracking params)
- `X-Cache: HIT` / `X-Cache: MISS` header indicates cache status

---

## Contributing

Pull requests welcome. For major changes, open an issue first.

```bash
# Fork & clone
git clone https://github.com/YOUR_USERNAME/ctxr.me.git
cd ctxr.me
yarn install
npx wrangler d1 execute ctxr --local --file=schema.sql
yarn dev
```

---

## License

[MIT](LICENSE)

---

Built by [Anish Roy](https://anishroy.com)
