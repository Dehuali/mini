"use strict";
const c = require("./constants");
const OSS = require("ali-oss");
const Core = require("@alicloud/pop-core");
const util = require("util");
const crypto = require("crypto");
const TableStore = require("tablestore");
const getRawBody = require("raw-body");
const uuidv1 = require("uuid/v1");
const axios = require("axios");

function localUuid() {
  return uuidv1().replace(/-/g, '').slice(0, 32)
}

const request = require("request");
const promisGetRequest = util.promisify(request.get);
const promisPostRequest = util.promisify(request.post);
const promisGetRawBody = util.promisify(getRawBody);

const oss = new OSS({
  region: "oss-cn-beijing",
  bucket: "pulse-assets",
  // endpoint:"https://assets.pulsefitness.club",
  // cname: true,
  secure: true,
  accessKeyId: process.env["SERVICE_KEY"],
  accessKeySecret: process.env["SERVICE_SECRET"]
});

/**
 * expiresIn: 单位是秒，最大为一天86400000
 */
async function internalPutTempData(key, value, expiresIn, db) {
  let tsPutParams = {
    tableName: "temp_session",
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [{ key: key }],
    attributeColumns: [
      {
        [key]: value,
        timestamp: Date.now() - 86400000 + expiresIn * 1000
      }
    ]
  };
  return await db.putRow(tsPutParams)
}

/**
 *  注意：用prod数据库
*/
async function getWxAccessToken(db) {
  const tempSessionPK = [{ [c.DB_TEMP_SESSION_PK1]: "wxAccessToken" }];
  const wxAccessTokenExist = await internalCheckRowExist(
    c.DB_TEMP_SESSION,
    tempSessionPK,
    db
  );
  if (wxAccessTokenExist) {
    return wxAccessTokenExist.token;
  }

  //没有取到，重新申请
  const APPID = process.env["WX_APP_ID"];
  const SECRET = process.env["WX_APP_SECRET"];
  let url =
    "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" +
    APPID +
    "&secret=" +
    SECRET;
  try {
    const wxApiResult = await promisGetRequest(url);
    const wxApiJson = JSON.parse(wxApiResult["body"]);
    await internalPutPlatformAccessToken(
      wxApiJson["access_token"],
      "wx",
      wxApiJson["expires_in"],
      db
    );
    return wxApiJson["access_token"];
  } catch (error) {
    throw newError(c.ERROR_API_WX, JSON.stringify(error));
  }
}

/**
 *  注意：用prod数据库
*/
async function getSwanAccessToken(db) {
  const tempSessionPK = [{ [c.DB_TEMP_SESSION_PK1]: "swAccessToken" }];
  const swAccessTokenExist = await internalCheckRowExist(
    c.DB_TEMP_SESSION,
    tempSessionPK,
    db
  );
  if (swAccessTokenExist) {
    return swAccessTokenExist.token;
  }
  var url = "https://openapi.baidu.com/oauth/2.0/token?grant_type=client_credentials&client_id=" + process.env["SWAN_KEY"] + "&client_secret=" + process.env["SWAN_SECRET"] + "&scope=smartapp_snsapi_base";
  try {
    const swanApiResult = await promisGetRequest(url);
    const apiJson = JSON.parse(swanApiResult["body"]);
    await internalPutPlatformAccessToken(
      apiJson["access_token"],
      "swan",
      apiJson["expires_in"],
      db
    );
    return apiJson["access_token"];
  } catch (error) {
    throw newError(c.ERROR_API_SWAN, " in getSwanAccessToken " + JSON.stringify(error));
  }
}

async function getSwanUnionid(openid, dbProd) {
  const swAccessToken = await getSwanAccessToken(dbProd);
  var requestData = { openid: openid };
  var url =
    "https://openapi.baidu.com/rest/2.0/smartapp/getunionid?access_token=" +
    swAccessToken;
  try {
    const swanApiResult = await promisPostRequest({
      url,
      form: requestData
    });
    const apiJson = JSON.parse(swanApiResult["body"]);
    if (apiJson.errno === 0) {
      return apiJson.data.unionid;
    } else {
      throw newError(c.ERROR_API_SWAN, " can't get swan unionid");
    }
  } catch (error) {
    throw newError(c.ERROR_API_SWAN, " in getSwanUnionid " + JSON.stringify(error));
  }
}

