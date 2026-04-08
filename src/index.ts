/**
 * Anything-MD Worker
 *
 * Entry point for the Cloudflare Worker that converts any URL content
 * to Markdown via the Workers AI toMarkdown binding.
 *
 * API:
 *   GET  /?url=https://example.com&key=your-key
 *   POST / + X-API-Key: your-key { "url": "https://example.com" }
 *   POST / + X-API-Key: your-key { "content": "<html>...</html>", "contentType": "text/html", "fileName": "page.html" }
 *
 * Response: { success, url, name, mimeType, tokens, markdown }
 */

import { authorizeRequest, hasConfiguredApiKeys } from './auth';
import { apiKeyAuditLogEnabled, apiKeys, fetchMaxAttempts, fetchTimeout } from './config';
import { errorResponse, handlePreflight, htmlResponse, jsonResponse, textResponse } from './cors';
import { convertWithDocumentConverter, DocumentPreparationError, prepareMarkdownInput } from './document';
import { robustFetch } from './fetch';
import { extractTitle, extractWeChatContent, isWeChatArticle, preprocessHtml } from './html';
import { collectImageUrls, rewriteImageUrls, uploadImages } from './r2';
import { renderHomePage } from './ui';

/** Derive a filename from a URL path */
function getFileName(url: string): string {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (segment?.includes('.')) return segment;
    return segment || 'content';
  } catch {
    return 'content';
  }
}

/** Determine whether the content type is HTML */
function isHtmlContent(contentType: string): boolean {
  return contentType.includes('text/html') || contentType.includes('application/xhtml');
}

function isPdfContent(contentType: string): boolean {
  return contentType.includes('application/pdf');
}

