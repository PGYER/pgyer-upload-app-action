import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// src/main.js
import { stat as stat3 } from "node:fs/promises";
import path3 from "node:path";

// node_modules/@actions/core/lib/command.js
import * as os from "os";

// node_modules/@actions/core/lib/utils.js
function toCommandValue(input) {
  if (input === null || input === void 0) {
    return "";
  } else if (typeof input === "string" || input instanceof String) {
    return input;
  }
  return JSON.stringify(input);
}
function toCommandProperties(annotationProperties) {
  if (!Object.keys(annotationProperties).length) {
    return {};
  }
  return {
    title: annotationProperties.title,
    file: annotationProperties.file,
    line: annotationProperties.startLine,
    endLine: annotationProperties.endLine,
    col: annotationProperties.startColumn,
    endColumn: annotationProperties.endColumn
  };
}

// node_modules/@actions/core/lib/command.js
function issueCommand(command, properties, message) {
  const cmd = new Command(command, properties, message);
  process.stdout.write(cmd.toString() + os.EOL);
}
var CMD_STRING = "::";
var Command = class {
  constructor(command, properties, message) {
    if (!command) {
      command = "missing.command";
    }
    this.command = command;
    this.properties = properties;
    this.message = message;
  }
  toString() {
    let cmdStr = CMD_STRING + this.command;
    if (this.properties && Object.keys(this.properties).length > 0) {
      cmdStr += " ";
      let first = true;
      for (const key in this.properties) {
        if (this.properties.hasOwnProperty(key)) {
          const val = this.properties[key];
          if (val) {
            if (first) {
              first = false;
            } else {
              cmdStr += ",";
            }
            cmdStr += `${key}=${escapeProperty(val)}`;
          }
        }
      }
    }
    cmdStr += `${CMD_STRING}${escapeData(this.message)}`;
    return cmdStr;
  }
};
function escapeData(s) {
  return toCommandValue(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(s) {
  return toCommandValue(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
}

// node_modules/@actions/core/lib/file-command.js
import * as crypto from "crypto";
import * as fs from "fs";
import * as os2 from "os";
function issueFileCommand(command, message) {
  const filePath = process.env[`GITHUB_${command}`];
  if (!filePath) {
    throw new Error(`Unable to find environment variable for file command ${command}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file at path: ${filePath}`);
  }
  fs.appendFileSync(filePath, `${toCommandValue(message)}${os2.EOL}`, {
    encoding: "utf8"
  });
}
function prepareKeyValueMessage(key, value) {
  const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
  const convertedValue = toCommandValue(value);
  if (key.includes(delimiter)) {
    throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
  }
  if (convertedValue.includes(delimiter)) {
    throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
  }
  return `${key}<<${delimiter}${os2.EOL}${convertedValue}${os2.EOL}${delimiter}`;
}

// node_modules/@actions/core/lib/core.js
import * as os4 from "os";

// node_modules/@actions/core/lib/summary.js
import { EOL as EOL3 } from "os";
import { constants, promises } from "fs";
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var { access, appendFile, writeFile } = promises;
var SUMMARY_ENV_VAR = "GITHUB_STEP_SUMMARY";
var Summary = class {
  constructor() {
    this._buffer = "";
  }
  /**
   * Finds the summary file path from the environment, rejects if env var is not found or file does not exist
   * Also checks r/w permissions.
   *
   * @returns step summary file path
   */
  filePath() {
    return __awaiter(this, void 0, void 0, function* () {
      if (this._filePath) {
        return this._filePath;
      }
      const pathFromEnv = process.env[SUMMARY_ENV_VAR];
      if (!pathFromEnv) {
        throw new Error(`Unable to find environment variable for $${SUMMARY_ENV_VAR}. Check if your runtime environment supports job summaries.`);
      }
      try {
        yield access(pathFromEnv, constants.R_OK | constants.W_OK);
      } catch (_a) {
        throw new Error(`Unable to access summary file: '${pathFromEnv}'. Check if the file has correct read/write permissions.`);
      }
      this._filePath = pathFromEnv;
      return this._filePath;
    });
  }
  /**
   * Wraps content in an HTML tag, adding any HTML attributes
   *
   * @param {string} tag HTML tag to wrap
   * @param {string | null} content content within the tag
   * @param {[attribute: string]: string} attrs key-value list of HTML attributes to add
   *
   * @returns {string} content wrapped in HTML element
   */
  wrap(tag, content, attrs = {}) {
    const htmlAttrs = Object.entries(attrs).map(([key, value]) => ` ${key}="${value}"`).join("");
    if (!content) {
      return `<${tag}${htmlAttrs}>`;
    }
    return `<${tag}${htmlAttrs}>${content}</${tag}>`;
  }
  /**
   * Writes text in the buffer to the summary buffer file and empties buffer. Will append by default.
   *
   * @param {SummaryWriteOptions} [options] (optional) options for write operation
   *
   * @returns {Promise<Summary>} summary instance
   */
  write(options) {
    return __awaiter(this, void 0, void 0, function* () {
      const overwrite = !!(options === null || options === void 0 ? void 0 : options.overwrite);
      const filePath = yield this.filePath();
      const writeFunc = overwrite ? writeFile : appendFile;
      yield writeFunc(filePath, this._buffer, { encoding: "utf8" });
      return this.emptyBuffer();
    });
  }
  /**
   * Clears the summary buffer and wipes the summary file
   *
   * @returns {Summary} summary instance
   */
  clear() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.emptyBuffer().write({ overwrite: true });
    });
  }
  /**
   * Returns the current summary buffer as a string
   *
   * @returns {string} string of summary buffer
   */
  stringify() {
    return this._buffer;
  }
  /**
   * If the summary buffer is empty
   *
   * @returns {boolen} true if the buffer is empty
   */
  isEmptyBuffer() {
    return this._buffer.length === 0;
  }
  /**
   * Resets the summary buffer without writing to summary file
   *
   * @returns {Summary} summary instance
   */
  emptyBuffer() {
    this._buffer = "";
    return this;
  }
  /**
   * Adds raw text to the summary buffer
   *
   * @param {string} text content to add
   * @param {boolean} [addEOL=false] (optional) append an EOL to the raw text (default: false)
   *
   * @returns {Summary} summary instance
   */
  addRaw(text, addEOL = false) {
    this._buffer += text;
    return addEOL ? this.addEOL() : this;
  }
  /**
   * Adds the operating system-specific end-of-line marker to the buffer
   *
   * @returns {Summary} summary instance
   */
  addEOL() {
    return this.addRaw(EOL3);
  }
  /**
   * Adds an HTML codeblock to the summary buffer
   *
   * @param {string} code content to render within fenced code block
   * @param {string} lang (optional) language to syntax highlight code
   *
   * @returns {Summary} summary instance
   */
  addCodeBlock(code, lang) {
    const attrs = Object.assign({}, lang && { lang });
    const element = this.wrap("pre", this.wrap("code", code), attrs);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML list to the summary buffer
   *
   * @param {string[]} items list of items to render
   * @param {boolean} [ordered=false] (optional) if the rendered list should be ordered or not (default: false)
   *
   * @returns {Summary} summary instance
   */
  addList(items, ordered = false) {
    const tag = ordered ? "ol" : "ul";
    const listItems = items.map((item) => this.wrap("li", item)).join("");
    const element = this.wrap(tag, listItems);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML table to the summary buffer
   *
   * @param {SummaryTableCell[]} rows table rows
   *
   * @returns {Summary} summary instance
   */
  addTable(rows) {
    const tableBody = rows.map((row) => {
      const cells = row.map((cell) => {
        if (typeof cell === "string") {
          return this.wrap("td", cell);
        }
        const { header, data, colspan, rowspan } = cell;
        const tag = header ? "th" : "td";
        const attrs = Object.assign(Object.assign({}, colspan && { colspan }), rowspan && { rowspan });
        return this.wrap(tag, data, attrs);
      }).join("");
      return this.wrap("tr", cells);
    }).join("");
    const element = this.wrap("table", tableBody);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds a collapsable HTML details element to the summary buffer
   *
   * @param {string} label text for the closed state
   * @param {string} content collapsable content
   *
   * @returns {Summary} summary instance
   */
  addDetails(label, content) {
    const element = this.wrap("details", this.wrap("summary", label) + content);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML image tag to the summary buffer
   *
   * @param {string} src path to the image you to embed
   * @param {string} alt text description of the image
   * @param {SummaryImageOptions} options (optional) addition image attributes
   *
   * @returns {Summary} summary instance
   */
  addImage(src, alt, options) {
    const { width, height } = options || {};
    const attrs = Object.assign(Object.assign({}, width && { width }), height && { height });
    const element = this.wrap("img", null, Object.assign({ src, alt }, attrs));
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML section heading element
   *
   * @param {string} text heading text
   * @param {number | string} [level=1] (optional) the heading level, default: 1
   *
   * @returns {Summary} summary instance
   */
  addHeading(text, level) {
    const tag = `h${level}`;
    const allowedTag = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ? tag : "h1";
    const element = this.wrap(allowedTag, text);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML thematic break (<hr>) to the summary buffer
   *
   * @returns {Summary} summary instance
   */
  addSeparator() {
    const element = this.wrap("hr", null);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML line break (<br>) to the summary buffer
   *
   * @returns {Summary} summary instance
   */
  addBreak() {
    const element = this.wrap("br", null);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML blockquote to the summary buffer
   *
   * @param {string} text quote text
   * @param {string} cite (optional) citation url
   *
   * @returns {Summary} summary instance
   */
  addQuote(text, cite) {
    const attrs = Object.assign({}, cite && { cite });
    const element = this.wrap("blockquote", text, attrs);
    return this.addRaw(element).addEOL();
  }
  /**
   * Adds an HTML anchor tag to the summary buffer
   *
   * @param {string} text link text/content
   * @param {string} href hyperlink
   *
   * @returns {Summary} summary instance
   */
  addLink(text, href) {
    const element = this.wrap("a", text, { href });
    return this.addRaw(element).addEOL();
  }
};
var _summary = new Summary();
var summary = _summary;

// node_modules/@actions/core/lib/platform.js
import os3 from "os";

// node_modules/@actions/io/lib/io-util.js
import * as fs2 from "fs";
var { chmod, copyFile, lstat, mkdir, open, readdir, rename, rm, rmdir, stat, symlink, unlink } = fs2.promises;
var IS_WINDOWS = process.platform === "win32";
var READONLY = fs2.constants.O_RDONLY;

// node_modules/@actions/exec/lib/toolrunner.js
var IS_WINDOWS2 = process.platform === "win32";

// node_modules/@actions/core/lib/platform.js
var platform = os3.platform();
var arch = os3.arch();

// node_modules/@actions/core/lib/core.js
var ExitCode;
(function(ExitCode2) {
  ExitCode2[ExitCode2["Success"] = 0] = "Success";
  ExitCode2[ExitCode2["Failure"] = 1] = "Failure";
})(ExitCode || (ExitCode = {}));
function setSecret(secret) {
  issueCommand("add-mask", {}, secret);
}
function getInput(name, options) {
  const val = process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "";
  if (options && options.required && !val) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  if (options && options.trimWhitespace === false) {
    return val;
  }
  return val.trim();
}
function setOutput(name, value) {
  const filePath = process.env["GITHUB_OUTPUT"] || "";
  if (filePath) {
    return issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
  }
  process.stdout.write(os4.EOL);
  issueCommand("set-output", { name }, toCommandValue(value));
}
function setFailed(message) {
  process.exitCode = ExitCode.Failure;
  error(message);
}
function error(message, properties = {}) {
  issueCommand("error", toCommandProperties(properties), message instanceof Error ? message.toString() : message);
}
function warning(message, properties = {}) {
  issueCommand("warning", toCommandProperties(properties), message instanceof Error ? message.toString() : message);
}
function info(message) {
  process.stdout.write(message + os4.EOL);
}

// package.json
var package_default = {
  name: "pgyer-upload-app-action",
  version: "2.0.0",
  private: true,
  description: "GitHub Action that uploads Android, iOS and HarmonyOS apps to PGYER",
  type: "module",
  main: "dist/index.js",
  scripts: {
    build: "node scripts/build.js",
    test: 'node --test "test/*.test.js"'
  },
  repository: {
    type: "git",
    url: "git+https://github.com/PGYER/pgyer-upload-app-action.git"
  },
  keywords: [
    "github-actions",
    "pgyer",
    "android",
    "ios",
    "harmonyos",
    "app-distribution"
  ],
  author: "PGYER",
  license: "ISC",
  engines: {
    node: ">=24"
  },
  dependencies: {
    "@actions/core": "^3.0.1"
  },
  devDependencies: {
    esbuild: "0.28.2"
  }
};

// src/inputs.js
import path from "node:path";
var DEFAULT_PROCESSING_TIMEOUT = 600;
var BUILD_TYPES = { ".apk": "android", ".ipa": "ios", ".hap": "harmony" };
var InputError = class extends Error {
};
function buildTypeOf(filePath) {
  const type = BUILD_TYPES[path.extname(filePath).toLowerCase()];
  if (!type) {
    throw new InputError(
      `Cannot tell the app type of ${path.basename(filePath)}. appFilePath must point to an .apk, .ipa or .hap file.`
    );
  }
  return type;
}
function isPlainAscii(text) {
  return /^[\x20-\x7e]+$/.test(text);
}
function readInputs(getInput2) {
  const apiKey = getInput2("_api_key");
  if (!apiKey) {
    throw new InputError(
      "Input _api_key is required. Store your PGYER API key as a repository secret and pass it with `_api_key: ${{ secrets.PGYER_API_KEY }}`."
    );
  }
  const appFilePath = getInput2("appFilePath");
  if (!appFilePath) {
    throw new InputError("Input appFilePath is required: the path to the .apk, .ipa or .hap file to upload.");
  }
  const password = getInput2("buildPassword");
  let installType = getInput2("buildInstallType");
  if (installType && !["1", "2", "3"].includes(installType)) {
    throw new InputError(
      `buildInstallType must be 1 (public), 2 (password) or 3 (invitation only), not "${installType}".`
    );
  }
  if (password && !installType) {
    installType = "2";
  }
  const installDate = getInput2("buildInstallDate");
  if (installDate && !["1", "2"].includes(installDate)) {
    throw new InputError(
      `buildInstallDate must be 1 (limit the install period) or 2 (no limit), not "${installDate}".`
    );
  }
  const startDate = getInput2("buildInstallStartDate");
  const endDate = getInput2("buildInstallEndDate");
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new InputError("Set both buildInstallStartDate and buildInstallEndDate, or neither.");
  }
  if (startDate && installDate === "2") {
    throw new InputError("buildInstallDate is 2 (no limit), but an install period is set. Remove one of them.");
  }
  if (!startDate && installDate === "1") {
    throw new InputError("buildInstallDate is 1, so set buildInstallStartDate and buildInstallEndDate too.");
  }
  let oversea;
  const overseaInput = getInput2("oversea").toLowerCase();
  if (overseaInput === "true") {
    oversea = true;
  } else if (overseaInput === "false") {
    oversea = false;
  } else if (overseaInput) {
    throw new InputError(`oversea must be true or false, not "${getInput2("oversea")}".`);
  }
  let processingTimeout = DEFAULT_PROCESSING_TIMEOUT;
  const timeoutInput = getInput2("processingTimeout");
  if (timeoutInput) {
    processingTimeout = Number(timeoutInput);
    if (!/^\d+$/.test(timeoutInput) || processingTimeout <= 0) {
      throw new InputError(`processingTimeout must be a positive number of seconds, not "${timeoutInput}".`);
    }
  }
  return {
    apiKey,
    appFilePath,
    buildType: buildTypeOf(appFilePath),
    installType,
    password,
    description: getInput2("buildDescription"),
    updateDescription: getInput2("buildUpdateDescription"),
    installDate: startDate ? "1" : installDate,
    startDate,
    endDate,
    channelShortcut: getInput2("buildChannelShortcut"),
    oversea,
    downloadFileName: getInput2("downloadFileName"),
    processingTimeout
  };
}
function tokenForm(options) {
  const form = { _api_key: options.apiKey, buildType: options.buildType };
  const optional = {
    buildInstallType: options.installType,
    buildPassword: options.password,
    buildDescription: options.description,
    buildUpdateDescription: options.updateDescription,
    buildInstallDate: options.installDate,
    buildInstallStartDate: options.startDate,
    buildInstallEndDate: options.endDate,
    buildChannelShortcut: options.channelShortcut
  };
  for (const [name, value] of Object.entries(optional)) {
    if (value) {
      form[name] = value;
    }
  }
  if (options.oversea !== void 0) {
    form.oversea = options.oversea ? "1" : "2";
  }
  return form;
}

// src/pgyer.js
import { randomUUID as randomUUID2 } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat as stat2 } from "node:fs/promises";
import path2 from "node:path";
import { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
var DEFAULT_API_SERVERS = ["https://www.pgyer.com", "https://www.xcxwo.com", "https://www.pgyerapp.com"];
var WEB_SERVER = "https://www.pgyer.com";
var CODE_SYNCING = 1246;
var CODE_PROCESSING = 1247;
var API_TIMEOUT_MS = 3e4;
var POLL_INTERVAL_MS = 3e3;
var HINTS = {
  1001: "Check that the API key is correct. You can find it at https://www.pgyer.com/account/api",
  1002: "Check that the API key is correct. You can find it at https://www.pgyer.com/account/api",
  1003: "Sub-accounts cannot use the API. Use the API key of the main account.",
  1019: "Complete real-name verification before uploading: https://www.pgyer.com/account/certification",
  1020: "Uploading is disabled for this account. Contact PGYER customer service.",
  1022: "Your PGYER storage is full or the file is too large. Free up space or upgrade your plan."
};
var PgyerApiError = class extends Error {
  constructor(code, serverMessage) {
    let message = `PGYER API error ${code}`;
    if (typeof serverMessage === "string" && serverMessage.trim()) {
      message += `: ${serverMessage.trim()}`;
    }
    if (HINTS[code]) {
      message += `
${HINTS[code]}`;
    }
    super(message);
    this.code = code;
  }
};
var NetworkError = class extends Error {
};
async function uploadApp(options, form, ctx) {
  const token = await requestToken(form, ctx);
  await sendToStorage(token, options, ctx);
  ctx.log("[PGYER] Upload finished. Waiting for PGYER to process the build...");
  return waitForBuild(token.server, options.apiKey, token.key, options.processingTimeout * 1e3, ctx);
}
async function requestToken(form, ctx) {
  const servers = ctx.servers ?? DEFAULT_API_SERVERS;
  let lastFailure;
  for (const [index, server] of servers.entries()) {
    let json;
    try {
      json = await postForm(`${server}/apiv2/app/getCOSToken`, form, ctx);
    } catch (error2) {
      if (!(error2 instanceof NetworkError)) {
        throw error2;
      }
      lastFailure = error2;
      const next = servers[index + 1];
      ctx.log(`[PGYER] ${server} is not reachable (${error2.message})${next ? `, trying ${next}` : ""}.`);
      continue;
    }
    if (Number(json.code) !== 0) {
      throw new PgyerApiError(Number(json.code), json.message);
    }
    const data = json.data ?? {};
    const { params, endpoint, key } = data;
    if (!params || typeof params !== "object" || typeof endpoint !== "string" || !endpoint || !key) {
      throw new Error("PGYER returned an incomplete upload token. Please try again later.");
    }
    return { server, endpoint, key: String(key), params };
  }
  throw new Error(
    `None of the PGYER API servers could be reached: ${servers.join(", ")}. Last error: ${lastFailure?.message}`
  );
}
async function sendToStorage(token, options, ctx) {
  const filePath = options.appFilePath;
  const { size } = await stat2(filePath);
  const boundary = `----PgyerAction${randomUUID2().replaceAll("-", "")}`;
  const fields = {};
  for (const [name, value] of Object.entries(token.params)) {
    fields[name] = value == null ? "" : String(value);
  }
  let downloadName = path2.basename(filePath);
  if (options.downloadFileName) {
    if (isPlainAscii(options.downloadFileName)) {
      downloadName = options.downloadFileName;
    } else {
      ctx.warn?.("downloadFileName is ignored because it contains characters other than plain ASCII.");
    }
  }
  if (isPlainAscii(downloadName)) {
    fields["x-cos-meta-file-name"] = downloadName;
  }
  let head = "";
  for (const [name, value] of Object.entries(fields)) {
    head += `--${boundary}\r
Content-Disposition: form-data; name="${name}"\r
\r
${value}\r
`;
  }
  head += `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${multipartFileName(filePath)}"\r
Content-Type: application/octet-stream\r
\r
`;
  const headBytes = Buffer.from(head, "utf8");
  const tailBytes = Buffer.from(`\r
--${boundary}--\r
`, "utf8");
  ctx.log(`[PGYER] Uploading ${path2.basename(filePath)} (${humanSize(size)})...`);
  async function* body() {
    yield headBytes;
    let sent = 0;
    let reported = 0;
    for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
      sent += chunk.length;
      const tenth = size === 0 ? 10 : Math.floor(sent * 10 / size);
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
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(headBytes.length + size + tailBytes.length),
        "user-agent": ctx.userAgent
      },
      body: Readable.toWeb(Readable.from(body())),
      duplex: "half",
      // With redirects allowed, fetch() clones the request and keeps every chunk of the body in memory.
      redirect: "error"
    });
    text = await response.text();
  } catch (error2) {
    throw new Error(`Uploading the file to storage failed: ${describeFailure(error2)}`);
  }
  if (response.status < 200 || response.status > 299) {
    throw new Error(`Uploading the file to storage failed with HTTP ${response.status}${storageError(text)}`);
  }
}
async function waitForBuild(server, apiKey, buildKey, timeoutMs, ctx) {
  const form = { _api_key: apiKey, buildKey };
  const deadline = Date.now() + timeoutMs;
  const pollInterval = ctx.pollIntervalMs ?? POLL_INTERVAL_MS;
  let reportedNetworkError = false;
  while (true) {
    let json;
    try {
      json = await postForm(`${server}/apiv2/app/buildInfo`, form, ctx);
    } catch (error2) {
      if (!(error2 instanceof NetworkError)) {
        throw error2;
      }
      if (!reportedNetworkError) {
        ctx.log(`[PGYER] Checking the build status failed (${error2.message}), retrying...`);
        reportedNetworkError = true;
      }
    }
    if (json) {
      const code = Number(json.code);
      if (code === 0) {
        if (!json.data || typeof json.data !== "object") {
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
        `PGYER is still processing the build after ${Math.round(timeoutMs / 1e3)} seconds. It may still be published; check your app list on PGYER. Build key: ${buildKey}`
      );
    }
    await sleep(pollInterval);
  }
}
async function postForm(url, form, ctx) {
  let response;
  let text;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": ctx.userAgent
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(ctx.apiTimeoutMs ?? API_TIMEOUT_MS)
    });
    text = await response.text();
  } catch (error2) {
    throw new NetworkError(describeFailure(error2));
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new NetworkError(`HTTP ${response.status} with a non-JSON response`);
  }
  if (!json || typeof json !== "object" || !("code" in json)) {
    throw new NetworkError(`HTTP ${response.status} with an unexpected response`);
  }
  return json;
}
function describeFailure(error2) {
  if (error2?.name === "TimeoutError" || error2?.name === "AbortError") {
    return "timed out";
  }
  const cause = error2?.cause;
  if (cause) {
    return [cause.code, cause.message].filter(Boolean).join(" ") || String(cause);
  }
  return error2?.message ?? String(error2);
}
function storageError(text) {
  const tag = (name) => text?.match(new RegExp(`<${name}>([^<]{0,200})</${name}>`))?.[1];
  const parts = [tag("Code"), tag("Message")].filter(Boolean);
  const requestId = tag("RequestId");
  let result = parts.length ? `: ${parts.join(": ")}` : "";
  if (requestId) {
    result += ` (request ID ${requestId})`;
  }
  return result;
}
function multipartFileName(filePath) {
  const name = path2.basename(filePath);
  if (isPlainAscii(name) && !name.includes('"')) {
    return name;
  }
  return `upload${path2.extname(name)}`;
}
function humanSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function buildLinks(info2) {
  const buildKey = info2.buildKey ?? "";
  const shortcut = info2.buildShortcutUrl ?? "";
  return {
    appPgyerURL: `${WEB_SERVER}/${shortcut || buildKey}`,
    appBuildURL: `${WEB_SERVER}/${buildKey}`
  };
}

// src/main.js
var USER_AGENT = `pgyer-upload-app-action/${package_default.version} Node/${process.version}`;
var INSTALL_TYPES = { 1: "public", 2: "password", 3: "invitation only" };
var OUTPUT_FIELDS = ["buildKey", "buildVersion", "buildBuildVersion", "buildShortcutUrl", "buildQRCodeURL"];
async function run() {
  try {
    for (const name of ["_api_key", "buildPassword"]) {
      const value = getInput(name);
      if (value) {
        setSecret(value);
      }
    }
    const options = readInputs((name) => getInput(name));
    options.appFilePath = path3.resolve(options.appFilePath);
    await checkFile(options.appFilePath);
    logSettings(options);
    const info2 = await uploadApp(options, tokenForm(options), {
      userAgent: USER_AGENT,
      log: (message) => info(message),
      warn: (message) => warning(message),
      servers: apiServers()
    });
    const outputs = { info: JSON.stringify(info2) };
    for (const name of OUTPUT_FIELDS) {
      outputs[name] = info2[name] == null ? "" : String(info2[name]);
    }
    Object.assign(outputs, buildLinks(info2));
    for (const [name, value] of Object.entries(outputs)) {
      setOutput(name, value);
    }
    info(`[PGYER] Published ${describeBuild(info2)}`);
    info(`[PGYER] Download page: ${outputs.appPgyerURL}`);
    if (outputs.buildQRCodeURL) {
      info(`[PGYER] QR code: ${outputs.buildQRCodeURL}`);
    }
    await writeSummary(info2, outputs);
  } catch (error2) {
    setFailed(error2 instanceof Error ? error2.message : String(error2));
  }
}
async function checkFile(filePath) {
  let stats;
  try {
    stats = await stat3(filePath);
  } catch (error2) {
    if (error2.code === "ENOENT") {
      throw new InputError(`App file not found: ${filePath}`);
    }
    throw error2;
  }
  if (!stats.isFile()) {
    throw new InputError(`appFilePath is not a file: ${filePath}`);
  }
  if (stats.size === 0) {
    throw new InputError(`App file is empty: ${filePath}`);
  }
}
function logSettings(options) {
  info(`[PGYER] App file: ${options.appFilePath} (${options.buildType})`);
  const settings = [];
  if (options.installType) {
    settings.push(`install type: ${INSTALL_TYPES[options.installType]}`);
  }
  if (options.password) {
    settings.push("install password: set");
  }
  if (options.installDate === "1") {
    settings.push(`install period: ${options.startDate} to ${options.endDate}`);
  } else if (options.installDate === "2") {
    settings.push("install period: no limit");
  }
  if (options.channelShortcut) {
    settings.push(`channel: ${options.channelShortcut}`);
  }
  if (options.oversea !== void 0) {
    settings.push(`oversea: ${options.oversea}`);
  }
  if (options.description) {
    settings.push("description: set");
  }
  if (options.updateDescription) {
    settings.push("update description: set");
  }
  if (settings.length) {
    info(`[PGYER] Settings: ${settings.join(", ")}`);
  }
}
function apiServers() {
  const servers = (process.env.PGYER_API_SERVERS ?? "").split(",").map((server) => server.trim().replace(/\/+$/, "")).filter(Boolean);
  return servers.length ? servers : DEFAULT_API_SERVERS;
}
function describeBuild(info2) {
  let text = [info2.buildName, info2.buildVersion].filter(Boolean).join(" ") || "the build";
  if (info2.buildBuildVersion) {
    text += ` (build ${info2.buildBuildVersion})`;
  }
  if (info2.buildFileSize && Number(info2.buildFileSize) > 0) {
    text += `, ${humanSize(Number(info2.buildFileSize))}`;
  }
  return text;
}
async function writeSummary(info2, outputs) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }
  try {
    const summary2 = summary.addHeading("Uploaded to PGYER", 3).addTable([
      [
        { data: "App", header: true },
        { data: "Version", header: true },
        { data: "Build", header: true },
        { data: "Download page", header: true }
      ],
      [
        escapeHtml(info2.buildName),
        escapeHtml(info2.buildVersion),
        escapeHtml(info2.buildBuildVersion),
        `<a href="${escapeHtml(outputs.appPgyerURL)}">${escapeHtml(outputs.appPgyerURL)}</a>`
      ]
    ]);
    if (outputs.buildQRCodeURL) {
      summary2.addImage(escapeHtml(outputs.buildQRCodeURL), "QR code for installing the build", {
        width: "160",
        height: "160"
      });
    }
    await summary2.write();
  } catch (error2) {
    warning(`Could not write the job summary: ${error2.message}`);
  }
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// src/index.js
run();