async function internalPutPlatformAccessToken(
  token,
  platform = "wx",
  expires_in,
  db
) {
  if (expires_in > 86400) {
    expires_in = 86400;
  }
  let tsPutParams = {
    tableName: c.DB_TEMP_SESSION,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [{ [c.DB_TEMP_SESSION_PK1]: platform + "AccessToken" }],
    attributeColumns: [
      {
        [c.DB_TEMP_SESSION_COL_TOKEN]: token,
        timestamp:
          Date.now() -
          c.TIME_MILLISECONDS_IN_ONE_DAY +
          (expires_in - 600) * 1000
      }
    ]
  };
  await db.putRow(tsPutParams);
}

async function internalDecodeJscode(jscode) {
  var APPID = process.env["WX_APP_ID"];
  var SECRET = process.env["WX_APP_SECRET"];
  var JSCODE = jscode;
  var url =
    "https://api.weixin.qq.com/sns/jscode2session?appid=" +
    APPID +
    "&secret=" +
    SECRET +
    "&js_code=" +
    JSCODE +
    "&grant_type=authorization_code";
  try {
    const wxApiResult = await promisGetRequest(url);
    const wxApiJson = JSON.parse(wxApiResult["body"]);
    if (wxApiJson.openid || wxApiJson.unionid) {
      return {
        unionid: wxApiJson.unionid,
        openid: wxApiJson.openid,
        session_key: wxApiJson.session_key
      };
    } else {
      throw newError(c.ERROR_API_WX, " inside internalDecodeJscode");
    }
  } catch (error) {
    throw error;
  }
}

async function internalDecodeSwanJscode(jscode) {
  var requestData = {
    client_id: process.env["SWAN_KEY"],
    sk: process.env["SWAN_SECRET"],
    code: jscode
  };
  var url = "https://spapi.baidu.com/oauth/jscode2sessionkey";
  try {
    const swanApiResult = await promisPostRequest({
      url,
      method: "POST",
      json: true,
      encoding: null,
      body: requestData
    });
    const apiJson = swanApiResult["body"];
    if (apiJson.openid) {
      return {
        openid: apiJson.openid,
        session_key: apiJson.session_key
      };
    } else {
      throw newError(c.ERROR_API_SWAN, "can not get openid.");
    }
  } catch (error) {
    throw newError(c.ERROR_API_SWAN, error);
  }
}

/**
 * 检查是否存在某记录；若存在，返回所有col值（不包括pk），若不存在返回null。是一个延时操作。
 */
async function internalCheckRowExist(tablename, pk, db) {
  let getParams = {
    tableName: tablename,
    primaryKey: pk
  };
  const getResult = await db.getRow(getParams);
  if (getResult["row"].hasOwnProperty("attributes")) {
    return internalGetRowAttrs(getResult["row"]);
  } else {
    return null;
  }
}

async function batchWrite(params, db) {
  let batchWriteResultRaw = await db.batchWriteRow(params);
  let batchResult = [];
  batchWriteResultRaw["tables"].forEach(table => {
    batchResult.push(table["isOk"]);
  });
  if (batchResult.includes(false)) {
    throw newError(c.ERROR_DB_BATCH_WRITE_FAIL);
  }
}

function initTableStore(path) {
  let endPoint, instancename;
  switch (path) {
    case "/services":
    case "/stage/services":
      endPoint = "https://PULSE-PROD.cn-beijing.ots.aliyuncs.com";
      instancename = "PULSE-PROD";
      break;
    case "/latest/services":
      endPoint = "https://PULSE-TEST.cn-beijing.ots.aliyuncs.com";
      instancename = "PULSE-TEST";
      break;
    default:
      throw newError(c.ERROR_DB_INIT_FAIL);
  }
  const db = new TableStore.Client({
    accessKeyId: process.env["SERVICE_KEY"],
    secretAccessKey: process.env["SERVICE_SECRET"],
    endpoint: endPoint,
    instancename: instancename
  });
  return db;
}

