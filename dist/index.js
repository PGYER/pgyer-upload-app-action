/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 975:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

/*
 * 此 Demo 用演示如何使用 PGYER API 上传 App
 * 详细文档参照 https://www.pgyer.com/doc/view/api#fastUploadApp
 * 适用于 nodejs 项目
 * 本代码需要 npm 包 form-data 支持 运行 npm install --save form-data 即可
 */

/*
 * 以下代码为示例代码，可以在生产环境中使用。使用方法如下:
 * 
 * 先实例化上传器
 * 
 * const uploader = new PGYERAppUploader(<your api key>);
 * 
 * 在上传器实例化以后, 通过调用 upload 方法即可完成 App 上传。
 * 
 * upload 方法有两种调用方式
 * 
 * 1. 回调方式调用
 * 
 *  uploader.upload(uploadOptions: Object, callbackFn(error: Error, result: Object): any): void
 * 
 *  示例: 
 *  const uploader = new PGYERAppUploader('apikey');
 *  uploader.upload({ buildType: 'ios', filePath: './app.ipa' }, function (error, data) {
 *    // code here
 *  })
 * 
 * 2. 使用 promise 方式调用
 * 
 * uploader.upload(uploadOptions: Object): Promise
 * 
 * 示例: 
 * const uploader = new PGYERAppUploader('apikey');
 * uploader.upload({ buildType: 'ios', filePath: './app.ipa' }).then(function (data) {
 *   // code here
 * }).catch(fucntion (error) {
 *   // code here
 * })
 * 
 * uploadOptions 参数说明: (https://www.pgyer.com/doc/view/api#fastUploadApp)
 * 
 * 对象成员名                是否必选    含义
 * buildType               Y          需要上传的应用类型，ios 或 android
 * filePath                Y          App 文件的路径，可以是相对路径
 * log                     N          Bool 类型，是否打印 log
 * buildInstallType        N          应用安装方式，值为(1,2,3，默认为1 公开安装)。1：公开安装，2：密码安装，3：邀请安装
 * buildPassword           N          设置App安装密码，密码为空时默认公开安装
 * buildUpdateDescription  N          版本更新描述，请传空字符串，或不传。
 * buildInstallDate        N          是否设置安装有效期，值为：1 设置有效时间， 2 长期有效，如果不填写不修改上一次的设置
 * buildInstallStartDate   N          安装有效期开始时间，字符串型，如：2018-01-01
 * buildInstallEndDate     N          安装有效期结束时间，字符串型，如：2018-12-31
 * buildChannelShortcut    N          所需更新的指定渠道的下载短链接，只可指定一个渠道，字符串型，如：abcd
 * 
 * 
 * 返回结果
 * 
 * 返回结果是一个对象, 主要返回 API 调用的结果, 示例如下:
 * 
 * {
 *   code: 0,
 *   message: '',
 *   data: {
 *     buildKey: 'xxx',
 *     buildType: '1',
 *     buildIsFirst: '0',
 *     buildIsLastest: '1',
 *     buildFileKey: 'xxx.ipa',
 *     buildFileName: '',
 *     buildFileSize: '40095060',
 *     buildName: 'xxx',
 *     buildVersion: '2.2.0',
 *     buildVersionNo: '1.0.1',
 *     buildBuildVersion: '9',
 *     buildIdentifier: 'xxx.xxx.xxx',
 *     buildIcon: 'xxx',
 *     buildDescription: '',
 *     buildUpdateDescription: '',
 *     buildScreenshots: '',
 *     buildShortcutUrl: 'xxxx',
 *     buildCreated: 'xxxx-xx-xx xx:xx:xx',
 *     buildUpdated: 'xxxx-xx-xx xx:xx:xx',
 *     buildQRCodeURL: 'https://www.pgyer.com/app/qrcodeHistory/xxxx'
 *   }
 * }
 * 
 */

const https = __nccwpck_require__(687);
const fs = __nccwpck_require__(147);
const querystring = __nccwpck_require__(477);
const FormData = __nccwpck_require__(930);

