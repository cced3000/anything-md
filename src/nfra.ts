import { robustFetch } from './fetch';
import { escapeHtml } from './html';

interface NfraDocInfoResponse {
  data?: {
    attachmentInfoVOList?: Array<{
      title?: string | null;
      urlOtherName?: string | null;
    }>;
    docClob?: string | null;
    docSource?: string | null;
    docSubtitle?: string | null;
    docTitle?: string | null;
    publishDate?: string | null;
  } | null;
  rptCode?: number;
}

export interface SiteResolvedContent {
  body: ArrayBuffer;
  contentType: string;
  fileName: string;
}

function isNfraDetailUrl(url: URL): boolean {
  return url.hostname === 'www.nfra.gov.cn' && url.pathname === '/cn/view/pages/ItemDetail.html' && url.searchParams.has('docId');
}

function extractBodyHtml(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match?.[1] ?? html;
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function sanitizeAllowedAttributes(_tagName: string, rawAttributes: string): string {
  const allowed = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan']);
  const attrs: string[] = [];
  const attrRe = /([^\s=<>"'/]+)\s*=\s*(".*?"|'.*?'|[^\s"'=<>`]+)/g;

  for (const match of rawAttributes.matchAll(attrRe)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? '';
    if (!name || !allowed.has(name)) continue;
    attrs.push(`${name}=${value}`);
  }

  return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
}

function sanitizeTagAttributes(html: string): string {
  return html.replace(/<([a-z][\w-]*)(\s[^>]*?)?>/gi, (_full, tagName: string, rawAttributes?: string) => {
    if (!rawAttributes) return `<${tagName}>`;
    return `<${tagName}${sanitizeAllowedAttributes(tagName, rawAttributes)}>`;
  });
}

function unwrapPresentationalTags(html: string): string {
  return html
    .replace(/<\/?(?:span|font)\b[^>]*>/gi, '')
    .replace(/<o:p>\s*<\/o:p>/gi, '')
    .replace(/<\/?o:p\b[^>]*>/gi, '');
}

function removeRedundantBlocks(html: string): string {
  return html
    .replace(/<\?(?:xml|mso-[^?]+)[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<title\b[\s\S]*?<\/title>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<xml\b[\s\S]*?<\/xml>/gi, '')
    .replace(/<\/?(?:o|w|v|st1|shape|imagedata|line|group|textbox|path):[\w-]+\b[^>]*>/gi, '')
    .replace(/<\/?(?:colgroup|col|tbody)\b[^>]*>/gi, '');
}

function normalizeWhitespace(html: string): string {
  return html
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/>\s+</g, '><')
    .trim();
}

export function sanitizeNfraDocClob(docClob: string): string {
  let html = extractBodyHtml(docClob);
  html = stripHtmlComments(html);
  html = removeRedundantBlocks(html);
  html = unwrapPresentationalTags(html);
  html = sanitizeTagAttributes(html);
  html = normalizeWhitespace(html);
  return html;
}

function toHtmlDocument(
  title: string,
  bodyHtml: string,
  publishDate?: string | null,
  source?: string | null,
  attachments?: Array<{ title?: string | null; urlOtherName?: string | null }>,
): string {
  const attachmentList = (attachments ?? [])
    .filter((item) => item?.title && item?.urlOtherName)
    .map((item) => `<li><a href="${escapeHtml(item.urlOtherName ?? '')}">${escapeHtml(item.title ?? '')}</a></li>`)
    .join('');

  const meta: string[] = [];
  if (publishDate) meta.push(`<p>发布时间：${escapeHtml(publishDate)}</p>`);
  if (source) meta.push(`<p>来源：${escapeHtml(source)}</p>`);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    ${meta.join('\n')}
    <div id="wenzhang-content">
      ${bodyHtml}
    </div>
    ${attachmentList ? `<section><h2>附件信息</h2><ul>${attachmentList}</ul></section>` : ''}
  </article>
</body>
</html>`;
}

export async function resolveNfraContent(url: string): Promise<SiteResolvedContent | null> {
  const parsedUrl = new URL(url);
  if (!isNfraDetailUrl(parsedUrl)) return null;

  const docId = parsedUrl.searchParams.get('docId');
  if (!docId) return null;

  const apiUrl = `${parsedUrl.origin}/cbircweb/DocInfo/SelectByDocId?docId=${encodeURIComponent(docId)}`;
  const response = await robustFetch(apiUrl, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: url,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    throw new Error(`NFRA detail API failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as NfraDocInfoResponse;
  if (payload.rptCode !== 200 || !payload.data?.docClob) {
    throw new Error('NFRA detail API returned no docClob content.');
  }

  const title = payload.data.docTitle || payload.data.docSubtitle || `nfra-${docId}`;
  const cleanedDocClob = sanitizeNfraDocClob(payload.data.docClob);
  const html = toHtmlDocument(title, cleanedDocClob, payload.data.publishDate, payload.data.docSource, payload.data.attachmentInfoVOList);

  return {
    body: new TextEncoder().encode(html).buffer as ArrayBuffer,
    contentType: 'text/html; charset=utf-8',
    fileName: `${title}.html`,
  };
}
