import { stat } from 'node:fs/promises';
import path from 'node:path';
import * as core from '@actions/core';
import pkg from '../package.json' with { type: 'json' };
import { InputError, readInputs, tokenForm } from './inputs.js';
import { buildLinks, DEFAULT_API_SERVERS, humanSize, uploadApp } from './pgyer.js';

export const USER_AGENT = `pgyer-upload-app-action/${pkg.version} Node/${process.version}`;

const INSTALL_TYPES = { 1: 'public', 2: 'password', 3: 'invitation only' };
const OUTPUT_FIELDS = ['buildKey', 'buildVersion', 'buildBuildVersion', 'buildShortcutUrl', 'buildQRCodeURL'];

export async function run() {
  try {
    // Mask the secrets before anything else can print them.
    for (const name of ['_api_key', 'buildPassword']) {
      const value = core.getInput(name);
      if (value) {
        core.setSecret(value);
      }
    }

    const options = readInputs((name) => core.getInput(name));
    options.appFilePath = path.resolve(options.appFilePath);
    await checkFile(options.appFilePath);
    logSettings(options);

    const info = await uploadApp(options, tokenForm(options), {
      userAgent: USER_AGENT,
      log: (message) => core.info(message),
      warn: (message) => core.warning(message),
      servers: apiServers(),
    });

    const outputs = { info: JSON.stringify(info) };
    for (const name of OUTPUT_FIELDS) {
      outputs[name] = info[name] == null ? '' : String(info[name]);
    }
    Object.assign(outputs, buildLinks(info));
    for (const [name, value] of Object.entries(outputs)) {
      core.setOutput(name, value);
    }

    core.info(`[PGYER] Published ${describeBuild(info)}`);
    core.info(`[PGYER] Download page: ${outputs.appPgyerURL}`);
    if (outputs.buildQRCodeURL) {
      core.info(`[PGYER] QR code: ${outputs.buildQRCodeURL}`);
    }
    await writeSummary(info, outputs);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

async function checkFile(filePath) {
  let stats;
  try {
    stats = await stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new InputError(`App file not found: ${filePath}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new InputError(`appFilePath is not a file: ${filePath}`);
  }
  if (stats.size === 0) {
    throw new InputError(`App file is empty: ${filePath}`);
  }
}

function logSettings(options) {
  core.info(`[PGYER] App file: ${options.appFilePath} (${options.buildType})`);
  const settings = [];
  if (options.installType) {
    settings.push(`install type: ${INSTALL_TYPES[options.installType]}`);
  }
  if (options.password) {
    settings.push('install password: set');
  }
  if (options.installDate === '1') {
    settings.push(`install period: ${options.startDate} to ${options.endDate}`);
  } else if (options.installDate === '2') {
    settings.push('install period: no limit');
  }
  if (options.channelShortcut) {
    settings.push(`channel: ${options.channelShortcut}`);
  }
  if (options.oversea !== undefined) {
    settings.push(`oversea: ${options.oversea}`);
  }
  if (options.description) {
    settings.push('description: set');
  }
  if (options.updateDescription) {
    settings.push('update description: set');
  }
  if (settings.length) {
    core.info(`[PGYER] Settings: ${settings.join(', ')}`);
  }
}

/** PGYER_API_SERVERS (comma-separated) replaces the API servers. Used by the tests; not a documented input. */
function apiServers() {
  const servers = (process.env.PGYER_API_SERVERS ?? '')
    .split(',')
    .map((server) => server.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return servers.length ? servers : DEFAULT_API_SERVERS;
}

function describeBuild(info) {
  let text = [info.buildName, info.buildVersion].filter(Boolean).join(' ') || 'the build';
  if (info.buildBuildVersion) {
    text += ` (build ${info.buildBuildVersion})`;
  }
  if (info.buildFileSize && Number(info.buildFileSize) > 0) {
    text += `, ${humanSize(Number(info.buildFileSize))}`;
  }
  return text;
}

async function writeSummary(info, outputs) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }
  try {
    const summary = core.summary
      .addHeading('Uploaded to PGYER', 3)
      .addTable([
        [
          { data: 'App', header: true },
          { data: 'Version', header: true },
          { data: 'Build', header: true },
          { data: 'Download page', header: true },
        ],
        [
          escapeHtml(info.buildName),
          escapeHtml(info.buildVersion),
          escapeHtml(info.buildBuildVersion),
          `<a href="${escapeHtml(outputs.appPgyerURL)}">${escapeHtml(outputs.appPgyerURL)}</a>`,
        ],
      ]);
    if (outputs.buildQRCodeURL) {
      summary.addImage(escapeHtml(outputs.buildQRCodeURL), 'QR code for installing the build', {
        width: '160',
        height: '160',
      });
    }
    await summary.write();
  } catch (error) {
    core.warning(`Could not write the job summary: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
