import assert from 'node:assert/strict';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';
import { PgyerApiError, requestToken, sendToStorage, uploadApp, waitForBuild } from '../src/pgyer.js';
import {
  BUILD_INFO,
  BUILD_KEY,
  closedServerUrl,
  formOf,
  multipartOf,
  SECURITY_TOKEN,
  SIGNATURE,
  sendJson,
  startPgyer,
  startServer,
} from './support/fake-pgyer.js';

const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const APP_CONTENT = Buffer.from('PK\x03\x04 fake apk content '.repeat(1000));

let dir;
let appFile;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pgyer-action-test-'));
  appFile = path.join(dir, 'app-release.apk');
  await writeFile(appFile, APP_CONTENT);
});

function context(servers, extra = {}) {
  const logs = [];
  return {
    logs,
    servers,
    userAgent: 'pgyer-upload-app-action/test Node/test',
    log: (message) => logs.push(message),
    warn: (message) => logs.push(`warning: ${message}`),
    pollIntervalMs: 10,
    ...extra,
  };
}

function options(extra = {}) {
  return { apiKey: KEY, appFilePath: appFile, processingTimeout: 5, downloadFileName: '', ...extra };
}

const FORM = { _api_key: KEY, buildType: 'android' };

describe('upload', () => {
  let pgyer;
  after(() => pgyer?.close());

  test('sends the token form, uploads the file with every returned field, and returns the build info', async () => {
    pgyer = await startPgyer();
    const ctx = context([pgyer.url]);
    const info = await uploadApp(options(), { ...FORM, buildUpdateDescription: 'notes' }, ctx);
    assert.deepEqual(info, BUILD_INFO);

    const [tokenRequest, uploadRequest, infoRequest] = pgyer.requests;
    assert.equal(tokenRequest.url, '/apiv2/app/getCOSToken');
    assert.equal(tokenRequest.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(tokenRequest.headers['user-agent'], 'pgyer-upload-app-action/test Node/test');
    assert.deepEqual(formOf(tokenRequest), { ...FORM, buildUpdateDescription: 'notes' });

    assert.equal(uploadRequest.url, '/cos');
    assert.equal(uploadRequest.headers['user-agent'], 'pgyer-upload-app-action/test Node/test');
    assert.equal(uploadRequest.headers['transfer-encoding'], undefined);
    assert.equal(Number(uploadRequest.headers['content-length']), uploadRequest.body.length);
    const { fields, file } = await multipartOf(uploadRequest);
    assert.deepEqual(
      fields.map(([name]) => name),
      ['key', 'signature', 'x-cos-security-token', 'x-cos-meta-file-name', 'file'],
      'the file must be the last field',
    );
    assert.deepEqual(Object.fromEntries(fields.slice(0, 4)), {
      key: BUILD_KEY,
      signature: SIGNATURE,
      'x-cos-security-token': SECURITY_TOKEN,
      'x-cos-meta-file-name': 'app-release.apk',
    });
    assert.equal(file.name, 'app-release.apk');
    assert.deepEqual(file.content, APP_CONTENT);

    assert.equal(infoRequest.url, '/apiv2/app/buildInfo');
    assert.deepEqual(formOf(infoRequest), { _api_key: KEY, buildKey: BUILD_KEY });

    const log = ctx.logs.join('\n');
    assert.match(log, /Uploading app-release\.apk \(\d+\.\d KB\)/);
    assert.match(log, /Uploaded 100%/);
    for (const secret of [KEY, SIGNATURE, SECURITY_TOKEN]) {
      assert.equal(log.includes(secret), false, 'no secrets in the log');
    }
    await pgyer.close();
  });

  test('the download file name option replaces the file name', async () => {
    pgyer = await startPgyer();
    await uploadApp(options({ downloadFileName: 'MyApp-1.2.3.apk' }), FORM, context([pgyer.url]));
    const { fields } = await multipartOf(pgyer.requests[1]);
    assert.equal(Object.fromEntries(fields)['x-cos-meta-file-name'], 'MyApp-1.2.3.apk');
    await pgyer.close();
  });

  test('a file name that is not plain ASCII is not sent as the download name', async () => {
    pgyer = await startPgyer();
    const unicodeFile = path.join(dir, '演示.apk');
    await writeFile(unicodeFile, APP_CONTENT);
    const ctx = context([pgyer.url]);
    await uploadApp(options({ appFilePath: unicodeFile }), FORM, ctx);
    let { fields, file } = await multipartOf(pgyer.requests[1]);
    assert.equal('x-cos-meta-file-name' in Object.fromEntries(fields), false);
    assert.equal(file.name, 'upload.apk');

    await uploadApp(options({ downloadFileName: '演示.apk' }), FORM, ctx);
    ({ fields } = await multipartOf(pgyer.requests[4]));
    assert.equal(Object.fromEntries(fields)['x-cos-meta-file-name'], 'app-release.apk');
    assert.match(ctx.logs.join('\n'), /warning: downloadFileName is ignored/);
    await pgyer.close();
  });

  test('any 2xx answer from storage is a success', async () => {
    for (const status of [200, 201, 204]) {
      pgyer = await startPgyer({ uploadStatus: status });
      assert.deepEqual(await uploadApp(options(), FORM, context([pgyer.url])), BUILD_INFO);
      await pgyer.close();
    }
  });

  test('streams the file without keeping it in memory', async () => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc');
    const size = 64 * 1024 * 1024;
    const bigFile = path.join(dir, 'big.apk');
    const handle = await open(bigFile, 'w');
    await handle.truncate(size);
    await handle.close();

    // A slow receiver that throws the data away, so only the uploader's own buffers count.
    let received = 0;
    const sink = http.createServer((req, res) => {
      req.on('data', (chunk) => {
        received += chunk.length;
        req.pause();
        setTimeout(() => req.resume(), 1);
      });
      req.on('end', () => {
        res.statusCode = 204;
        res.end();
      });
    });
    await new Promise((resolve) => sink.listen(0, '127.0.0.1', resolve));
    let retained = 0;
    const sampler = setInterval(() => {
      gc();
      retained = Math.max(retained, process.memoryUsage().arrayBuffers);
    }, 100);
    try {
      const token = { endpoint: `http://127.0.0.1:${sink.address().port}/cos`, params: { key: BUILD_KEY } };
      await sendToStorage(token, options({ appFilePath: bigFile }), context([]));
    } finally {
      clearInterval(sampler);
      sink.close();
      await rm(bigFile);
    }
    assert.ok(received > size);
    assert.ok(retained < size / 3, `kept ${Math.round(retained / 1048576)} MB in memory`);
  });

  test('a storage error fails with its code but without echoing the response', async () => {
    pgyer = await startPgyer({ uploadStatus: 403 });
    await assert.rejects(uploadApp(options(), FORM, context([pgyer.url])), (error) => {
      assert.match(error.message, /HTTP 403: AccessDenied: Request has expired \(request ID req-1\)/);
      assert.equal(error.message.includes(SIGNATURE), false);
      return true;
    });
    assert.equal(pgyer.requests.length, 2, 'no buildInfo request after a failed upload');
  });
});