async function getFcContext(req) {
  let fcContext = {};
  if (req.path == "/services") {
    fcContext.db = initTableStore("/services");
    fcContext.dbProd = fcContext.db
  } else {
    fcContext.db = initTableStore(req.path);
    fcContext.dbProd = initTableStore("/services");
  }

  //获取GET或POST参数
  let queries;
  if (req.method == "POST") {
    const rawBody = await promisGetRawBody(req);
    queries = JSON.parse(rawBody.toString());
  } else {
    queries = req.queries;
  }
  fcContext = { ...fcContext, ...queries, requestPath: req.path, requestQueries: queries, clientIP: req.clientIP };
  console.log(`REQUEST|${req.path}|${req.clientIP}|${JSON.stringify(queries)}`);
  return fcContext;
}

//处理tablestore单行信息，返回该行的属性
function internalGetRowAttrs(row) {
  if (!row) {
    throw newError(c.ERROR_DB_EMPTY_ROW);
  }
  let attrs = {};
  if (!row["attributes"]) {
    return null;
  }
  row["attributes"].forEach(attr => {
    attrs[attr["columnName"]] = attr["columnValue"];
  });
  return attrs;
}

class FCError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "FCError";
  }
}

// 给constants中的error添加具体信息
function newError(error, detail = "") {
  let code = error.errCode;
  let msg = error.message + detail;
  return new FCError(code, msg);
}

// 区分error类别，转变成RespBody
function errorToRespBody(err) {
  if (err instanceof FCError) {
    return {
      errorCode: err.code,
      errorMessage: err.message
    };
  } else {
    return {
      errorCode: c.ERROR_UNDEFINED_CODE,
      errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err))
    };
  }
}

/**
 * 微信官方提供的解密算法
 */
function WXBizDataCrypt(appId, sessionKey) {
  this.appId = appId;
  this.sessionKey = sessionKey;
}
WXBizDataCrypt.prototype.decryptData = function (encryptedData, iv) {
  // base64 decode
  var sessionKey = new Buffer(this.sessionKey, "base64");
  encryptedData = new Buffer(encryptedData, "base64");
  iv = new Buffer(iv, "base64");

  try {
    // 解密
    var decipher = crypto.createDecipheriv("aes-128-cbc", sessionKey, iv);
    // 设置自动 padding 为 true，删除填充补位
    decipher.setAutoPadding(true);
    var decoded = decipher.update(encryptedData, "binary", "utf8");
    decoded += decipher.final("utf8");

    decoded = JSON.parse(decoded);
  } catch (err) {
    throw new Error("Illegal Buffer");
  }
  if (decoded.watermark.appid !== this.appId) {
    throw new Error("Illegal Buffer");
  }
  return decoded;
};

function internalDecryptWXData(session_key, encryptedData, iv) {
  try {
    const appId = process.env["WX_APP_ID"];
    const pc = new WXBizDataCrypt(appId, session_key);
    let data = pc.decryptData(encryptedData, iv);
    return data;
  } catch (error) {
    throw newError(c.ERROR_API_WX, " at internalDecryptWXData" + error);
  }
}

function internalAesEncrypt(data) {
  try {
    const key = process.env["PHONE_SECRET"];
    const cipher = crypto.createCipher("aes192", key);
    var crypted = cipher.update(data, "utf8", "hex");
    crypted += cipher.final("hex");
    return crypted;
  } catch (error) {
    throw newError(c.ERROR_INTERNAL_ENCRYPT, "at internalAesEncrypt");
  }
}

