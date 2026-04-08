import { escapeHtml } from './html';

interface HomePageOptions {
  apiEndpoint: string;
  authConfigured: boolean;
}

/** Render the default tool page shown at the root URL */
export function renderHomePage({ apiEndpoint, authConfigured }: HomePageOptions): string {
  const endpoint = escapeHtml(apiEndpoint);
  const authStatus = authConfigured ? 'Auth enabled' : 'Auth required';
  const authDescription = authConfigured
    ? 'GET uses ?key=... and POST uses X-API-Key.'
    : 'Set API_KEYS before this deployment can convert content.';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Anything-MD Workspace</title>
  <meta
    name="description"
    content="Convert URLs and HTML into Markdown with a minimal Cloudflare Worker interface."
  />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

    :root {
      --bg: #f7f3ea;
      --panel: rgba(255, 252, 246, 0.82);
      --panel-strong: rgba(255, 255, 255, 0.94);
      --panel-dark: #0f1f25;
      --text: #16242a;
      --muted: #667378;
      --line: rgba(22, 36, 42, 0.12);
      --line-strong: rgba(22, 36, 42, 0.18);
      --accent: #0f766e;
      --accent-deep: #0a5b55;
      --accent-soft: rgba(15, 118, 110, 0.1);
      --signal: #cb6d33;
      --signal-soft: rgba(203, 109, 51, 0.12);
      --success: #166534;
      --error: #b42318;
      --shadow: 0 24px 60px rgba(22, 36, 42, 0.1);
      --radius-xl: 28px;
      --radius-lg: 18px;
      --radius-md: 14px;
    }

    * {
      box-sizing: border-box;
    }

    html {
      color-scheme: light;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 22rem),
        radial-gradient(circle at top right, rgba(203, 109, 51, 0.1), transparent 16rem),
        linear-gradient(180deg, #fffaf3 0%, var(--bg) 100%);
    }

    button,
    input,
    textarea,
    pre,
    code {
      font: inherit;
    }

    .page {
      width: min(780px, calc(100vw - 28px));
      margin: 0 auto;
      padding: 34px 0 56px;
    }

    .hero,
    .tool,
    .result {
      animation: rise 420ms ease-out;
    }

    .hero {
      display: grid;
      gap: 16px;
      margin-bottom: 22px;
      padding: 14px 0 10px;
    }

    .eyebrow,
    .status,
    .chip,
    .endpoint-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .eyebrow {
      color: var(--accent-deep);
      background: var(--accent-soft);
      font-family: 'IBM Plex Mono', monospace;
    }

    .status {
      color: #8b451a;
      background: rgba(247, 229, 216, 0.96);
      font-family: 'IBM Plex Mono', monospace;
    }

    h1 {
      margin: 0;
      max-width: 9ch;
      font-family: 'Fraunces', Georgia, serif;
      font-size: clamp(54px, 12vw, 88px);
      line-height: 0.9;
      letter-spacing: -0.05em;
    }

    .hero-copy {
      max-width: 50ch;
      margin: 0;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.78;
    }

    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      align-items: center;
      color: var(--muted);
      font-size: 14px;
    }

    .mono {
      font-family: 'IBM Plex Mono', monospace;
    }

    .endpoint {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: rgba(255, 255, 255, 0.58);
      color: var(--muted);
    }

    .endpoint-label {
      color: var(--signal);
      background: var(--signal-soft);
      font-family: 'IBM Plex Mono', monospace;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      background: var(--panel);
      backdrop-filter: blur(14px);
      box-shadow: var(--shadow);
    }

    .tool,
    .result {
      margin-top: 18px;
    }

    .panel-body {
      padding: 24px;
    }

    .panel-heading {
      margin-bottom: 18px;
    }

    .panel-heading h2,
    .panel-heading h3 {
      margin: 0 0 8px;
      font-family: 'Fraunces', Georgia, serif;
      font-size: clamp(28px, 6vw, 40px);
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .panel-heading p,
    .help,
    .footer {
      margin: 0;
      color: var(--muted);
      line-height: 1.72;
    }

    .stack,
    .field,
    .field-grid {
      display: grid;
      gap: 14px;
    }

    .field-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    label,
    legend {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
    }

    input,
    textarea {
      width: 100%;
      padding: 14px 16px;
      border: 1px solid rgba(22, 36, 42, 0.15);
      border-radius: var(--radius-md);
      background: var(--panel-strong);
      color: var(--text);
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }

    textarea {
      min-height: 220px;
      resize: vertical;
      line-height: 1.7;
    }

    input:focus-visible,
    textarea:focus-visible,
    button:focus-visible {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.15);
    }

    .tab-row {
      display: inline-flex;
      gap: 8px;
      width: fit-content;
      padding: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.74);
    }

    .toggle,
    .button,
    .copy-button {
      border: 0;
      cursor: pointer;
      transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }

    .toggle {
      border-radius: 999px;
      padding: 10px 14px;
      background: transparent;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .toggle.is-active {
      color: #fff;
      background: linear-gradient(135deg, var(--accent), var(--accent-deep));
      box-shadow: 0 10px 22px rgba(15, 118, 110, 0.18);
    }

    .button,
    .copy-button {
      border-radius: 999px;
      padding: 13px 18px;
      font-size: 14px;
      font-weight: 700;
    }

    .button {
      color: #fff;
      background: linear-gradient(135deg, var(--accent), var(--accent-deep));
      box-shadow: 0 16px 28px rgba(15, 118, 110, 0.2);
    }

    .copy-button {
      color: var(--text);
      background: rgba(255, 255, 255, 0.8);
      border: 1px solid var(--line);
    }

    .toggle:hover,
    .button:hover,
    .copy-button:hover {
      transform: translateY(-1px);
    }

    .button[disabled] {
      opacity: 0.72;
      cursor: wait;
      transform: none;
    }

    .hidden {
      display: none;
    }

    .format-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .format-option {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.74);
      cursor: pointer;
      font-size: 13px;
    }

    .format-option input {
      width: auto;
      margin: 0;
      accent-color: var(--accent);
    }

    .action-row,
    .result-top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .chip {
      color: var(--accent-deep);
      background: rgba(217, 242, 238, 0.94);
      font-family: 'IBM Plex Mono', monospace;
    }

    .chip.success {
      color: #fff;
      background: var(--success);
    }

    .chip.error {
      color: #fff;
      background: var(--error);
    }

    .preview {
      min-height: 320px;
      margin: 0;
      padding: 18px;
      overflow: auto;
      border-radius: var(--radius-lg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--panel-dark);
      color: #edf8f5;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .footer {
      margin-top: 16px;
      font-size: 13px;
    }

    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 720px) {
      .page {
        width: min(100vw - 18px, 720px);
      }

      .field-grid {
        grid-template-columns: 1fr;
      }

      h1 {
        max-width: none;
      }

      .action-row,
      .result-top {
        flex-direction: column;
        align-items: stretch;
      }

      .button,
      .copy-button {
        width: 100%;
        text-align: center;
      }

      .tab-row {
        width: 100%;
        justify-content: space-between;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <span class="eyebrow">.MD / SCRAPE</span>
      <h1>Convert pages into clean Markdown.</h1>
      <p class="hero-copy">把 URL、HTML 片段或原始内容转换成干净的 Markdown。页面保留极简结构，但视觉语言更接近开发者产品 landing page。</p>
      <div class="hero-meta">
        <span class="status">${escapeHtml(authStatus)}</span>
        <span>${escapeHtml(authDescription)}</span>
      </div>
      <div class="endpoint">
        <span class="endpoint-label">GET</span>
        <span class="mono">${endpoint}?url=https://example.com&amp;key=your-key</span>
      </div>
    </section>

    <section class="tool panel" id="workspace">
      <form class="panel-body stack" data-form>
        <div class="panel-heading">
          <h2>Workspace</h2>
          <p>选择输入方式，填入 key，执行一次转换。</p>
        </div>

        <div class="tab-row" role="tablist" aria-label="Input mode">
          <button class="toggle is-active" type="button" data-source-button="url">URL</button>
          <button class="toggle" type="button" data-source-button="content">Content</button>
        </div>

        <input type="hidden" name="source" value="url" />

        <div class="field">
          <label for="key">API Key</label>
          <input id="key" name="key" type="password" placeholder="Paste a key" autocomplete="off" />
        </div>

        <div class="field" data-url-group>
          <label for="url">Target URL</label>
          <input id="url" name="url" type="url" placeholder="https://example.com/article" />
        </div>

        <div class="stack hidden" data-content-group>
          <div class="field-grid">
            <div class="field">
              <label for="contentType">Content Type</label>
              <input id="contentType" name="contentType" type="text" value="text/html" />
            </div>
            <div class="field">
              <label for="fileName">File Name</label>
              <input id="fileName" name="fileName" type="text" placeholder="snippet.html" />
            </div>
          </div>

          <div class="field">
            <label for="content">Direct Content</label>
            <textarea id="content" name="content" placeholder="<html><body><h1>Hello</h1></body></html>"></textarea>
          </div>
        </div>

        <fieldset class="field">
          <legend>Format</legend>
          <div class="format-row">
            <label class="format-option"><input type="radio" name="format" value="json" checked /> JSON</label>
            <label class="format-option"><input type="radio" name="format" value="raw" /> Raw Markdown</label>
          </div>
        </fieldset>

        <div class="action-row">
          <button class="button" type="submit" data-submit>Convert to Markdown</button>
          <span class="help mono">POST + X-API-Key</span>
        </div>
      </form>
    </section>

    <section class="result panel hidden" data-result-panel>
      <div class="panel-body">
        <div class="panel-heading">
          <h3>Result</h3>
          <p>JSON 会自动格式化，raw 模式直接显示 Markdown。</p>
        </div>

        <div class="result-top">
          <span class="chip" data-status>Idle</span>
          <button class="copy-button" type="button" data-copy>Copy output</button>
        </div>

        <pre class="preview" data-output></pre>
        <p class="footer">公开访问首页没有问题，但真正的转换请求需要有效的 API key。</p>
      </div>
    </section>
  </main>

  <script>
    const apiEndpoint = ${JSON.stringify(apiEndpoint)};
    const authConfigured = ${JSON.stringify(authConfigured)};
    const storageKey = 'anything-md:key';

    const form = document.querySelector('[data-form]');
    const sourceInput = form.querySelector('input[name="source"]');
    const urlGroup = document.querySelector('[data-url-group]');
    const contentGroup = document.querySelector('[data-content-group]');
    const resultPanel = document.querySelector('[data-result-panel]');
    const output = document.querySelector('[data-output]');
    const status = document.querySelector('[data-status]');
    const submitButton = document.querySelector('[data-submit]');
    const copyButton = document.querySelector('[data-copy]');
    const keyInput = document.querySelector('#key');
    const urlInput = document.querySelector('#url');
    const contentInput = document.querySelector('#content');
    const contentTypeInput = document.querySelector('#contentType');
    const fileNameInput = document.querySelector('#fileName');

    keyInput.value = localStorage.getItem(storageKey) || '';

    function selectedFormat() {
      return form.querySelector('input[name="format"]:checked').value;
    }

    function selectedSource() {
      return sourceInput.value;
    }

    function showResultPanel() {
      resultPanel.classList.remove('hidden');
    }

    function setStatus(text, kind) {
      status.textContent = text;
      status.className = 'chip' + (kind ? ' ' + kind : '');
    }

    function setSource(source) {
      sourceInput.value = source;
      document.querySelectorAll('[data-source-button]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.sourceButton === source);
      });
      urlGroup.classList.toggle('hidden', source !== 'url');
      contentGroup.classList.toggle('hidden', source !== 'content');
    }

    function buildPayload() {
      const payload = {
        format: selectedFormat(),
      };

      if (selectedSource() === 'url') {
        payload.url = urlInput.value.trim();
        return payload;
      }

      payload.content = contentInput.value;
      if (contentTypeInput.value.trim()) payload.contentType = contentTypeInput.value.trim();
      if (fileNameInput.value.trim()) payload.fileName = fileNameInput.value.trim();
      return payload;
    }

    async function copyOutput() {
      if (!output.textContent) return;

      try {
        await navigator.clipboard.writeText(output.textContent);
        const previous = copyButton.textContent;
        copyButton.textContent = 'Copied';
        setTimeout(() => {
          copyButton.textContent = previous;
        }, 1200);
      } catch {
        setStatus('Copy blocked by browser', 'error');
      }
    }

    document.querySelectorAll('[data-source-button]').forEach((button) => {
      button.addEventListener('click', () => setSource(button.dataset.sourceButton));
    });

    keyInput.addEventListener('input', () => {
      localStorage.setItem(storageKey, keyInput.value.trim());
    });

    copyButton.addEventListener('click', copyOutput);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!authConfigured) {
        showResultPanel();
        setStatus('API_KEYS missing', 'error');
        output.textContent = 'This deployment is not ready yet. Set API_KEYS in wrangler.jsonc, .dev.vars, or Wrangler secrets.';
        return;
      }

      const payload = buildPayload();
      const key = keyInput.value.trim();
      localStorage.setItem(storageKey, key);

      showResultPanel();
      submitButton.disabled = true;
      submitButton.textContent = 'Converting...';
      setStatus('Request in flight', '');
      output.textContent = 'Waiting for Anything-MD to return a response...';

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { 'X-API-Key': key } : {}),
          },
          body: JSON.stringify(payload),
        });

        const raw = await response.text();
        const responseContentType = response.headers.get('content-type') || '';
        let rendered = raw;

        if (responseContentType.includes('application/json')) {
          try {
            rendered = JSON.stringify(JSON.parse(raw), null, 2);
          } catch {
            rendered = raw;
          }
        }

        output.textContent = rendered;
        setStatus(response.status + (response.ok ? ' OK' : ' Error'), response.ok ? 'success' : 'error');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.textContent = 'Request failed: ' + message;
        setStatus('Network error', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Convert to Markdown';
      }
    });

    setSource('url');
  </script>
</body>
</html>`;
}
