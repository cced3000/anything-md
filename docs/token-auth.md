# Key Authentication

Anything-MD now uses a single simple auth model:

1. Configure one or more keys in `API_KEYS`
2. Send a matching key in the request

The root UI page `GET /` stays public. Real conversion calls to `GET /?url=...` and `POST /` require a valid key.
The method rules are fixed:

- `GET` uses `?key=...`
- `POST` uses `X-API-Key`

## 1. Configure Keys

Use any long random strings, separated by commas:

```env
API_KEYS=amd_prod_default_key,amd_prod_agent_key
API_KEY_AUDIT_LOG=true
```

`API_KEYS` is the source of truth. If it is empty, the API returns `503`.

## 2. GET Request

The simplest way is to put the key directly in the URL:

```text
GET /?url=https://example.com/article&key=amd_prod_default_key
```

Example:

```bash
curl "https://your-domain.example/?url=https://example.com/article&key=amd_prod_default_key"
```

## 3. POST Request

For `POST`, send the key in `X-API-Key`:

```bash
curl -X POST "https://your-domain.example/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: amd_prod_default_key" \
  -d '{
    "url": "https://example.com/article",
    "format": "raw"
  }'
```

Example with direct content:

```bash
curl -X POST "https://your-domain.example/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: amd_prod_default_key" \
  -d '{
    "content": "<html><body><h1>Hello</h1></body></html>",
    "contentType": "text/html"
  }'
```

## 4. Audit Logging

When `API_KEY_AUDIT_LOG=true`, the Worker logs structured auth events without exposing the raw key.

Logged fields include:

- `event`: `auth.accept` or `auth.reject`
- `mode`: `query` or `header`
- `fingerprint`: SHA-256 prefix of the presented key
- request path, method, timestamp, and `CF-Connecting-IP` when available