function internalAesDecrypt(encrypted) {
  const key = process.env["PHONE_SECRET"];
  const decipher = crypto.createDecipher("aes192", key);
  var decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const smsClient = new Core({
  accessKeyId: process.env["SERVICE_KEY"],
  accessKeySecret: process.env["SERVICE_SECRET"],
  endpoint: "https://dysmsapi.aliyuncs.com",
  apiVersion: "2017-05-25"
});

async function internalStaffNotify(type, info, dbProd) {
  let template_id
  let data
  let cardUrl
  switch (type) {
    case "WORKOUT_COMPLETE":
      template_id = "sIItQxXyshno_OvVgPWk-bNgswI4V7VDcVBVVtmC1L8";
      let { workoutTitle, workoutType, uuid, wid, duration } = info
      duration = Math.ceil(duration / 60) + "分钟"
      data = {
        first: { value: "用户完成了一次训练！" },
        keyword1: { value: duration },
        keyword2: { value: workoutTitle },
        keyword3: { value: workoutType },
      }
      cardUrl = "http://api.pulsefitness.club/services?type=INTERNAL_WORKOUT_COMPLETE_INFO&uid=" + uuid + "&wid=" + wid + "&wTitle=" + workoutTitle + "&wType=" + workoutType + "&wDuration=" + duration
      break;
    default:
      break;
  }
  const accessToken = await internalGetWXServiceAccountAccessToken(dbProd)
  const url =
    "https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=" +
    accessToken;

  const openidList = ["oYNYs6CBpCYmgXG7Owl06HbdoJuc", "oYNYs6BxD-okJqKJFi-29RACWT0I"]
  try {
    for (let index = 0; index < openidList.length; index++) {
      let reqestData = {
        touser: openidList[index],
        template_id: template_id,
        data: data,
        url: cardUrl
      };
      await axios.post(url, reqestData)
    }
  } catch (error) {
    console.log("Error internalStaffNotify" + JSON.stringify(error));
  }
}

/**
 *  注意：用prod数据库
*/
async function internalGetWXServiceAccountAccessToken(db) {
  const accessTokenExist = await internalCheckRowExist("temp_session", [{ key: "wxServiceAccountAccessToken" }], db)
  if (accessTokenExist) {
    return accessTokenExist.wxServiceAccountAccessToken
  } else {
    const apiUrl = "http://47.95.129.220:8090/cgi-bin/token?grant_type=client_credential&appid=" + process.env["WX_SERVICE_ACCOUNT_ID"] + "&secret=" + process.env["WX_SERVICE_ACCOUNT_SECRET"]
    const result = await axios.get(apiUrl, {}, {
      auth: {
        username: "fc",
        password: process.env["WX_PROXY_KEY"]
      }
    })
    const { access_token, expires_in } = result.data
    if (access_token) {
      await internalPutTempData("wxServiceAccountAccessToken", access_token, expires_in - 60, db)
      return access_token
    } else {
      console.log("Fail put temp data: wxServiceAccountAccessToken ");
      // internalThrowError(c.ERROR_FAIL_API, result)
    }
  }
}

/**
 *  通用的修改表操作。有乐观锁。不需要传入新的updatedAt
*/
async function internalOptimisticUpdate(tableName, pk, updatedAt, data, db) {
  const currentTimestamp = Date.now()
  let updateData = [{ updatedAt: currentTimestamp }]
  for (let attr in data) {
    if (data.hasOwnProperty(attr) && data[attr]) {
      updateData.push({ [attr]: data[attr] });
    }
  }
  let condition = new TableStore.SingleColumnCondition('updatedAt', updatedAt, TableStore.ComparatorType.EQUAL);

  let updateParams = {
    tableName: tableName,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, condition),
    primaryKey: pk,
    updateOfAttributeColumns: [{ PUT: updateData }]
  };

  try {
    await db.updateRow(updateParams);
    return true;
  } catch (error) {
    throw newError(
      c.ERROR_DB_UPDATE_FAIL,
      "while internalOptimisticUpdate in " + tableName + JSON.stringify(error, Object.getOwnPropertyNames(error))
    );
  }
}

/**
 *  通用的写表操作。不需要传入updatedAt（用于乐观锁）
*/
async function internalInsertRow(tableName, pk, data = {}, db) {
  const currentTimestamp = Date.now()
  let attributeColumns = [{ updatedAt: currentTimestamp }]
  for (let attr in data) {
    if (data.hasOwnProperty(attr) && data[attr]) {
      attributeColumns.push({ [attr]: data[attr] });
    }
  }
  let params = {
    tableName: tableName,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,
      null
    ),
    primaryKey: pk,
    attributeColumns: attributeColumns
  };
  try {
    await db.putRow(params);
    return true;
  } catch (error) {
    throw newError(
      c.ERROR_DB_WRITE_FAIL,
      "while internalInsertRow in " + tableName + JSON.stringify(error, Object.getOwnPropertyNames(error))
    );
  }
}

