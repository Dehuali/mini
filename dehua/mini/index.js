"use strict";
const anonymous = require("./anonymous");
const workouts = require("./workouts");
const users = require("./users");
const constants = require("./constants");
const { newError, errorToRespBody, getFcContext, internalErrorNotify } = require("./fc-utils");

const fcHandlers = {};
function registerServiceHandler(type, fcHandler) {
  fcHandlers[type] = fcHandler;
}

workouts.register(registerServiceHandler);
users.register(registerServiceHandler);

module.exports.handler = async function (req, resp, context) {
  resp.setHeader("content-type", "application/json; charset=utf-8");
  //respBody是FC HTTP触发器的返回参数
  let respBody = {};
  respBody.errorCode = 0;
  respBody.errorMessage = "OK";
  //fcContext包含请求queries(包括type、token等信息)、db（根据请求的path区分db环境）等上下文参数
  let fcContext = {};
  try {
    fcContext = await getFcContext(req);
    let type = fcContext.type
    if (type && type in anonymous.types) {
      let anonymousHandler = anonymous.types[type];
      respBody.data = await anonymousHandler(fcContext);
    } else if (type && type in fcHandlers) {
      fcContext.uuid = await users.checkToken(fcContext);
      fcContext.resp = resp
      let fcHandler = fcHandlers[type];
      respBody.data = await fcHandler(fcContext);
    } else {
      throw newError(constants.ERROR_UNSUPPORTED_TYPE, type);
    }
    if (respBody.data && Buffer.isBuffer(respBody.data)) {
      console.log(`SUCCESS BUFFER`);
      resp.send(respBody.data);
    } else {
      console.log(`SUCCESS JSON`);
      resp.send(JSON.stringify(respBody, null, "    "));
    }
  } catch (error) {
    let logFcContext = { ...fcContext, db: null, dbProd: null }
    console.error(`ERROR|${fcContext.clientIP}|${JSON.stringify(logFcContext)}|${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    respBody = errorToRespBody(error);
    await internalErrorNotify(respBody, fcContext)
    resp.send(JSON.stringify(respBody, null, "    "));
  }
};