describe('server fallback', () => {
  test('tries the next server when one is unreachable or does not answer with JSON', async () => {
    const down = await closedServerUrl();
    const portal = await startServer((request, res) => {
      res.setHeader('content-type', 'text/html');
      res.end('<html>captive portal</html>');
    });
    const pgyer = await startPgyer();
    try {
      const ctx = context([down, portal.url, pgyer.url]);
      const token = await requestToken(FORM, ctx);
      assert.equal(token.server, pgyer.url);
      assert.equal(portal.requests.length, 1);
      assert.match(ctx.logs[0], new RegExp(`${down} is not reachable .*trying ${portal.url}`));
      assert.match(ctx.logs[1], /non-JSON response/);
    } finally {
      await portal.close();
      await pgyer.close();
    }
  });

  test('an API timeout counts as unreachable', async () => {
    const slow = await startServer(async (request, res) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      sendJson(res, { code: 0 });
    });
    const pgyer = await startPgyer();
    try {
      const ctx = context([slow.url, pgyer.url], { apiTimeoutMs: 100 });
      assert.equal((await requestToken(FORM, ctx)).server, pgyer.url);
      assert.match(ctx.logs[0], /timed out/);
    } finally {
      await slow.close();
      await pgyer.close();
    }
  });

  test('a PGYER error stops at once and adds a hint', async () => {
    const pgyer = await startPgyer({ tokenResponse: { code: 1001, message: 'API Key 错误' } });
    const backup = await startPgyer();
    try {
      await assert.rejects(requestToken(FORM, context([pgyer.url, backup.url])), (error) => {
        assert.ok(error instanceof PgyerApiError);
        assert.equal(error.code, 1001);
        assert.equal(
          error.message,
          'PGYER API error 1001: API Key 错误\nCheck that the API key is correct. You can find it at https://www.pgyer.com/account/api',
        );
        return true;
      });
      assert.equal(backup.requests.length, 0);
    } finally {
      await pgyer.close();
      await backup.close();
    }
  });

  test('every error code with a hint gets it', async () => {
    const hints = {
      1002: /API key is correct/,
      1003: /Sub-accounts cannot use the API/,
      1019: /real-name verification/,
      1020: /Uploading is disabled/,
      1022: /storage is full/,
    };
    for (const [code, hint] of Object.entries(hints)) {
      assert.match(new PgyerApiError(Number(code), 'x').message, hint);
    }
    assert.equal(new PgyerApiError(1234, 'Other').message, 'PGYER API error 1234: Other');
  });

  test('fails when no server can be reached', async () => {
    const down = await closedServerUrl();
    await assert.rejects(requestToken(FORM, context([down])), /None of the PGYER API servers could be reached/);
  });

  test('an incomplete token fails without printing it', async () => {
    const pgyer = await startPgyer({ tokenResponse: { code: 0, data: { params: { signature: SIGNATURE } } } });
    try {
      await assert.rejects(requestToken(FORM, context([pgyer.url])), (error) => {
        assert.match(error.message, /incomplete upload token/);
        assert.equal(error.message.includes(SIGNATURE), false);
        return true;
      });
    } finally {
      await pgyer.close();
    }
  });
});

