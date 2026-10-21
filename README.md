# Upload App to PGYER

A GitHub Action that uploads an Android (`.apk`), iOS (`.ipa`) or HarmonyOS (`.hap`) build to [PGYER](https://www.pgyer.com) for beta distribution. It waits until PGYER has processed the build, then gives you the download link and the QR code as step outputs and in the job summary.

The step fails if the upload fails, so a broken release never looks green.

## Set up the API key

1. Copy your API key from https://www.pgyer.com/account/api. Use the main account: sub-accounts cannot use the API.
2. In your repository, open **Settings → Secrets and variables → Actions → New repository secret**, name it `PGYER_API_KEY` and paste the key.
3. Pass it to the action as `_api_key: ${{ secrets.PGYER_API_KEY }}`. GitHub hides secrets in logs, and the action never prints the key or the install password.

## Usage

### Android

```yaml
name: Android beta
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: 17
      - run: ./gradlew assembleDebug
      - uses: PGYER/pgyer-upload-app-action@v2
        with:
          _api_key: ${{ secrets.PGYER_API_KEY }}
          appFilePath: app/build/outputs/apk/debug/app-debug.apk
          buildUpdateDescription: ${{ github.event.head_commit.message }}
```

### iOS

Build and export the `.ipa` first. Export it with the `ad-hoc`, `enterprise` or `development` method in `ExportOptions.plist`; App Store builds cannot be installed from PGYER.

```yaml
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v5
      # Install your signing certificate and provisioning profile here, for example from secrets.
      - name: Build the .ipa
        run: |
          xcodebuild -scheme MyApp -configuration Release -archivePath build/MyApp.xcarchive archive
          xcodebuild -exportArchive -archivePath build/MyApp.xcarchive \
            -exportOptionsPlist ExportOptions.plist -exportPath build
      - uses: PGYER/pgyer-upload-app-action@v2
        with:
          _api_key: ${{ secrets.PGYER_API_KEY }}
          appFilePath: build/MyApp.ipa
          buildPassword: ${{ secrets.PGYER_INSTALL_PASSWORD }}
```

### HarmonyOS

Upload a signed `.hap`, built with hvigor on a runner that has the HarmonyOS command-line tools.

```yaml
      - name: Build the .hap
        run: hvigorw assembleHap --mode module -p product=default -p buildMode=release --no-daemon
      - uses: PGYER/pgyer-upload-app-action@v2
        with:
          _api_key: ${{ secrets.PGYER_API_KEY }}
          appFilePath: entry/build/default/outputs/default/entry-default-signed.hap
```

### Use the outputs in later steps

Give the step an `id`, then read `steps.<id>.outputs.<name>`:

```yaml
      - uses: PGYER/pgyer-upload-app-action@v2
        id: pgyer
        with:
          _api_key: ${{ secrets.PGYER_API_KEY }}
          appFilePath: app/build/outputs/apk/debug/app-debug.apk

      - name: Share the link
        env:
          VERSION: ${{ steps.pgyer.outputs.buildVersion }}
          URL: ${{ steps.pgyer.outputs.appPgyerURL }}
          APP_NAME: ${{ fromJSON(steps.pgyer.outputs.info).buildName }}
        run: echo "$APP_NAME $VERSION is ready: $URL"
```

Passing outputs through `env` rather than writing `${{ }}` inside `run` keeps unusual characters in app names or release notes from breaking the script.

## Inputs

Only `_api_key` and `appFilePath` are required. Settings you leave out are not sent, so PGYER keeps the ones of the previous version.

| Input | Description |
| --- | --- |
| `_api_key` | **Required.** Your PGYER API key. Pass it from a secret. |
| `appFilePath` | **Required.** Path to the `.apk`, `.ipa` or `.hap` file. The app type comes from the extension. |
| `buildInstallType` | `1` public, `2` password, `3` invitation only. When `buildPassword` is set and this is not, password install is used. |
| `buildPassword` | Install password. |
| `buildDescription` | App description shown on the download page. |
| `buildUpdateDescription` | Release notes for this build. |
| `buildInstallStartDate` | First day the build can be installed, such as `2026-01-01`. Set together with `buildInstallEndDate`. |
| `buildInstallEndDate` | Last day the build can be installed, such as `2026-12-31`. |
| `buildInstallDate` | Set to `2` to remove an install period set earlier. Setting both dates is enough to limit the period. |
| `buildChannelShortcut` | Short link of the download channel to update, such as `abcd`. One channel only. |
| `oversea` | `true` for the overseas upload acceleration, `false` for the mainland China one. Leave it out to let PGYER choose by the runner's IP address. |
| `processingTimeout` | Seconds to wait for PGYER to process the build after the upload. Default `600`. |
| `downloadFileName` | File name people get when they download the build, such as `MyApp-1.2.3.apk`. Plain ASCII only. Defaults to the uploaded file's name. |

## Outputs

| Output | Description |
| --- | --- |
| `appPgyerURL` | Download page of the app, such as `https://www.pgyer.com/abcd`. |
| `appBuildURL` | Download page of this build, `https://www.pgyer.com/<buildKey>`. |
| `buildQRCodeURL` | URL of the QR code image for installing the build. |
| `buildKey` | Build key that identifies this build on PGYER. |
| `buildVersion` | Version name, such as `1.2.3`. |
| `buildBuildVersion` | Build number PGYER assigned to this upload. |
| `buildShortcutUrl` | Short link of the app, such as `abcd`. |
| `info` | Everything PGYER returned about the build, as a JSON string. Read fields with `fromJSON(steps.<id>.outputs.info).<field>`. |

## Migrating from v1

Change `@v1.3` to `@v2`. Your inputs keep working, but note:

- **The step now fails when the upload fails.** v1 printed the error and still passed. If a failed upload should not fail your workflow, add `continue-on-error: true` to the step.
- **Node 24.** The action runs on `node24`. GitHub-hosted runners support it; self-hosted runners need Actions Runner 2.327.1 or later.
- **New outputs.** `info` is now actually set, and the outputs above are new. The download link and QR code also appear in the job summary.
- **The log no longer shows the install password or PGYER's raw response.**
- **Stricter input checks.** The step fails early on an unknown file extension, a `buildInstallType` other than 1, 2 or 3, only one of the two install dates, `buildInstallDate: 1` without dates, or an `oversea` value other than `true` or `false`.
- **New:** `.hap` files, `buildDescription`, `oversea`, `processingTimeout` and `downloadFileName`. A password without `buildInstallType` now selects password install.

## How it works

1. Requests an upload token from the PGYER API. If `www.pgyer.com` cannot be reached, it tries `www.xcxwo.com` and then `www.pgyerapp.com`.
2. Streams the file to PGYER's storage, logging progress every 10%.
3. Checks every 3 seconds until PGYER has processed the build, for up to `processingTimeout` seconds. If that runs out, the build may still be published; the error message includes the build key.

## Development

```sh
npm ci
npm test        # node:test against a local fake PGYER server
npm run build   # bundles src/ into dist/index.js; commit dist/ with your change
```

CI fails if `dist/` does not match the sources.

## Links

- PGYER API documentation: https://www.pgyer.com/doc/view/api#fastUploadApp
- PGYER help center (中文): https://www.pgyer.com/doc
