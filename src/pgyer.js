import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { isPlainAscii } from './inputs.js';

/** Tried in order; the later ones help when DNS for the main domain is blocked or hijacked. */
export const DEFAULT_API_SERVERS = ['https://www.pgyer.com', 'https://www.xcxwo.com', 'https://www.pgyerapp.com'];
export const WEB_SERVER = 'https://www.pgyer.com';

const CODE_SYNCING = 1246;
const CODE_PROCESSING = 1247;
const API_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 3_000;

const HINTS = {
  1001: 'Check that the API key is correct. You can find it at https://www.pgyer.com/account/api',
  1002: 'Check that the API key is correct. You can find it at https://www.pgyer.com/account/api',
  1003: 'Sub-accounts cannot use the API. Use the API key of the main account.',
  1019: 'Complete real-name verification before uploading: https://www.pgyer.com/account/certification',
  1020: 'Uploading is disabled for this account. Contact PGYER customer service.',
  1022: 'Your PGYER storage is full or the file is too large. Free up space or upgrade your plan.',
};

/** An error code returned by the PGYER API. */
export class PgyerApiError extends Error {
  constructor(code, serverMessage) {
    let message = `PGYER API error ${code}`;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      message += `: ${serverMessage.trim()}`;
    }
    if (HINTS[code]) {
      message += `\n${HINTS[code]}`;
    }
    super(message);
    this.code = code;
  }
}

/** The server could not be reached or did not answer with PGYER API JSON. */
export class NetworkError extends Error {}

/**
 * Uploads an app and waits until PGYER has published it. Returns the build information.
 *
 * `options` comes from readInputs(). `ctx` holds { userAgent, log, servers?, pollIntervalMs?, apiTimeoutMs? }.
 */
export async function uploadApp(options, form, ctx) {
  const token = await requestToken(form, ctx);
  await sendToStorage(token, options, ctx);
  ctx.log('[PGYER] Upload finished. Waiting for PGYER to process the build...');
  return waitForBuild(token.server, options.apiKey, token.key, options.processingTimeout * 1000, ctx);
}

export async function requestToken(form, ctx) {
  const servers = ctx.servers ?? DEFAULT_API_SERVERS;
  let lastFailure;
  for (const [index, server] of servers.entries()) {
    let json;
    try {
      json = await postForm(`${server}/apiv2/app/getCOSToken`, form, ctx);
    } catch (error) {
      if (!(error instanceof NetworkError)) {
        throw error;
      }
      lastFailure = error;
      const next = servers[index + 1];
      ctx.log(`[PGYER] ${server} is not reachable (${error.message})${next ? `, trying ${next}` : ''}.`);
      continue;
    }
    if (Number(json.code) !== 0) {
      throw new PgyerApiError(Number(json.code), json.message);
    }
    const data = json.data ?? {};
    const { params, endpoint, key } = data;
    if (!params || typeof params !== 'object' || typeof endpoint !== 'string' || !endpoint || !key) {
      throw new Error('PGYER returned an incomplete upload token. Please try again later.');
    }
    return { server, endpoint, key: String(key), params };
  }
  throw new Error(
    `None of the PGYER API servers could be reached: ${servers.join(', ')}. Last error: ${lastFailure?.message}`,
  );
}

export async function sendToStorage(token, options, ctx) {
  const filePath = options.appFilePath;
  const { size } = await stat(filePath);
  const boundary = `----PgyerAction${randomUUID().replaceAll('-', '')}`;

  const fields = {};
  for (const [name, value] of Object.entries(token.params)) {
    fields[name] = value == null ? '' : String(value);
  }
  let downloadName = path.basename(filePath);
  if (options.downloadFileName) {
    if (isPlainAscii(options.downloadFileName)) {
      downloadName = options.downloadFileName;
    } else {
      ctx.warn?.('downloadFileName is ignored because it contains characters other than plain ASCII.');
    }
  }
  if (isPlainAscii(downloadName)) {
    fields['x-cos-meta-file-name'] = downloadName;
  }

  let head = '';
  for (const [name, value] of Object.entries(fields)) {
    head += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  head +=
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${multipartFileName(filePath)}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n';
  const headBytes = Buffer.from(head, 'utf8');
  const tailBytes = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  ctx.log(`[PGYER] Uploading ${path.basename(filePath)} (${humanSize(size)})...`);
  async function* body() {
    yield headBytes;
    let sent = 0;
    let reported = 0;
    for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
      sent += chunk.length;
      const tenth = size === 0 ? 10 : Math.floor((sent * 10) / size);
      if (tenth > reported) {
        reported = tenth;
        ctx.log(`[PGYER] Uploaded ${tenth * 10}% (${humanSize(sent)})`);
      }
      yield chunk;
    }
    yield tailBytes;
  }

  let response;
  let text;
  try {
    response = await fetch(token.endpoint, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(headBytes.length + size + tailBytes.length),
        'user-agent': ctx.userAgent,
      },
      body: Readable.toWeb(Readable.from(body())),
      duplex: 'half',
      // With redirects allowed, fetch() clones the request and keeps every chunk of the body in memory.
      redirect: 'error',
    });
    text = await response.text();
  } catch (error) {
    throw new Error(`Uploading the file to storage failed: ${describeFailure(error)}`);
  }
  if (response.status < 200 || response.status > 299) {
    throw new Error(`Uploading the file to storage failed with HTTP ${response.status}${storageError(text)}`);
  }
}

