const core = require('@actions/core');
const github = require('@actions/github');
const PGYERAppUploader = require('./PGYERAppUploader');

try {
  const uploadOptions = {
    log: false,
  }

  const apiKey = core.getInput('_api_key', { required: true });
  if (!apiKey) {
    core.warning('apiKey was not set');
  }

  const appFilePath = core.getInput('appFilePath', { required: true });
  if (!appFilePath) {
    core.warning('appFilePath was not set');
  }
  uploadOptions.filePath = appFilePath;

  const otherParams = [
    "buildInstallType",
    "buildPassword",
    "buildUpdateDescription",
    "buildInstallDate",
    "buildInstallStartDate",
    "buildInstallEndDate",
    "buildChannelShortcut"
  ];

  otherParams.forEach(name => {
    let value = core.getInput(name);
    if (value) {
      uploadOptions[[name]] = value;
      core.info(`set ${name}: ${value}`);
    }
  });

  const ext = appFilePath.split('.').pop().toLowerCase();
  if (ext == 'ipa') {
    uploadOptions.buildType = 'ios';
  } else if (ext == 'apk') {
    uploadOptions.buildType = 'android';
  } else {
    core.warning(`Unsupported file type: ${ext}`);
  }

  core.info(`filePath: ${appFilePath}`);
  core.info(`buildType: ${uploadOptions.buildType}`);

  const uploader = new PGYERAppUploader(apiKey);
  uploader.upload(uploadOptions).then(function (info) {
    core.info(`upload success. app info:`);
    core.info(info);
    core.setOutput("app", info);
  }).catch(console.error);

} catch (error) {
  core.setFailed(error.message);
}