module.exports = function (apiKey) {
  const LOG_TAG = '[PGYER APP UPLOADER]';
  let uploadOptions = '';
  this.upload = function (options, callback) {
    if (
      options &&
      ['ios', 'android'].includes(options.buildType) &&
      typeof options.filePath === 'string'
    ) {
      uploadOptions = options;
      if (typeof callback === 'function') {
        uploadApp(callback);
        return null;
      } else {
        return new Promise(function(resolve, reject) {
          uploadApp(function (error, data) {
            if (error === null) {
              return resolve(data);
            }
            return reject(error);
          });
        });
      }
    }

    throw new Error('filePath must be a string');
  }

  function uploadApp (callback) {
    // step 1: get app upload token
    const uploadTokenRequestData = querystring.stringify({ ...uploadOptions, _api_key: apiKey });
    
    uploadOptions.log && console.log(LOG_TAG + ' Check API Key ... Please Wait ...');
    const uploadTokenRequest = https.request({
      hostname: 'www.pgyer.com',
      path: '/apiv2/app/getCOSToken',
      method: 'POST',
      headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
        'Content-Length' : uploadTokenRequestData.length
      }
    }, response => {
      if (response.statusCode !== 200) {
        callback(new Error(LOG_TAG + 'Service down: cannot get upload token.'), null);
        return;
      }
    
      let responseData = '';
      response.on('data', data => {
        responseData += data.toString();
      })
    
      response.on('end', () => {
        const responseText = responseData.toString();
        try {
          const responseInfo = JSON.parse(responseText);
          if (responseInfo.code) {
            callback(new Error(LOG_TAG + 'Service down: ' + responseInfo.code + ': ' + responseInfo.message), null);
            return;
          }
          uploadApp(responseInfo);
        } catch (error) {
          callback(error, null);
        }
      })
    })

    uploadTokenRequest.write(uploadTokenRequestData);
    uploadTokenRequest.end();


    // step 2: upload app to bucket
    function uploadApp(uploadData) {
      uploadOptions.log && console.log(LOG_TAG + ' Uploading app ... Please Wait ...');
      const exsit = fs.existsSync(uploadOptions.filePath);
      if (!exsit) {
        callback(new Error(LOG_TAG + ' filePath: file not exist'), null);
        return;
      }

      const statResult = fs.statSync(uploadOptions.filePath);
      if (!statResult || !statResult.isFile()) {
        callback(new Error(LOG_TAG + ' filePath: path not a file'), null);
        return;
      }

      const uploadAppRequestData = new FormData();
      uploadAppRequestData.append('signature', uploadData.data.params.signature);
      uploadAppRequestData.append('x-cos-security-token', uploadData.data.params['x-cos-security-token']);
      uploadAppRequestData.append('key', uploadData.data.params.key);
      uploadAppRequestData.append('file', fs.createReadStream(uploadOptions.filePath));

      uploadAppRequestData.submit(uploadData.data.endpoint, function (error, response) {
        if (error) {
          callback(error, null);
          return;
        }
        if (response.statusCode === 204) {
          setTimeout(() => getUploadResult(uploadData), 1000);
        } else {
          callback(new Error(LOG_TAG + ' Upload Error!'), null);
        }
      });
    }

    // step 3: get uploaded app data
    function getUploadResult (uploadData) {
      const uploadResultRequest = https.request({
        hostname: 'www.pgyer.com',
        path: '/apiv2/app/buildInfo?_api_key=' + apiKey + '&buildKey=' + uploadData.data.key,
        method: 'POST',
        headers: {
          'Content-Type' : 'application/x-www-form-urlencoded',
          'Content-Length' : 0
        }
      }, response => {
        if (response.statusCode !== 200) {
          callback(new Error(LOG_TAG + ' Service is down.'), null);
          return;
        }
      
        let responseData = '';
        response.on('data', data => {
          responseData += data.toString();
        })
      
        response.on('end', () => {
          const responseText = responseData.toString();
          try {
            const responseInfo = JSON.parse(responseText);
            if (responseInfo.code === 1247) {
              uploadOptions.log && console.log(LOG_TAG + ' Parsing App Data ... Please Wait ...');
              setTimeout(() => getUploadResult(uploadData), 1000);
              return;
            } else if (responseInfo.code) {
              callback(new Error(LOG_TAG + 'Service down: ' + responseInfo.code + ': ' + responseInfo.message), null);
            }
            callback(null, responseInfo);
          } catch (error) {
            callback(error, null);
          }
        })
      
      })
    
      uploadResultRequest.write(uploadTokenRequestData);
      uploadResultRequest.end();
    }
  }
}


/***/ }),

/***/ 26:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 965:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 930:
/***/ ((module) => {

module.exports = eval("require")("form-data");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 687:
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ 477:
/***/ ((module) => {

"use strict";
module.exports = require("querystring");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(26);
const github = __nccwpck_require__(965);
const PGYERAppUploader = __nccwpck_require__(975);

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
    core.info(JSON.stringify(info));
  }).catch(console.error);

} catch (error) {
  core.setFailed(error.message);
}

})();

module.exports = __webpack_exports__;
/******/ })()
;