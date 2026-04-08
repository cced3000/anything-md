/**
 * Centralised configuration
 *
 * All tuneable knobs that a deployer may want to change live here.
 * Values are read from `env` (wrangler.jsonc `vars`) at runtime so they
 * can be overridden per-environment without touching source code.
 *
 * Each helper falls back to a sensible default when the env var is absent.
 */

// ---------------------------------------------------------------------------
// API authentication
// ---------------------------------------------------------------------------

/** Allowed API keys (comma-separated in env) */
export function apiKeys(env: Env): string[] {
  const raw = String(env.API_KEYS ?? env.API_TOKENS ?? '');
  return raw
    ? raw
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
    : [];
}

/** Whether auth events should be logged without exposing raw keys */
export function apiKeyAuditLogEnabled(env: Env): boolean {
  const value = String(env.API_KEY_AUDIT_LOG ?? env.API_TOKEN_AUDIT_LOG ?? '')
    .trim()
    .toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

// ---------------------------------------------------------------------------
// Image proxy
// ---------------------------------------------------------------------------

/** Hostname suffixes allowed for image proxying (comma-separated in env) */
export function allowedImageHosts(env: Env): string[] {
  const raw = env.IMAGE_PROXY_HOSTS;
  return raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['qpic.cn'];
}

/** TTL for cached images in milliseconds */
export function imageTtlMs(env: Env): number {
  const hours = Number(env.IMAGE_TTL_HOURS) || 8;
  return hours * 60 * 60 * 1000;
}

/** Max parallel image uploads per request */
export function imageUploadConcurrency(env: Env): number {
  return Number(env.IMAGE_UPLOAD_CONCURRENCY) || 5;
}

/** Cache-Control max-age for R2 objects (seconds) */
export function imageCacheMaxAge(env: Env): number {
  const hours = Number(env.IMAGE_TTL_HOURS) || 8;
  return hours * 60 * 60;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Default fetch timeout in milliseconds */
export function fetchTimeout(env: Env): number {
  return Number(env.FETCH_TIMEOUT_MS) || 15_000;
}

/** Default max fetch attempts */
export function fetchMaxAttempts(env: Env): number {
  return Number(env.FETCH_MAX_ATTEMPTS) || 3;
}

// ---------------------------------------------------------------------------
// Optional document conversion
// ---------------------------------------------------------------------------

/** Optional converter endpoint for legacy formats that Workers AI does not support directly */
export function documentConverterUrl(env: Env): string {
  return String((env as Record<string, unknown>).DOCUMENT_CONVERTER_URL ?? '').trim();
}

/** Optional bearer token used when calling the document converter */
export function documentConverterToken(env: Env): string {
  return String((env as Record<string, unknown>).DOCUMENT_CONVERTER_TOKEN ?? '').trim();
}

/** Timeout for converter requests in milliseconds */
export function documentConverterTimeout(env: Env): number {
  const value = Number((env as Record<string, unknown>).DOCUMENT_CONVERTER_TIMEOUT_MS);
  return value || 30_000;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/** Allowed CORS origin (default: "*") */
export function corsOrigin(env: Env): string {
  return env.CORS_ORIGIN || '*';
}
