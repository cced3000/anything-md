# Legacy `.doc` Converter

The main Anything-MD Worker already detects legacy `.doc` inputs, but converting old binary Word files still requires a companion converter service.

This repo now includes one:

- Path: `services/doc-converter`
- Stack: Node.js + Express + Multer + LibreOffice
- API: `POST /convert`

## What it does

The main Worker calls the converter when any of these are true:

- the URL filename ends with `.doc`
- the response `content-type` is `application/msword`
- the response is `application/octet-stream` but the file signature matches legacy Word OLE format

The converter transforms `.doc` into `.docx`, HTML, or PDF, and the main Worker then sends the converted output into Workers AI `toMarkdown`.

## Deploy

```bash
docker build -t anything-md-doc-converter ./services/doc-converter

docker run --rm -p 8090:8090 \
  -e CONVERTER_TOKEN=change-me \
  anything-md-doc-converter
```

Health check:

```bash
curl http://127.0.0.1:8090/health
```

## Configure the main Worker

Set these vars on Anything-MD:

```bash
DOCUMENT_CONVERTER_URL=https://doc.yekyos.com/convert
DOCUMENT_CONVERTER_TOKEN=change-me
DOCUMENT_CONVERTER_TIMEOUT_MS=30000
```

Recommended:

- store `DOCUMENT_CONVERTER_TOKEN` as a secret
- restrict converter access to the Worker or a trusted reverse proxy
- keep the default `targetFormat=docx` unless you explicitly want HTML or PDF output

## Deploy the converter on Dokploy

The converter is already split out as an independent service and can be deployed on its own.

Recommended setup:

1. Create a new Dokploy `Application`
2. Choose `Dockerfile` as the build type
3. Set the Docker context to `services/doc-converter`
4. Expose port `8090`
5. Configure:
   - `PORT=8090`
   - `CONVERTER_TOKEN=your-secret`
   - `MAX_UPLOAD_MB=32`
   - `SOFFICE_TIMEOUT_MS=120000`
6. Deploy and verify `/health`
7. Bind the domain `doc.yekyos.com`
8. Point the main Worker's `DOCUMENT_CONVERTER_URL` to `https://doc.yekyos.com/convert`

If you prefer Compose, you can also use:

- `services/doc-converter/docker-compose.yml`

Dokploy docs:

- https://docs.dokploy.com/docs/core/applications
- https://docs.dokploy.com/docs/core/variables

## Notes

- `PDF` is already supported directly by the main Worker and does not depend on this converter.
- The converter exists to bridge the current Cloudflare Workers AI gap for legacy `.doc`.