export async function waitForBuild(server, apiKey, buildKey, timeoutMs, ctx) {
  const form = { _api_key: apiKey, buildKey };
  const deadline = Date.now() + timeoutMs;
  const pollInterval = ctx.pollIntervalMs ?? POLL_INTERVAL_MS;
  let reportedNetworkError = false;
  while (true) {
    let json;
    try {
      json = await postForm(`${server}/apiv2/app/buildInfo`, form, ctx);
    } catch (error) {
      if (!(error instanceof NetworkError)) {
        throw error;
      }
      // The file is already uploaded, so keep polling through short network problems.
      if (!reportedNetworkError) {
        ctx.log(`[PGYER] Checking the build status failed (${error.message}), retrying...`);
        reportedNetworkError = true;
      }
    }
    if (json) {
      const code = Number(json.code);
      if (code === 0) {
        if (!json.data || typeof json.data !== 'object') {
          throw new Error(`PGYER published the build but returned no build information. Build key: ${buildKey}`);
        }
        return json.data;
      }
      if (code !== CODE_SYNCING && code !== CODE_PROCESSING) {
        throw new PgyerApiError(code, json.message);
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `PGYER is still processing the build after ${Math.round(timeoutMs / 1000)} seconds. ` +
          `It may still be published; check your app list on PGYER. Build key: ${buildKey}`,
      );
    }
    await sleep(pollInterval);
  }
}

/** Posts a form to the PGYER API. Network failures and non-JSON answers throw NetworkError. */
async function postForm(url, form, ctx) {
  let response;
  let text;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': ctx.userAgent,
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(ctx.apiTimeoutMs ?? API_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    throw new NetworkError(describeFailure(error));
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // Usually a captive portal, a hijacked DNS record or a proxy error page.
    throw new NetworkError(`HTTP ${response.status} with a non-JSON response`);
  }
  if (!json || typeof json !== 'object' || !('code' in json)) {
    throw new NetworkError(`HTTP ${response.status} with an unexpected response`);
  }
  return json;
}

function describeFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'timed out';
  }
  const cause = error?.cause;
  if (cause) {
    return [cause.code, cause.message].filter(Boolean).join(' ') || String(cause);
  }
  return error?.message ?? String(error);
}

/** Picks the error code and message out of a COS XML error, without echoing anything else. */
function storageError(text) {
  const tag = (name) => text?.match(new RegExp(`<${name}>([^<]{0,200})</${name}>`))?.[1];
  const parts = [tag('Code'), tag('Message')].filter(Boolean);
  const requestId = tag('RequestId');
  let result = parts.length ? `: ${parts.join(': ')}` : '';
  if (requestId) {
    result += ` (request ID ${requestId})`;
  }
  return result;
}

function multipartFileName(filePath) {
  const name = path.basename(filePath);
  if (isPlainAscii(name) && !name.includes('"')) {
    return name;
  }
  return `upload${path.extname(name)}`;
}

export function humanSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Download links in the form PGYER shows them, from the build information. */
export function buildLinks(info) {
  const buildKey = info.buildKey ?? '';
  const shortcut = info.buildShortcutUrl ?? '';
  return {
    appPgyerURL: `${WEB_SERVER}/${shortcut || buildKey}`,
    appBuildURL: `${WEB_SERVER}/${buildKey}`,
  };
}
