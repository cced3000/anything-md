# Legacy `.doc` Converter

Anything-MD 主 Worker 已经内置了 legacy `.doc` 识别逻辑，但要真正转换老式 Word 二进制文件，仍然需要一个可调用的 converter 服务。

仓库中已经提供了一个配套实现：

- 路径：`services/doc-converter`
- 技术栈：Node.js + Express + Multer + LibreOffice
- 接口：`POST /convert`

## 作用

主 Worker 在检测到以下情况时会调用 converter：

- URL 文件名是 `.doc`
- `content-type` 是 `application/msword`
- 下载响应虽然是 `application/octet-stream`，但文件头符合 legacy Word OLE 格式

converter 会把 `.doc` 转为 `.docx`、HTML 或 PDF，然后主 Worker 再把转换结果交给 Workers AI `toMarkdown`。

## 本地 / 服务器部署

```bash
docker build -t anything-md-doc-converter ./services/doc-converter

docker run --rm -p 8090:8090 \
  -e CONVERTER_TOKEN=change-me \
  anything-md-doc-converter
```

健康检查：

```bash
curl http://127.0.0.1:8090/health
```

## 配置主 Worker

在 Anything-MD Worker 中配置：

```bash
DOCUMENT_CONVERTER_URL=https://doc.yekyos.com/convert
DOCUMENT_CONVERTER_TOKEN=change-me
DOCUMENT_CONVERTER_TIMEOUT_MS=30000
```

建议：

- `DOCUMENT_CONVERTER_TOKEN` 用 Wrangler secret 或部署平台 secret 管理
- converter 只开放给 Worker 所在网络或通过反向代理限制来源
- 如果只需要 `.doc -> .docx`，保持默认 `targetFormat=docx` 即可

## 在 Dokploy 上部署 converter

仓库里的 converter 已经是独立服务，可以直接单独部署。

推荐方式：

1. 在 Dokploy 新建一个 `Application`
2. Build Type 选择 `Dockerfile`
3. Docker Context 指向 `services/doc-converter`
4. 暴露端口 `8090`
5. 配置环境变量：
   - `PORT=8090`
   - `CONVERTER_TOKEN=你的密钥`
   - `MAX_UPLOAD_MB=32`
   - `SOFFICE_TIMEOUT_MS=120000`
6. 部署后先访问 `/health`
7. 将域名绑定为 `doc.yekyos.com`
8. 再把主 Worker 的 `DOCUMENT_CONVERTER_URL` 设为 `https://doc.yekyos.com/convert`

如果你更习惯 Compose，也可以直接使用：

- `services/doc-converter/docker-compose.yml`

Dokploy 文档：

- https://docs.dokploy.com/docs/core/applications
- https://docs.dokploy.com/docs/core/variables

## 说明

- `PDF` 已经由主 Worker 直接支持，不依赖这个 converter。
- 这个 converter 的主要目的，是补足 Cloudflare Workers AI 当前不原生支持的 legacy `.doc`。
