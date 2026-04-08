import { apiKeyAuditLogEnabled, apiKeys } from './config';

export interface AuthorizationFailure {
  ok: false;
  status: 401 | 503;
  message: string;
}

export interface AuthorizationSuccess {
  ok: true;
  key: string;
  mode: 'query' | 'header';
  fingerprint: string;
}

export type AuthorizationResult = AuthorizationFailure | AuthorizationSuccess;

const encoder = new TextEncoder();

async function sha256Fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

async function logAuthEvent(
  env: Env,
  event: 'auth.accept' | 'auth.reject',
  request: Request,
  details: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  if (!apiKeyAuditLogEnabled(env)) return;

  const payload = {
    event,
    method: request.method,
    path: new URL(request.url).pathname,
    remoteIp: request.headers.get('CF-Connecting-IP'),
    timestamp: new Date().toISOString(),
    ...details,
  };

  console.log(JSON.stringify(payload));
}

async function reject(
  env: Env,
  request: Request,
  message: string,
  status: 401 | 503,
  details: Record<string, string | number | boolean | null | undefined> = {},
): Promise<AuthorizationFailure> {
  await logAuthEvent(env, 'auth.reject', request, details);
  return { ok: false, status, message };
}

async function accept(env: Env, request: Request, key: string, mode: 'query' | 'header'): Promise<AuthorizationSuccess> {
  const fingerprint = await sha256Fingerprint(key);
  await logAuthEvent(env, 'auth.accept', request, { fingerprint, mode });
  return {
    ok: true,
    key,
    mode,
    fingerprint,
  };
}

/** Whether the deployment has any valid API key configuration */
export function hasConfiguredApiKeys(env: Env): boolean {
  return apiKeys(env).length > 0;
}

/** Extract an API key from query string or request headers */
export function extractApiKey(request: Request): { key: string; mode: 'query' | 'header' } | null {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const queryKey = url.searchParams.get('key')?.trim();
    if (queryKey) {
      return { key: queryKey, mode: 'query' };
    }
    return null;
  }

  const headerKey = request.headers.get('X-API-Key')?.trim();
  if (headerKey) {
    return { key: headerKey, mode: 'header' };
  }

  return null;
}

/** Validate that the request carries an authorized API key */
export async function authorizeRequest(request: Request, env: Env): Promise<AuthorizationResult> {
  const configuredKeys = apiKeys(env);

  if (configuredKeys.length === 0) {
    return reject(env, request, 'API keys are not configured. Set API_KEYS before using the conversion API.', 503);
  }

  const incoming = extractApiKey(request);
  if (!incoming) {
    const message =
      request.method === 'GET'
        ? 'Unauthorized. GET requests must provide a valid key via ?key=...'
        : 'Unauthorized. POST requests must provide a valid key via X-API-Key.';
    return reject(env, request, message, 401);
  }

  if (!configuredKeys.includes(incoming.key)) {
    return reject(env, request, 'Unauthorized. The provided key is not in API_KEYS.', 401, { mode: incoming.mode });
  }

  return accept(env, request, incoming.key, incoming.mode);
}
