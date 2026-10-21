// A local stand-in for the PGYER API and the COS storage endpoint.
import http from 'node:http';

export const SIGNATURE = 'q-sign-algorithm=sha1&q-ak=AKIDfake&q-signature=SIGNATURE-SECRET';
export const SECURITY_TOKEN = 'SECURITY-TOKEN-SECRET';
export const BUILD_KEY = 'abcdef0123456789.apk';

export const BUILD_INFO = {
  buildKey: 'abcdef0123456789',
  buildType: '2',
  buildName: 'Demo <App>',
  buildVersion: '1.2.3',
  buildBuildVersion: '7',
  buildFileSize: '2048',
  buildShortcutUrl: 'demo',
  buildQRCodeURL: 'https://www.pgyer.com/app/qrcodeHistory/qr123',
};

/** Starts an HTTP server that records every request and answers with `handler(request, response)`. */
export async function startServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const request = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
    requests.push(request);
    try {
      await handler(request, res, req);
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

/** Returns a URL on which nothing listens. */
export async function closedServerUrl() {
  const server = await startServer(() => {});
  await server.close();
  return server.url;
}

export function sendJson(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Decodes a form-urlencoded body into a plain object. */
export function formOf(request) {
  return Object.fromEntries(new URLSearchParams(request.body.toString('utf8')));
}

/** Decodes a multipart/form-data body; returns { fields: [[name, value]], file }. */
export async function multipartOf(request) {
  const form = await new Response(request.body, {
    headers: { 'content-type': request.headers['content-type'] },
  }).formData();
  const fields = [];
  let file;
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      fields.push([name, value]);
    } else {
      file = { name: value.name, content: Buffer.from(await value.arrayBuffer()) };
      fields.push([name, file]);
    }
  }
  return { fields, file };
}

/**
 * A fake PGYER: getCOSToken hands out a token for `${url}/cos`, the upload answers `uploadStatus`, and buildInfo
 * answers each code in `buildInfoCodes` in turn (a function may answer instead), then code 0 with BUILD_INFO.
 */
export async function startPgyer({ tokenResponse, uploadStatus = 204, buildInfoCodes = [] } = {}) {
  const pending = [...buildInfoCodes];
  const pgyer = await startServer((request, res, req) => {
    const route = request.url.split('?')[0];
    if (route === '/apiv2/app/getCOSToken') {
      sendJson(
        res,
        tokenResponse ?? {
          code: 0,
          message: '',
          data: {
            key: BUILD_KEY,
            endpoint: `${pgyer.url}/cos`,
            params: { key: BUILD_KEY, signature: SIGNATURE, 'x-cos-security-token': SECURITY_TOKEN },
          },
        },
      );
    } else if (route === '/cos') {
      res.statusCode = uploadStatus;
      res.end(
        uploadStatus >= 300
          ? `<Error><Code>AccessDenied</Code><Message>Request has expired</Message><RequestId>req-1</RequestId><Signature>${SIGNATURE}</Signature></Error>`
          : '',
      );
    } else if (route === '/apiv2/app/buildInfo') {
      const next = pending.shift();
      if (typeof next === 'function') {
        next(res, req);
      } else if (next !== undefined) {
        sendJson(res, { code: next, message: 'processing' });
      } else {
        sendJson(res, { code: 0, message: '', data: BUILD_INFO });
      }
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  return pgyer;
}