async function convertToMarkdown(
  env: Env,
  body: ArrayBuffer,
  contentType: string,
  fileName: string,
): Promise<{ data: string; mimeType: string; name: string; tokens: number }> {
  const results = await env.AI.toMarkdown([
    {
      name: fileName,
      blob: new Blob([body], { type: contentType }),
    },
  ]);

  const conversion = results[0];
  if (!conversion) {
    throw new Error('Markdown conversion returned no result.');
  }

  if (conversion.format === 'error') {
    throw new Error(conversion.error);
  }

  return {
    data: conversion.data ?? '',
    mimeType: conversion.mimeType,
    name: conversion.name,
    tokens: conversion.tokens,
  };
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handlePreflight(env);
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(env, {
        success: true,
        status: 'ok',
        authConfigured: hasConfiguredApiKeys(env),
        keyAuthEnabled: apiKeys(env).length > 0,
        auditLogEnabled: apiKeyAuditLogEnabled(env),
      });
    }

    if (url.pathname !== '/') {
      return errorResponse(env, 'Not found.', 404);
    }

    const isHomePageRequest = request.method === 'GET' && !url.searchParams.has('url');
    if (isHomePageRequest) {
      return htmlResponse(
        env,
        renderHomePage({
          apiEndpoint: `${url.origin}/`,
          authConfigured: hasConfiguredApiKeys(env),
        }),
        200,
        { 'Cache-Control': 'no-store' },
      );
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return errorResponse(env, 'Method not allowed. Use GET or POST.', 405);
    }

    const auth = await authorizeRequest(request, env);
    if (!auth.ok) {
      return errorResponse(env, auth.message, auth.status);
    }

    // --- Parse request parameters ---
    let targetUrl: string | null = null;
    let directContent: string | null = null;
    let directContentType: string | null = null;
    let directFileName: string | null = null;
    let rawFormat = false;

    if (request.method === 'GET') {
      const params = url.searchParams;
      targetUrl = params.get('url');
      rawFormat = params.get('format') === 'raw';
    } else if (request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          url?: string;
          content?: string;
          html?: string;
          contentType?: string;
          fileName?: string;
          format?: string;
        };
        targetUrl = body.url ?? null;
        // Support both 'content' and 'html' for direct content
        directContent = body.content ?? body.html ?? null;
        directContentType = body.contentType ?? null;
        directFileName = body.fileName ?? null;
        rawFormat = body.format === 'raw';
      } catch {
        return errorResponse(
          env,
          'Invalid JSON body. Expected: { "url": "https://..." } or { "content": "...", "contentType": "text/html" }',
        );
      }
    }

    // No URL or content provided — return usage info
    if (!targetUrl && !directContent) {
      return jsonResponse(env, {
        success: true,
        message: 'Anything-MD API — Convert any URL or content to Markdown',
        auth: 'GET uses ?key=... and POST uses X-API-Key.',
        usage: {
          GET: '/?url=https://example.com&key=your-key',
          POST_URL: 'POST / + X-API-Key: your-key { "url": "https://example.com" }',
          POST_CONTENT:
            'POST / + X-API-Key: your-key { "content": "<html>...</html>", "contentType": "text/html", "fileName": "page.html" }',
          POST_HTML: 'POST / + X-API-Key: your-key { "html": "<html>...</html>" }',
        },
      });
    }

    // Validate URL format if URL is provided
    if (targetUrl) {
      try {
        new URL(targetUrl);
      } catch {
        return errorResponse(env, 'Invalid URL provided.');
      }
    }

    try {
      let body: ArrayBuffer;
      let contentType: string;
      let fileName: string;
      let fallbackReason: string | null = null;

      // Branch 1: Direct content provided
      if (directContent) {
        // Use provided contentType or default to text/html
        contentType = directContentType || 'text/html';
        fileName = directFileName || 'content.html';

        // For HTML content: extract title first, then process content
        if (isHtmlContent(contentType)) {
          // Step 1: Extract title from original HTML (before any processing)
          if (!directFileName) {
            const title = extractTitle(directContent, 'content');
            fileName = `${title}.html`;
          }

          // Step 2: Extract WeChat content if applicable
          let processedContent = directContent;
          if (isWeChatArticle(directContent)) {
            processedContent = extractWeChatContent(directContent);
          }

          // Step 3: Preprocess lazy-loaded images
          processedContent = preprocessHtml(processedContent);
          body = new TextEncoder().encode(processedContent).buffer as ArrayBuffer;
        } else {
          // Non-HTML content: encode directly
          body = new TextEncoder().encode(directContent).buffer as ArrayBuffer;
        }
      }
      // Branch 2: Fetch from URL
      else if (targetUrl) {
        const response = await robustFetch(targetUrl, {
          timeout: fetchTimeout(env),
          maxAttempts: fetchMaxAttempts(env),
        });

        if (!response.ok) {
          return errorResponse(env, `Failed to fetch URL: ${response.status} ${response.statusText}`, 502);
        }

        contentType = response.headers.get('content-type') || 'application/octet-stream';
        body = await response.arrayBuffer();
        fileName = getFileName(targetUrl);

        // For HTML content: extract title first, then process content
        if (isHtmlContent(contentType)) {
          const rawHtml = new TextDecoder().decode(body);

          // Step 1: Extract title from original HTML (before any processing)
          const title = extractTitle(rawHtml, fileName.replace(/\.html$/, ''));
          fileName = `${title}.html`;

          // Step 2: Extract WeChat content if applicable
          let processedHtml = rawHtml;
          if (isWeChatArticle(rawHtml)) {
            processedHtml = extractWeChatContent(rawHtml);
          }

          // Step 3: Preprocess lazy-loaded images
          processedHtml = preprocessHtml(processedHtml);
          body = new TextEncoder().encode(processedHtml).buffer as ArrayBuffer;
        }
      } else {
        return errorResponse(env, 'No URL or content provided.');
      }

      ({ body, contentType, fileName } = await prepareMarkdownInput({ body, contentType, fileName }, env));

      // Convert to Markdown via Workers AI
      let result: {
        data: string;
        mimeType: string;
        name: string;
        tokens: number;
      };

      try {
        result = await convertToMarkdown(env, body, contentType, fileName);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isPdfContent(contentType)) {
          return errorResponse(env, `Conversion failed: ${message}`, 422);
        }

        fallbackReason = message;
        const converted = await convertWithDocumentConverter({ body, contentType, fileName }, env, 'html');
        const fallbackResult = await convertToMarkdown(env, converted.body, converted.contentType, converted.fileName);
        result = {
          data: fallbackResult.data,
          mimeType: contentType,
          name: fileName,
          tokens: fallbackResult.tokens,
        };
      }

      let markdown = result.data ?? '';

      // Strip YAML frontmatter if present (generated by Workers AI toMarkdown)
      markdown = markdown.replace(/^---\n[\s\S]*?\n---\n*/, '');

      // Proxy WeChat images through R2 (if configured)
      const rawHtmlForImages = isHtmlContent(contentType) ? new TextDecoder().decode(body) : '';

      if (env.IMAGES_BUCKET && env.R2_PUBLIC_URL) {
        const imageUrls = collectImageUrls(rawHtmlForImages, markdown);
        if (imageUrls.length > 0) {
          markdown = rewriteImageUrls(markdown, imageUrls, env.R2_PUBLIC_URL, env);
          // Upload in the background — does not block the response
          ctx.waitUntil(uploadImages(imageUrls, env.IMAGES_BUCKET, env));
        }
      }

      // Return raw Markdown text or JSON envelope
      if (rawFormat) {
        return textResponse(env, markdown);
      }

      return jsonResponse(env, {
        success: true,
        url: targetUrl ?? undefined,
        name: result.name,
        mimeType: result.mimeType,
        tokens: result.tokens,
        fallback: fallbackReason
          ? {
              mode: 'pdf-html',
              reason: fallbackReason,
            }
          : undefined,
        markdown,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (err instanceof DocumentPreparationError) {
        return errorResponse(env, message, err.status);
      }

      return errorResponse(env, `Internal error: ${message}`, 500);
    }
  },
} satisfies ExportedHandler<Env>;
