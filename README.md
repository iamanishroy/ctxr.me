# ctxr.me

**Prepend `ctxr.me/` to any URL → get clean, LLM-ready markdown.**

```bash
curl ctxr.me/https://news.ycombinator.com
```

No auth. No API key. No SDK. Just plain HTTP.

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
│  1. Fetch + Metadata                   │
│  scrape.ts → fetch HTML with browser    │
│  headers. Extract metadata from <head>  │
│  via regex (no DOM parsing). Pre-strip  │
│  <script>/<style>/<svg>/<noscript> and  │
│  comments before cheerio.load().        │
│                                         │
│         ▼                               │
│  2. Extract Content                     │
│  html-cleaner.ts → Readability parses   │
│  the main content, strips nav/ads/      │
│  sidebars. Falls back to:               │
│    a) RSC extraction for Next.js pages  │
│       (regex on raw HTML string)        │
│    b) Manual content selectors          │
│       (main, article, #__next, etc.)    │
│                                         │
│         ▼                               │
│  3. Convert to Markdown                 │
│  markdown.ts → node-html-markdown       │
│  converts clean HTML to markdown        │
│                                         │
│         ▼                               │
│  4. Post-process                        │
│  md-cleaners.ts → 8-stage pipeline:     │
│    • fix multi-line links               │
│    • remove nav aids (skip to content)  │
│    • remove empty links                 │
│    • clean broken/layout tables         │
│    • truncate long alt text             │
│    • collapse duplicate headings        │
│    • fix code block formatting          │
│    • remove excessive newlines          │
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
│   └── core/
│       ├── routes.ts        # GET /* handler + D1 caching
│       ├── scrape.ts        # Fetch + regex metadata + pre-strip HTML
│       ├── html-cleaner.ts  # Readability + RSC + manual fallback
│       ├── rsc-extractor.ts # Next.js RSC flight data parser
│       ├── markdown.ts      # HTML → Markdown pipeline
│       ├── md-cleaners.ts   # 8 post-processing cleaners
│       ├── md-translators.ts # Custom code block translators
│       ├── normalize-url.ts # URL normalization + deduplication
│       ├── table-utils.ts   # Layout table detection/stripping
│       ├── url-fixer.ts     # Relative → absolute URL resolution
│       └── types.ts         # TypeScript interfaces
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
| HTML Parsing        | [cheerio](https://cheerio.js.org/)                                                    |
| Content Extraction  | [@jsr/paoramen\_\_cheer-reader](https://jsr.io/@paoramen/cheer-reader) (Readability)  |
| Markdown Conversion | [node-html-markdown](https://github.com/crosstype/node-html-markdown)                 |
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