describe('waiting for the build', () => {
  test('polls while PGYER is processing, then returns the build info', async () => {
    const pgyer = await startPgyer({ buildInfoCodes: [1246, 1247, 1247] });
    try {
      const info = await waitForBuild(pgyer.url, KEY, BUILD_KEY, 5000, context([pgyer.url]));
      assert.deepEqual(info, BUILD_INFO);
      assert.equal(pgyer.requests.length, 4);
    } finally {
      await pgyer.close();
    }
  });

  test('times out with the build key and a note that it may still be published', async () => {
    const pgyer = await startPgyer({ buildInfoCodes: Array(1000).fill(1247) });
    try {
      await assert.rejects(
        waitForBuild(pgyer.url, KEY, BUILD_KEY, 200, context([pgyer.url])),
        /still processing the build after 0 seconds\. It may still be published.*Build key: abcdef0123456789\.apk/,
      );
    } finally {
      await pgyer.close();
    }
  });

  test('retries network errors and non-JSON answers until the deadline', async () => {
    const drop = (res, req) => req.socket.destroy();
    const html = (res) => res.end('<html>502 Bad Gateway</html>');
    const pgyer = await startPgyer({ buildInfoCodes: [drop, html, drop, 1247] });
    try {
      const ctx = context([pgyer.url]);
      assert.deepEqual(await waitForBuild(pgyer.url, KEY, BUILD_KEY, 5000, ctx), BUILD_INFO);
      assert.equal(ctx.logs.filter((line) => /Checking the build status failed/.test(line)).length, 1);
    } finally {
      await pgyer.close();
    }
  });

  test('gives up on network errors at the deadline', async () => {
    const down = await closedServerUrl();
    await assert.rejects(waitForBuild(down, KEY, BUILD_KEY, 100, context([down])), /may still be published/);
  });

  test('other codes are errors', async () => {
    const pgyer = await startPgyer({ buildInfoCodes: [1247, 1216] });
    try {
      await assert.rejects(
        waitForBuild(pgyer.url, KEY, BUILD_KEY, 5000, context([pgyer.url])),
        (error) => error instanceof PgyerApiError && error.code === 1216,
      );
    } finally {
      await pgyer.close();
    }
  });
});
