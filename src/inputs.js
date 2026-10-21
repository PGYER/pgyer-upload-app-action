import path from 'node:path';

export const DEFAULT_PROCESSING_TIMEOUT = 600;

const BUILD_TYPES = { '.apk': 'android', '.ipa': 'ios', '.hap': 'harmony' };

export class InputError extends Error {}

/** Returns the PGYER build type for an app file, or throws if the extension is not supported. */
export function buildTypeOf(filePath) {
  const type = BUILD_TYPES[path.extname(filePath).toLowerCase()];
  if (!type) {
    throw new InputError(
      `Cannot tell the app type of ${path.basename(filePath)}. appFilePath must point to an .apk, .ipa or .hap file.`,
    );
  }
  return type;
}

/** COS stores x-cos-meta-* fields as HTTP headers, so only printable ASCII is safe to send. */
export function isPlainAscii(text) {
  return /^[\x20-\x7e]+$/.test(text);
}

/**
 * Reads and validates the action inputs. `getInput(name)` returns the trimmed value or ''.
 */
export function readInputs(getInput) {
  const apiKey = getInput('_api_key');
  if (!apiKey) {
    throw new InputError(
      'Input _api_key is required. Store your PGYER API key as a repository secret and pass it with `_api_key: ${{ secrets.PGYER_API_KEY }}`.',
    );
  }
  const appFilePath = getInput('appFilePath');
  if (!appFilePath) {
    throw new InputError('Input appFilePath is required: the path to the .apk, .ipa or .hap file to upload.');
  }

  const password = getInput('buildPassword');
  let installType = getInput('buildInstallType');
  if (installType && !['1', '2', '3'].includes(installType)) {
    throw new InputError(
      `buildInstallType must be 1 (public), 2 (password) or 3 (invitation only), not "${installType}".`,
    );
  }
  if (password && !installType) {
    installType = '2';
  }

  const installDate = getInput('buildInstallDate');
  if (installDate && !['1', '2'].includes(installDate)) {
    throw new InputError(
      `buildInstallDate must be 1 (limit the install period) or 2 (no limit), not "${installDate}".`,
    );
  }
  const startDate = getInput('buildInstallStartDate');
  const endDate = getInput('buildInstallEndDate');
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new InputError('Set both buildInstallStartDate and buildInstallEndDate, or neither.');
  }
  if (startDate && installDate === '2') {
    throw new InputError('buildInstallDate is 2 (no limit), but an install period is set. Remove one of them.');
  }
  if (!startDate && installDate === '1') {
    throw new InputError('buildInstallDate is 1, so set buildInstallStartDate and buildInstallEndDate too.');
  }

  let oversea;
  const overseaInput = getInput('oversea').toLowerCase();
  if (overseaInput === 'true') {
    oversea = true;
  } else if (overseaInput === 'false') {
    oversea = false;
  } else if (overseaInput) {
    throw new InputError(`oversea must be true or false, not "${getInput('oversea')}".`);
  }

  let processingTimeout = DEFAULT_PROCESSING_TIMEOUT;
  const timeoutInput = getInput('processingTimeout');
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
    description: getInput('buildDescription'),
    updateDescription: getInput('buildUpdateDescription'),
    installDate: startDate ? '1' : installDate,
    startDate,
    endDate,
    channelShortcut: getInput('buildChannelShortcut'),
    oversea,
    downloadFileName: getInput('downloadFileName'),
    processingTimeout,
  };
}

/** The form for /apiv2/app/getCOSToken. Only settings the user gave are sent, so PGYER keeps the rest. */
export function tokenForm(options) {
  const form = { _api_key: options.apiKey, buildType: options.buildType };
  const optional = {
    buildInstallType: options.installType,
    buildPassword: options.password,
    buildDescription: options.description,
    buildUpdateDescription: options.updateDescription,
    buildInstallDate: options.installDate,
    buildInstallStartDate: options.startDate,
    buildInstallEndDate: options.endDate,
    buildChannelShortcut: options.channelShortcut,
  };
  for (const [name, value] of Object.entries(optional)) {
    if (value) {
      form[name] = value;
    }
  }
  if (options.oversea !== undefined) {
    // 1 = overseas, 2 = mainland China; the server ignores any other value.
    form.oversea = options.oversea ? '1' : '2';
  }
  return form;
}
