const core = require('@actions/core');
const github = require('@actions/github');
const PGYERAppUploader = require('./PGYERAppUploader');

try {
  const apkKey = core.getInput('_api_key');
  const appFilePath = core.getInput('appFilePath');
  const buildInstallType = core.getInput('buildInstallType');
  const buildPassword = core.getInput('buildPassword');

  // get file ext
  const ext = appFilePath.split('.').pop().toLowerCase();
  let builtType = 'android';
  if (ext == 'ipa') {
    builtType = 'ios';
  }

  const uploader = new PGYERAppUploader(apkKey);
  const uploadOptions = {
    buildType: builtType,
    filePath: appFilePath,
    log: false,
    buildInstallType: buildInstallType,
    buildPassword: buildPassword
  }

  uploader.upload(uploadOptions).then(function(info) {
    core.setOutput("info", info);
  }).catch(console.error);

} catch (error) {
  core.setFailed(error.message);
}