async function internalUserActivityNotify({ type, uuid, wid, sessionId = "", requestPath, startType }) {
  let detailUrl = ""
  switch (requestPath) {
    case "/services":
      detailUrl = "https://api.pulsefitness.club/services"
      break;
    case "/stage/services":
      detailUrl = "https://api.pulsefitness.club/stage/services"
      break;
    case "/latest/services":
      // detailUrl = "https://api.pulsefitness.club/latest/services"
      return
      break;
    default:
      break;
  }
  detailUrl = `${detailUrl}?type=INTERNAL_USER_ACTIVITY_DETAIL&uuid=${uuid}&wid=${wid}&aType=${type}`
  if (sessionId) {
    detailUrl = `${detailUrl}&sessionId=${sessionId}`
  }
  if (startType && startType == "RESUME_SESSION") {
    detailUrl = `${detailUrl}&resumeSession=true`
  }
  let content =
    `## 用户行为通知\n
  >行为类型:<font color=\"comment\">${type}</font>
  > 
  >[行为详细](${detailUrl})`

  var url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${process.env["BOT_USER_ACTIVITY_KEY"]}`;
  await axios.post(url, {
    "msgtype": "markdown",
    "markdown": {
      "content": content
    }
  })
}

async function internalErrorNotify({ errorCode, errorMessage }, {requestPath, requestQueries, clientIP} ) {
  //如果是WXO、WXU、refreshToken的报错，或者来自test环境的报错，不需要发给机器人报警。 
  if (errorCode == 4011 || errorCode == 4012 || errorCode == 4013 || requestPath == "/latest/services") {
    return
  }
  let content =
    `## 后台报错\n
  >ERROR CODE:<font color=\"warning\">${errorCode}</font>
  > 
  >CLIENT_IP:<font color=\"info\">${clientIP} </font>
  > 
  >QUERIES:<font color=\"info\">${JSON.stringify(requestQueries)} </font>
  > 
  >ERROR MESSAGE:<font color=\"info\">${errorMessage}</font>`

  var url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${process.env["BOT_ERROR_LOG_KEY"]}`;
  await axios.post(url, {
    "msgtype": "markdown",
    "markdown": {
      "content": content
    }
  })
}

function internalWorkoutTypeDisplay(key) {
  let types = {
    treadmill: "跑步机",
    outdoor_running: "户外跑",
    elliptical: "椭圆仪",
    indoor_cycling: "室内单车",
    rowing: "划船机",
    strength: "力量训练",
    stretching: "拉伸",
  }
  return types[key] || key
}

exports.oss = oss;
exports.smsClient = smsClient;
exports.getFcContext = getFcContext;
exports.internalDecryptWXData = internalDecryptWXData;
exports.internalAesEncrypt = internalAesEncrypt;
exports.internalAesDecrypt = internalAesDecrypt;
exports.batchWrite = batchWrite;
exports.internalGetRowAttrs = internalGetRowAttrs;
exports.internalCheckRowExist = internalCheckRowExist;
exports.promisGetRequest = promisGetRequest;
exports.promisPostRequest = promisPostRequest;
exports.getWxAccessToken = getWxAccessToken;
exports.getSwanUnionid = getSwanUnionid;
exports.internalDecodeJscode = internalDecodeJscode;
exports.internalDecodeSwanJscode = internalDecodeSwanJscode;
exports.newError = newError;
exports.errorToRespBody = errorToRespBody;
exports.internalErrorNotify = internalErrorNotify;
exports.internalPutTempData = internalPutTempData;
exports.localUuid = localUuid;
exports.internalStaffNotify = internalStaffNotify;
exports.internalOptimisticUpdate = internalOptimisticUpdate;
exports.internalInsertRow = internalInsertRow;
exports.internalUserActivityNotify = internalUserActivityNotify;
exports.internalWorkoutTypeDisplay = internalWorkoutTypeDisplay;
