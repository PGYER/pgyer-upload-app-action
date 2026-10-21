import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildTypeOf, InputError, isPlainAscii, readInputs, tokenForm } from '../src/inputs.js';

const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

function inputs(values) {
  return readInputs((name) => values[name] ?? '');
}

function form(values) {
  return tokenForm(inputs({ _api_key: KEY, appFilePath: 'app.apk', ...values }));
}

describe('build type', () => {
  test('comes from the file extension', () => {
    assert.equal(buildTypeOf('out/app-release.apk'), 'android');
    assert.equal(buildTypeOf('App.IPA'), 'ios');
    assert.equal(buildTypeOf('entry-default-signed.hap'), 'harmony');
  });

  test('other extensions fail clearly', () => {
    for (const file of ['app.aab', 'app.zip', 'app', 'app.apk.zip']) {
      assert.throws(() => buildTypeOf(file), (error) => error instanceof InputError && /\.apk, \.ipa or \.hap/.test(error.message));
    }
  });
});

describe('token form', () => {
  test('sends only the API key and build type when nothing else is set', () => {
    assert.deepEqual(form({}), { _api_key: KEY, buildType: 'android' });
  });

  test('sends every optional field that is set', () => {
    assert.deepEqual(
      form({
        appFilePath: 'app.hap',
        buildInstallType: '3',
        buildPassword: 'secret',
        buildDescription: 'desc',
        buildUpdateDescription: 'line 1\nline 2',
        buildInstallStartDate: '2026-01-01',
        buildInstallEndDate: '2026-12-31',
        buildChannelShortcut: 'beta',
        oversea: 'true',
      }),
      {
        _api_key: KEY,
        buildType: 'harmony',
        buildInstallType: '3',
        buildPassword: 'secret',
        buildDescription: 'desc',
        buildUpdateDescription: 'line 1\nline 2',
        buildInstallDate: '1',
        buildInstallStartDate: '2026-01-01',
        buildInstallEndDate: '2026-12-31',
        buildChannelShortcut: 'beta',
        oversea: '1',
      },
    );
  });

  test('never defaults the install type', () => {
    assert.equal('buildInstallType' in form({}), false);
    assert.equal(form({ buildInstallType: '1' }).buildInstallType, '1');
  });

  test('a password without an install type means password install', () => {
    assert.deepEqual(form({ buildPassword: 'pw' }), {
      _api_key: KEY,
      buildType: 'android',
      buildInstallType: '2',
      buildPassword: 'pw',
    });
    assert.equal(form({ buildPassword: 'pw', buildInstallType: '3' }).buildInstallType, '3');
  });

  test('rejects an unknown install type', () => {
    assert.throws(() => form({ buildInstallType: '4' }), /buildInstallType must be 1/);
  });

  test('oversea maps true to 1 and false to 2, and is omitted when unset', () => {
    assert.equal(form({ oversea: 'true' }).oversea, '1');
    assert.equal(form({ oversea: 'TRUE' }).oversea, '1');
    assert.equal(form({ oversea: 'false' }).oversea, '2');
    assert.equal('oversea' in form({}), false);
    assert.throws(() => form({ oversea: '1' }), /oversea must be true or false/);
  });

  test('install period needs both dates', () => {
    assert.throws(() => form({ buildInstallStartDate: '2026-01-01' }), /both buildInstallStartDate and buildInstallEndDate/);
    assert.throws(() => form({ buildInstallEndDate: '2026-01-01' }), /both buildInstallStartDate and buildInstallEndDate/);
    assert.throws(() => form({ buildInstallDate: '1' }), /set buildInstallStartDate and buildInstallEndDate/);
  });

  test('buildInstallDate 2 removes the install period', () => {
    assert.equal(form({ buildInstallDate: '2' }).buildInstallDate, '2');
    assert.throws(
      () => form({ buildInstallDate: '2', buildInstallStartDate: '2026-01-01', buildInstallEndDate: '2026-02-01' }),
      /no limit/,
    );
    assert.throws(() => form({ buildInstallDate: '3' }), /buildInstallDate must be 1/);
  });
});

describe('other inputs', () => {
  test('the API key and app file are required', () => {
    assert.throws(() => inputs({ appFilePath: 'app.apk' }), /_api_key is required/);
    assert.throws(() => inputs({ _api_key: KEY }), /appFilePath is required/);
  });

  test('processingTimeout defaults to 600 seconds', () => {
    assert.equal(inputs({ _api_key: KEY, appFilePath: 'a.apk' }).processingTimeout, 600);
    assert.equal(inputs({ _api_key: KEY, appFilePath: 'a.apk', processingTimeout: '90' }).processingTimeout, 90);
    for (const value of ['0', '-5', '1.5', 'ten']) {
      assert.throws(() => inputs({ _api_key: KEY, appFilePath: 'a.apk', processingTimeout: value }), /processingTimeout/);
    }
  });

  test('isPlainAscii accepts printable ASCII only', () => {
    assert.equal(isPlainAscii('My App 1.0.apk'), true);
    assert.equal(isPlainAscii('应用.apk'), false);
    assert.equal(isPlainAscii('a\nb'), false);
    assert.equal(isPlainAscii(''), false);
  });
});
