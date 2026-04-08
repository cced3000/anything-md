import { documentConverterTimeout, documentConverterToken, documentConverterUrl } from './config';

export interface MarkdownInput {
  body: ArrayBuffer;
  contentType: string;
  fileName: string;
}

export class DocumentPreparationError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = 'DocumentPreparationError';
    this.status = status;
  }
}

type SupportedFormatsSnapshot = {
  extensions: Set<string>;
  mimeTypes: Set<string>;
};

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const LEGACY_DOC_MAGIC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const MIME_TO_EXTENSION: Record<string, string> = {
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/xml': 'xml',
  'application/xhtml+xml': 'html',
  'text/csv': 'csv',
  'text/html': 'html',
};

const EXTENSION_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXTENSION).map(([mimeType, extension]) => [extension, mimeType]),
);

const GENERIC_EXTENSIONS = new Set(['bin', 'download', 'file', 'tmp']);

let supportedFormatsPromise: Promise<SupportedFormatsSnapshot | null> | null = null;

function normalizeContentType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function extensionOf(fileName: string): string | null {
  const match = /\.([^.]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : null;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function ensureExtension(fileName: string, extension: string): string {
  const current = extensionOf(fileName);
  if (current === extension) return fileName;

  if (current && !GENERIC_EXTENSIONS.has(current)) {
    return `${stripExtension(fileName)}.${extension}`;
  }

  return `${fileName}.${extension}`.replace(/\.\./g, '.');
}

function hasMagic(body: ArrayBuffer, magic: Uint8Array): boolean {
  const bytes = new Uint8Array(body);
  if (bytes.byteLength < magic.byteLength) return false;
  for (let i = 0; i < magic.byteLength; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

function isLegacyDoc(input: MarkdownInput): boolean {
  const contentType = normalizeContentType(input.contentType);
  const extension = extensionOf(input.fileName);
  return contentType === 'application/msword' || extension === 'doc' || hasMagic(input.body, LEGACY_DOC_MAGIC);
}

function normalizeBinaryInput(input: MarkdownInput): MarkdownInput {
  let { body, contentType, fileName } = input;
  contentType = normalizeContentType(contentType);
  fileName = fileName || 'content';

  if (hasMagic(body, PDF_MAGIC)) {
    return {
      body,
      contentType: 'application/pdf',
      fileName: ensureExtension(fileName, 'pdf'),
    };
  }

  if (hasMagic(body, LEGACY_DOC_MAGIC)) {
    return {
      body,
      contentType: 'application/msword',
      fileName: ensureExtension(fileName, 'doc'),
    };
  }

  const currentExtension = extensionOf(fileName);
  if (contentType in MIME_TO_EXTENSION && (!currentExtension || GENERIC_EXTENSIONS.has(currentExtension))) {
    fileName = ensureExtension(fileName, MIME_TO_EXTENSION[contentType]);
  } else if (currentExtension && currentExtension in EXTENSION_TO_MIME && contentType === 'application/octet-stream') {
    contentType = EXTENSION_TO_MIME[currentExtension];
  }

  return { body, contentType, fileName };
}

async function getSupportedFormats(env: Env): Promise<SupportedFormatsSnapshot | null> {
  if (supportedFormatsPromise) return supportedFormatsPromise;

  supportedFormatsPromise = (async () => {
    try {
      if (typeof env.AI.toMarkdown.supported !== 'function') return null;

      const formats = await env.AI.toMarkdown.supported();
      return {
        extensions: new Set(formats.map((format) => format.extension.toLowerCase())),
        mimeTypes: new Set(formats.map((format) => normalizeContentType(format.mimeType))),
      };
    } catch (error) {
      console.log(`Failed to inspect toMarkdown supported formats: ${error}`);
      return null;
    }
  })();

  return supportedFormatsPromise;
}

function inferConvertedOutput(input: MarkdownInput, response: Response, body: ArrayBuffer): MarkdownInput {
  const responseContentType = normalizeContentType(
    response.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );

  if (hasMagic(body, PDF_MAGIC) || responseContentType === 'application/pdf') {
    return {
      body,
      contentType: 'application/pdf',
      fileName: ensureExtension(input.fileName, 'pdf'),
    };
  }

  if (responseContentType === 'text/html' || responseContentType === 'application/xhtml+xml') {
    return {
      body,
      contentType: 'text/html',
      fileName: ensureExtension(input.fileName, 'html'),
    };
  }

  return {
    body,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileName: ensureExtension(input.fileName, 'docx'),
  };
}

async function convertLegacyDoc(input: MarkdownInput, env: Env): Promise<MarkdownInput> {
  const converterUrl = documentConverterUrl(env);
  if (!converterUrl) {
    throw new DocumentPreparationError(
      'Legacy .doc files require DOCUMENT_CONVERTER_URL because Workers AI toMarkdown does not natively support application/msword.',
      415,
    );
  }

  const form = new FormData();
  form.set('file', new File([input.body], input.fileName, { type: input.contentType }));
  form.set('sourceFileName', input.fileName);
  form.set('sourceMimeType', input.contentType);
  form.set('targetFormat', 'docx');

  const headers = new Headers();
  const token = documentConverterToken(env);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(converterUrl, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(documentConverterTimeout(env)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DocumentPreparationError(`Document converter request failed: ${message}`, 502);
  }

  if (!response.ok) {
    throw new DocumentPreparationError(`Document converter failed: ${response.status} ${response.statusText}`, 502);
  }

  return inferConvertedOutput(input, response, await response.arrayBuffer());
}

export async function prepareMarkdownInput(input: MarkdownInput, env: Env): Promise<MarkdownInput> {
  const normalized = normalizeBinaryInput(input);
  if (!isLegacyDoc(normalized)) return normalized;

  const supportedFormats = await getSupportedFormats(env);
  if (supportedFormats && (supportedFormats.extensions.has('doc') || supportedFormats.mimeTypes.has('application/msword'))) {
    return normalized;
  }

  return convertLegacyDoc(normalized, env);
}
