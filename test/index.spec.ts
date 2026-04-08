import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

function createEnv(overrides: Partial<Env> = {}): Env {
  const toMarkdown = Object.assign(
    vi.fn(async (items: Array<{ name: string }>) => [
      {
        name: items[0]?.name ?? 'content.html',
        mimeType: 'text/html',
        tokens: 24,
        format: 'markdown',
        data: '# Converted\n\nHello from Anything-MD',
      },
    ]),
    {
      supported: vi.fn(async () => [
        { extension: 'html', mimeType: 'text/html' },
        { extension: 'pdf', mimeType: 'application/pdf' },
        { extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      ]),
    },
  );

  const ai = {
    toMarkdown,
  };

  const bucket = {
    head: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
  };

  return {
    AI: ai,
    IMAGES_BUCKET: bucket,
    API_KEYS: 'test-key',
    API_TOKENS: '',
    API_KEY_AUDIT_LOG: '',
    API_TOKEN_AUDIT_LOG: '',
    R2_PUBLIC_URL: '',
    IMAGE_PROXY_HOSTS: 'qpic.cn',
    IMAGE_TTL_HOURS: '8',
    IMAGE_UPLOAD_CONCURRENCY: '5',
    FETCH_TIMEOUT_MS: '15000',
    FETCH_MAX_ATTEMPTS: '3',
    CORS_ORIGIN: '*',
    ...overrides,
  } as unknown as Env;
}

describe('Anything-MD worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createContext(): ExecutionContext {
    return {
      passThroughOnException() {},
      waitUntil() {},
    } as ExecutionContext;
  }

  it('serves the homepage without auth', async () => {
    const request = new Request('https://example.com/');
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Anything-MD Workspace');
  });

  it('rejects unauthorized conversion requests', async () => {
    const request = new Request('https://example.com/?url=https://example.com');
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);
    const data = (await response.json()) as { error: string; success: boolean };

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('GET requests');
  });

  it('rejects post requests without x-api-key', async () => {
    const request = new Request('https://example.com/?key=test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: '<h1>Hello</h1>' }),
    });
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);
    const data = (await response.json()) as { error: string; success: boolean };

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('POST requests');
  });

  it('returns 503 when api keys are not configured', async () => {
    const request = new Request('https://example.com/?url=https://example.com&key=test-key');
    const ctx = createContext();
    const response = await worker.fetch(
      request,
      createEnv({
        API_KEYS: '',
        API_TOKENS: '',
      }),
      ctx,
    );
    const data = (await response.json()) as { error: string; success: boolean };

    expect(response.status).toBe(503);
    expect(data.error).toContain('API_KEYS');
  });

  it('converts a GET url request with a valid query key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('<html><head><title>Hello</title></head><body><h1>Hello</h1></body></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/article&key=test-key');
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);
    const data = (await response.json()) as {
      markdown: string;
      name: string;
      success: boolean;
      url: string;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toBe('https://target.example/article');
    expect(data.name).toBe('Hello.html');
    expect(data.markdown).toContain('# Converted');
  });

  it('converts direct content with a valid X-API-Key header', async () => {
    const request = new Request('https://example.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        html: '<html><head><title>Hello</title></head><body><h1>Hello</h1></body></html>',
      }),
    });
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);
    const data = (await response.json()) as {
      markdown: string;
      name: string;
      success: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.name).toBe('Hello.html');
    expect(data.markdown).toContain('# Converted');
  });

  it('returns raw markdown when format=raw is requested', async () => {
    const request = new Request('https://example.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        content: '<html><body><h1>Hello</h1></body></html>',
        contentType: 'text/html',
        format: 'raw',
      }),
    });
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(body).toContain('# Converted');
  });

  it('allows api key headers in preflight responses', async () => {
    const request = new Request('https://example.com/', { method: 'OPTIONS' });
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('X-API-Key');
    expect(response.headers.get('access-control-allow-headers')).not.toContain('Authorization');
  });

  it('converts legacy .doc files through the configured document converter', async () => {
    const legacyDoc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://converter.example/convert') {
          return new Response(docxBytes, {
            status: 200,
            headers: {
              'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
          });
        }

        return new Response(legacyDoc, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
          },
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/report.doc&key=test-key');
    const ctx = createContext();
    const env = createEnv({
      DOCUMENT_CONVERTER_URL: 'https://converter.example/convert',
      DOCUMENT_CONVERTER_TIMEOUT_MS: '10000',
    } as Partial<Env>);
    const response = await worker.fetch(request, env, ctx);
    const data = (await response.json()) as {
      markdown: string;
      name: string;
      success: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.name).toBe('report.docx');
    expect(data.markdown).toContain('# Converted');
    expect(env.AI.toMarkdown).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'report.docx',
      }),
    ]);
  });

  it('returns 415 for legacy .doc files when no converter is configured', async () => {
    const legacyDoc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(legacyDoc, {
          status: 200,
          headers: {
            'content-type': 'application/msword',
          },
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/report.doc&key=test-key');
    const ctx = createContext();
    const response = await worker.fetch(request, createEnv(), ctx);
    const data = (await response.json()) as { error: string; success: boolean };

    expect(response.status).toBe(415);
    expect(data.success).toBe(false);
    expect(data.error).toContain('DOCUMENT_CONVERTER_URL');
  });

  it('detects PDF downloads even when the server returns application/octet-stream', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
          },
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/download&key=test-key');
    const ctx = createContext();
    const env = createEnv();
    const response = await worker.fetch(request, env, ctx);
    const data = (await response.json()) as {
      markdown: string;
      name: string;
      success: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.name).toBe('download.pdf');
    expect(env.AI.toMarkdown).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'download.pdf',
      }),
    ]);
  });

  it('keeps legacy .xls files as xls when the server returns application/octet-stream', async () => {
    const legacyXls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(legacyXls, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
          },
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/table.xls&key=test-key');
    const ctx = createContext();
    const env = createEnv();
    const response = await worker.fetch(request, env, ctx);
    const data = (await response.json()) as {
      markdown: string;
      name: string;
      success: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.name).toBe('table.xls');
    expect(env.AI.toMarkdown).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'table.xls',
      }),
    ]);
  });

  it('routes .wps files through the document converter before markdown conversion', async () => {
    const legacyWps = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://converter.example/convert') {
          return new Response('<html><body><h1>Recovered WPS</h1><p>Converted from converter</p></body></html>', {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          });
        }

        return new Response(legacyWps, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
          },
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/file.wps&key=test-key');
    const ctx = createContext();
    const env = createEnv({
      DOCUMENT_CONVERTER_URL: 'https://converter.example/convert',
      DOCUMENT_CONVERTER_TIMEOUT_MS: '10000',
    } as Partial<Env>);
    const response = await worker.fetch(request, env, ctx);
    const data = (await response.json()) as {
      markdown: string;
      name: string;
      success: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.name).toBe('file.html');
    expect(data.markdown).toContain('# Converted');
    expect(env.AI.toMarkdown).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'file.html',
      }),
    ]);
  });

  it('falls back to converter-backed HTML extraction when Workers AI throws on a pdf', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const configuredEnv = createEnv({
      DOCUMENT_CONVERTER_URL: 'https://converter.example/convert',
      DOCUMENT_CONVERTER_TIMEOUT_MS: '10000',
    } as Partial<Env>);
    vi.mocked(configuredEnv.AI.toMarkdown).mockRejectedValueOnce(new Error('Unexpected end of JSON input'));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://converter.example/convert') {
          return new Response('<html><body><h1>Recovered</h1><p>Recovered PDF fallback</p></body></html>', {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          });
        }

        return new Response(pdfBytes, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
          },
        });
      }) as typeof fetch,
    );

    const request = new Request('https://example.com/?url=https://target.example/broken.pdf&key=test-key');
    const ctx = createContext();
    const response = await worker.fetch(request, configuredEnv, ctx);
    const data = (await response.json()) as {
      fallback?: { mode: string; reason: string };
      markdown: string;
      name: string;
      success: boolean;
      tokens: number;
    };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.name).toBe('broken.pdf');
    expect(data.tokens).toBe(24);
    expect(data.markdown).toContain('# Converted');
    expect(data.fallback).toEqual({
      mode: 'pdf-html',
      reason: 'Unexpected end of JSON input',
    });
    expect(configuredEnv.AI.toMarkdown).toHaveBeenCalledTimes(2);
  });
});
