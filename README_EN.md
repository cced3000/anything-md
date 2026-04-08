# Anything-MD

> Convert any URL content to Markdown — powered by Cloudflare Workers AI

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/doocs/anything-md)

## Overview

Anything-MD is a lightweight API service running on [Cloudflare Workers](https://workers.cloudflare.com/). Visiting the root path with no parameters opens an interactive tool page; you can also pass in any URL to fetch page content, or provide content directly, then convert it to structured Markdown using [Workers AI toMarkdown](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/).

Great for RAG data preprocessing, LLM training corpus collection, and giving AI Agents the ability to read web pages.

## Features

- 🔗 **URL to Markdown** — Supply any URL, get back Markdown
- � **Direct Content Conversion** — No URL needed, pass HTML or other content directly
- �📄 **Multi-format support** — PDF, HTML, Office docs, images, CSV, and more
- 🧾 **Download-link detection** — Auto-detect PDF / legacy `.doc` payloads from `application/octet-stream` responses
- 🔐 **Key auth** — `GET` uses `?key=...`, `POST` uses `X-API-Key`
- 🧰 **Default tool page** — Opening the deployed root URL shows a polished UI instead of plain usage JSON
- 🖼️ **Image summarization** — Images are automatically described using Workers AI models
- 🌐 **CORS enabled** — Full cross-origin support for direct browser calls
- 🔁 **Smart retries** — Built-in exponential back-off with jitter for transient errors
- ⏱️ **Request timeout** — 15s default timeout per request to prevent hanging
- 📝 **HTML preprocessing** — Auto-resolves lazy-loaded images (`data-src`) and extracts page titles
- ⚡ **Zero infrastructure** — No servers needed; deploy and go, pay per request

## Supported Formats

| Format | Extensions | MIME Types |
|--------|-----------|------------|
| PDF | `.pdf` | `application/pdf` |
| Images | `.jpeg` `.jpg` `.png` `.webp` `.svg` | `image/jpeg` `image/png` `image/webp` `image/svg+xml` |
| HTML | `.html` `.htm` | `text/html` |
| XML | `.xml` | `application/xml` |
| Microsoft Office | `.xlsx` `.xlsm` `.xlsb` `.xls` `.docx` | `application/vnd.openxmlformats-officedocument.*` |
| Legacy Word | `.doc` | `application/msword` (requires optional external converter) |
| OpenDocument | `.ods` `.odt` | `application/vnd.oasis.opendocument.*` |
| CSV | `.csv` | `text/csv` |
| Apple Numbers | `.numbers` | `application/vnd.apple.numbers` |

Notes:
- `.pdf` works with the standard `application/pdf` response and is also auto-detected from many `application/octet-stream` download endpoints.
- `.doc` is not in the native Cloudflare Workers AI `toMarkdown` support list, so Anything-MD can optionally pre-convert legacy Word files to `.docx` or HTML before sending them to `toMarkdown`.

## API Usage

### GET Request

Opening the root path with no params shows the tool page:

```
GET /
```

To call the API via GET, pass the key directly in the URL:

```
GET /?url=https://example.com&key=your-key
```

### POST Request

#### Convert from URL

```bash
curl -X POST https://anything-md.doocs.org/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-key>" \
  -d '{"url": "https://example.com"}'
```

#### Convert Direct Content

No URL required — pass the content directly:

```bash
# Convert HTML content
curl -X POST https://anything-md.doocs.org/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-key>" \
  -d '{
    "html": "<html><body><h1>Hello</h1><p>This is a test.</p></body></html>"
  }'

# Or use the content parameter with contentType
curl -X POST https://anything-md.doocs.org/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-key>" \
  -d '{
    "content": "<html><body><h1>Hello</h1></body></html>",
    "contentType": "text/html",
    "fileName": "my-page.html"
  }'
```

Parameters:
- Auth: `GET` requests must send a valid key via `?key=...`; `POST` requests must send a valid key via `X-API-Key`
- `html` / `content`: Content to convert (choose one)
- `contentType`: Content type, defaults to `text/html` (optional)
- `fileName`: Output filename, defaults to `content.html`; titles are auto-extracted from HTML (optional)

### Success Response

```json
{
  "success": true,
  "url": "https://example.com",
  "name": "page.html",
  "mimeType": "text/html",
  "tokens": 0,
  "markdown": "# Example Domain\n\nThis domain is for use in illustrative examples..."
}
```

### Error Response

```json
{
  "success": false,
  "error": "Failed to fetch URL: 404 Not Found"
}
```

> 📚 **More Examples**: Check out the [API Usage Examples](docs/api-examples_EN.md) for detailed use cases and examples in various programming languages.
>
> 🔐 **Key auth guide**: See the [auth guide](docs/token-auth.md) for `API_KEYS`, `?key=...`, and `X-API-Key`.
>
> 🧾 **Legacy `.doc` support**: See the [converter deployment guide](docs/doc-converter_EN.md) for the bundled companion service.

## Project Structure

```
src/
├── index.ts    # Worker entry — routing and toMarkdown conversion
├── config.ts   # Centralised config — reads all tuneable params from env vars
├── cors.ts     # CORS headers, JSON/error response helpers
├── document.ts # Document preparation — PDF sniffing, legacy .doc conversion, support probing
├── fetch.ts    # robustFetch — HTTP with retries, timeout, and back-off
├── html.ts     # HTML preprocessing — title extraction, lazy-image fix, escaping
└── r2.ts       # R2 image proxy — extract, rewrite, and upload WeChat images

services/
└── doc-converter/ # Companion converter service — LibreOffice-based legacy .doc preprocessing
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Cloudflare account](https://dash.cloudflare.com/sign-up)

### Local Development

```bash
# Clone the repo
git clone https://github.com/doocs/anything-md.git
cd anything-md

# Install dependencies
npm install

# Start the local dev server
npm run dev
```

The dev server runs at `http://localhost:8787` by default.

### Deploy

```bash
# Log in to Cloudflare (first time)
npx wrangler login

# Deploy to Workers
npm run deploy
```

### Other Commands

```bash
# Run tests
npm test

# Regenerate type definitions
npm run cf-typegen

# Deploy after verification
npm run deploy
```

## Configuration

All tuneable parameters are set via `vars` in `wrangler.jsonc`. After cloning, just edit the config and deploy to your own Workers.

For local development, copy `.dev.vars.example` to `.dev.vars` to override settings.

### Core Settings (wrangler.jsonc)

| Setting | Description | Default |
|---------|-------------|---------|
| `name` | Worker name, also the subdomain prefix | `anything-md` |
| `ai.binding` | Workers AI binding | `AI` |
| `r2_buckets[0].bucket_name` | R2 bucket name | `anything-md-images` |

### Environment Variables (vars)

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEYS` | Comma-separated keys allowed to call the API; when unset, the API returns 503 | — |
| `API_KEY_AUDIT_LOG` | Emit structured key-auth audit logs | `false` |
| `R2_PUBLIC_URL` | Public URL of your R2 bucket | — |
| `IMAGE_PROXY_HOSTS` | Allowed image host suffixes, comma-separated | `qpic.cn` |
| `IMAGE_TTL_HOURS` | Image cache TTL in R2 (hours) | `8` |
| `IMAGE_UPLOAD_CONCURRENCY` | Max parallel uploads per request | `5` |
| `FETCH_TIMEOUT_MS` | Per-request HTTP timeout (ms) | `15000` |
| `FETCH_MAX_ATTEMPTS` | Max HTTP retry attempts | `3` |
| `DOCUMENT_CONVERTER_URL` | Legacy `.doc` conversion service URL; without it, `.doc` returns 415 | — |
| `DOCUMENT_CONVERTER_TOKEN` | Bearer token for the converter (prefer storing as a secret) | — |
| `DOCUMENT_CONVERTER_TIMEOUT_MS` | Timeout for converter requests (ms) | `30000` |
| `CORS_ORIGIN` | CORS allowed origin, `*` for all | `*` |

### Deploy Your Own

```bash
# 1. Clone the repo
git clone https://github.com/doocs/anything-md.git
cd anything-md

# 2. Install dependencies
npm install

# 3. Log in to Cloudflare
npx wrangler login

# 4. Create an R2 bucket (name must match wrangler.jsonc)
npx wrangler r2 bucket create anything-md-images

# 5. Edit wrangler.jsonc
#    - name: your Worker name
#    - r2_buckets[0].bucket_name: your bucket name
#    - vars.R2_PUBLIC_URL: your R2 custom domain
#    - adjust other vars as needed

# 6. Deploy
npm run deploy
```


## License

[MIT](LICENSE)
