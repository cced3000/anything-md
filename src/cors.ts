/**
 * CORS utilities
 * Provides cross-origin response headers and preflight handling.
 */

import { corsOrigin } from './config';

/** Build CORS headers using the configured origin */
export function getCorsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': corsOrigin(env),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function buildHeaders(env: Env, contentType: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers({
    'Content-Type': contentType,
    ...getCorsHeaders(env),
  });

  if (extraHeaders) {
    const extras = new Headers(extraHeaders);
    extras.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

/** Build a JSON response with CORS headers */
export function jsonResponse(env: Env, data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: buildHeaders(env, 'application/json; charset=utf-8', extraHeaders),
  });
}

/** Build a plain-text response with CORS headers */
export function textResponse(env: Env, text: string, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(text, {
    status,
    headers: buildHeaders(env, 'text/markdown; charset=utf-8', extraHeaders),
  });
}

/** Build an HTML response with CORS headers */
export function htmlResponse(env: Env, html: string, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(html, {
    status,
    headers: buildHeaders(env, 'text/html; charset=utf-8', extraHeaders),
  });
}

/** Shorthand for an error JSON response */
export function errorResponse(env: Env, message: string, status = 400, extraHeaders?: HeadersInit): Response {
  return jsonResponse(env, { success: false, error: message }, status, extraHeaders);
}

/** Handle CORS preflight (OPTIONS) request */
export function handlePreflight(env: Env): Response {
  return new Response(null, { status: 204, headers: buildHeaders(env, 'text/plain; charset=utf-8') });
}
