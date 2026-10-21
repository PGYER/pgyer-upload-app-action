// Runs the action the way the runner does: INPUT_* variables in, GITHUB_OUTPUT and GITHUB_STEP_SUMMARY out.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { BUILD_INFO, formOf, SECURITY_TOKEN, SIGNATURE, startPgyer } from './support/fake-pgyer.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const PASSWORD = 'install-pass-42';

let dir;
let appFile;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pgyer-action-run-'));
  appFile = path.join(dir, 'app-release.apk');
  await writeFile(appFile, 'fake apk');
});

/** Runs an entry point with the given inputs; resolves to { code, stdout, outputs, summary }. */
async function runAction(entry, inputs, servers) {
  const runDir = await mkdtemp(path.join(dir, 'run-'));
  const outputFile = path.join(runDir, 'output');
  const summaryFile = path.join(runDir, 'summary');
  await writeFile(outputFile, '');
  await writeFile(summaryFile, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('INPUT_')));
  for (const [name, value] of Object.entries(inputs)) {
    env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value;
  }
  Object.assign(env, {
    GITHUB_OUTPUT: outputFile,
    GITHUB_STEP_SUMMARY: summaryFile,
    PGYER_API_SERVERS: servers.join(','),
  });
  const { code, stdout } = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, entry)], { env, cwd: dir }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout: stdout + stderr });
    });
  });
  const outputs = {};
  for (const [, name, , value] of (await readFile(outputFile, 'utf8')).matchAll(
    /^(.+?)<<(ghadelimiter_[\w-]+)\n([\s\S]*?)\n\2$/gm,
  )) {
    outputs[name] = value;
  }
  return { code, stdout, outputs, summary: await readFile(summaryFile, 'utf8') };
}

/** The log as the runner shows it: ::add-mask:: commands are consumed, not printed. */
function visibleLog(stdout) {
  return stdout
    .split('\n')
    .filter((line) => !line.startsWith('::add-mask::'))
    .join('\n');
}

for (const entry of ['src/index.js', 'dist/index.js']) {
  describe(`running ${entry}`, () => {
    test('uploads, sets every output and writes the job summary', async () => {
      const pgyer = await startPgyer({ buildInfoCodes: [1247] });
      try {
        const { code, stdout, outputs, summary } = await runAction(
          entry,
          {
            _api_key: KEY,
            appFilePath: 'app-release.apk',
            buildPassword: PASSWORD,
            buildUpdateDescription: 'Fixed the login crash',
            oversea: 'false',
          },
          [pgyer.url],
        );
        assert.equal(code, 0, stdout);

        const tokenRequest = pgyer.requests[0];
        assert.equal(tokenRequest.headers['user-agent'], `pgyer-upload-app-action/${pkg.version} Node/${process.version}`);
        assert.deepEqual(formOf(tokenRequest), {
          _api_key: KEY,
          buildType: 'android',
          buildInstallType: '2',
          buildPassword: PASSWORD,
          buildUpdateDescription: 'Fixed the login crash',
          oversea: '2',
        });

        assert.deepEqual(outputs, {
          info: JSON.stringify(BUILD_INFO),
          buildKey: 'abcdef0123456789',
          buildVersion: '1.2.3',
          buildBuildVersion: '7',
          buildShortcutUrl: 'demo',
          buildQRCodeURL: 'https://www.pgyer.com/app/qrcodeHistory/qr123',
          appPgyerURL: 'https://www.pgyer.com/demo',
          appBuildURL: 'https://www.pgyer.com/abcdef0123456789',
        });

        assert.match(summary, /<a href="https:\/\/www\.pgyer\.com\/demo">/);
        assert.match(summary, /<img src="https:\/\/www\.pgyer\.com\/app\/qrcodeHistory\/qr123"/);
        assert.match(summary, /Demo &lt;App&gt;/);

        assert.match(stdout, new RegExp(`^::add-mask::${KEY}$`, 'm'));
        assert.match(stdout, new RegExp(`^::add-mask::${PASSWORD}$`, 'm'));
        const log = visibleLog(stdout);
        assert.match(log, /Published Demo <App> 1\.2\.3 \(build 7\)/);
        assert.match(log, /Download page: https:\/\/www\.pgyer\.com\/demo/);
        for (const secret of [KEY, PASSWORD, SIGNATURE, SECURITY_TOKEN, 'q-signature']) {
          assert.equal(log.includes(secret), false, `the log must not contain ${secret}`);
        }
      } finally {
        await pgyer.close();
      }
    });

    test('a PGYER error fails the step with exit code 1 and a hint', async () => {
      const pgyer = await startPgyer({ tokenResponse: { code: 1001, message: 'API Key 错误' } });
      try {
        const { code, stdout, outputs } = await runAction(entry, { _api_key: KEY, appFilePath: appFile }, [pgyer.url]);
        assert.equal(code, 1);
        assert.match(stdout, /^::error::PGYER API error 1001: API Key 错误%0ACheck that the API key is correct/m);
        assert.equal(visibleLog(stdout).includes(KEY), false);
        assert.deepEqual(outputs, {});
      } finally {
        await pgyer.close();
      }
    });

    test('a failed storage upload fails the step', async () => {
      const pgyer = await startPgyer({ uploadStatus: 403 });
      try {
        const { code, stdout } = await runAction(entry, { _api_key: KEY, appFilePath: appFile }, [pgyer.url]);
        assert.equal(code, 1);
        assert.match(stdout, /::error::Uploading the file to storage failed with HTTP 403/);
        assert.equal(stdout.includes(SIGNATURE), false);
      } finally {
        await pgyer.close();
      }
    });

    test('a missing file or unknown file type fails before contacting PGYER', async () => {
      const pgyer = await startPgyer();
      try {
        let result = await runAction(entry, { _api_key: KEY, appFilePath: 'missing.ipa' }, [pgyer.url]);
        assert.equal(result.code, 1);
        assert.match(result.stdout, /::error::App file not found: .*missing\.ipa/);

        result = await runAction(entry, { _api_key: KEY, appFilePath: 'app.aab' }, [pgyer.url]);
        assert.equal(result.code, 1);
        assert.match(result.stdout, /::error::Cannot tell the app type of app\.aab/);
        assert.equal(pgyer.requests.length, 0);
      } finally {
        await pgyer.close();
      }
    });
  });
}
