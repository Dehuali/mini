"use strict";
const {
  newError,
  internalGetRowAttrs,
  internalCheckRowExist,
  internalDecodeJscode,
  internalDecryptWXData,
  smsClient,
  internalAesEncrypt,
  internalAesDecrypt,
  internalDecodeSwanJscode,
} = require("./fc-utils");
const c = require("./constants");
const TableStore = require("tablestore");

async function updateUserProfile({ uuid, userProfile, db }) {
  let updateData = []
  userProfile = JSON.parse(userProfile)
  for (let attr in userProfile) {
    updateData.push({ [attr]: userProfile[attr] });
  }
  console.log("updateData===", updateData);

  var params = {
    tableName: c.DB_USER_PROFILE,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
    primaryKey: [{ uuid: uuid }],
    updateOfAttributeColumns: [{ PUT: updateData }],
  };
  await db.updateRow(params)
  return { submitResult: "SUCCESS" }
}

async function getCurrentUserProfile({ uuid, db, userProfileType }) {
  var params = {
    tableName: c.DB_USER_PROFILE,
    primaryKey: [{ uuid: uuid }],
    maxVersions: 1
  };
  let result = await db.getRow(params)
  let userProfile = internalGetRowAttrs(result.row)
  if (userProfileType && userProfile[userProfileType]) {
    return { [userProfileType]: userProfile[userProfileType] }
  } else {
    return userProfile
  }
}

async function getHistoryUserProfile({ uuid, db, maxVersions = 10, userProfileType }) {
  var params = {
    tableName: c.DB_USER_PROFILE,
    primaryKey: [{ uuid: uuid }],
    maxVersions: Math.max(maxVersions, 20)
  };
  let result = await db.getRow(params)
  // console.log("result==", result);
  let userProfile = {}
  result.row.attributes.forEach(attr => {
    let type = attr.columnName
    if (!userProfile[type]) {
      userProfile[type] = [{ value: attr.columnValue, timestamp: Number(attr.timestamp) }]
    } else {
      userProfile[type].push({ value: attr.columnValue, timestamp: Number(attr.timestamp) })
    }
  });
  if (userProfileType && userProfile[userProfileType]) {
    return userProfile[userProfileType]
  } else {
    return userProfile
  }
}

async function getFitnessReport({ uuid, db }) {
  let userProfile = await internalCheckRowExist("user_profile", [{ uuid: uuid }], db)
  if(!userProfile){
    // 没有做过体测报告，返回空。不需要报错。
    return
  }
  let { gender, height, weight, year } = userProfile
  year = Number(year)
  height = Number(height) / 100
  weight = Number(weight)
  
  let thisDate = new Date();
  let thisYear = thisDate.getFullYear();

  const age = thisYear - year //TODO
  console.log("age==", age);

  let bmi = (weight / height / height)

  let mhr = Math.min((206.9 - (0.67 * age)), (208 - (0.7 * age)))

  let bmr = 9.99 * weight + 625 * height - 4.92 * age
  switch (gender) {
    case "MALE":
      bmr = bmr + 5
      break;
    default:
      bmr = bmr - 161
      break;
  }
  // 保留小数点位数不同
  bmi = Math.round(bmi * 10) / 10;
  mhr = Math.round(mhr);
  bmr = Math.round(bmr);

  if (userProfile) {
    return { bmi: bmi, mhr: mhr, bmr: bmr }
  } else {
    return null
  }
}

/**
 * TYPE_SEND_AUTH_CODE_TO_WX_BINDED_PHONE
 * 解密微信加密信息，取手机号。调用sendAuthCode函数
 */
async function sendAuthCodeToWXBindedPhone({ jscode, encryptedData, iv, db }) {
  if (!jscode || !encryptedData || !iv) {
    throw newError(
      c.ERROR_MISS_REQUIRED_PARAMETER,
      "jscode, encryptedData, iv"
    );
  }
  const { session_key } = await internalDecodeJscode(jscode);
  const decryptedData = internalDecryptWXData(session_key, encryptedData, iv);

  const phoneNumber = decryptedData.phoneNumber;
  if (!phoneNumber) {
    throw newError(c.ERROR_API_WX, " fail geting phoneNumber from WX");
  }
  return await sendAuthCode({ phoneNumber: phoneNumber, db: db });
}

/**
 * 如果此手机没有绑定用户，给该手机号发验证码。TYPE_SEND_AUTH_CODE_TO_NEW_PHONE
 */
async function sendAuthCode({ phoneNumber, db }) {
  if (!phoneNumber) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, " phoneNumber");
  }
  // 判断新手机号是否已经被注册
  const phoneNumberPK = [
    { [c.DB_PHONE_NUMBER_PK1]: internalAesEncrypt(phoneNumber) }
  ];
  const phoneNumberExist = await internalCheckRowExist(
    c.DB_PHONE_NUMBER,
    phoneNumberPK,
    db
  );
  if (phoneNumberExist) {
    throw newError(c.ERROR_DUPLICATED_PHONE_NUMBER);
  }
  // 发送验证码
  const sendResult = await internalSendSms(phoneNumber, db);
  if (sendResult.Code == "OK") {
    return { smsSend: "success", phoneNumber: phoneNumber };
  } else {
    throw newError(c.ERROR_SMS_AUTH_CODE_SEND_FAIL, sendResult.Message);
  }
}

async function bindPhoneNumber(meta) {
  const { phoneNumber, smsCode, uuid, force = false, db } = meta;
  if (!phoneNumber || !smsCode) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, " phoneNumber or smsCode");
  }
  // 判断新手机号是否已经被注册
  const phoneNumberPK = [
    { [c.DB_PHONE_NUMBER_PK1]: internalAesEncrypt(phoneNumber) }
  ];
  const phoneNumberExist = await internalCheckRowExist(
    c.DB_PHONE_NUMBER,
    phoneNumberPK,
    db
  );
  if (phoneNumberExist) {
    throw newError(c.ERROR_DUPLICATED_PHONE_NUMBER);
  }
  // 查验证码表
  const smsAuthCodePK = [
    { [c.DB_SMS_AUTH_CODE_PK1]: internalAesEncrypt(phoneNumber) }
  ];
  const smsAuthCodeExist = await internalCheckRowExist(
    c.DB_SMS_AUTH_CODE,
    smsAuthCodePK,
    db
  );
  // 错误手机号或者验证码过期
  if (!smsAuthCodeExist) {
    throw newError(
      c.ERROR_SMS_AUTH_CODE_EMPTY,
      " Code Expired or Wrong Phone Number"
    );
  }
  // 验证码错误
  if (smsCode != smsAuthCodeExist.smsCode) {
    throw newError(c.ERROR_SMS_AUTH_CODE_WRONG);
  }
  // 判断该uuid之前是否有绑定手机号
  const userInfo = await getUserInfo({ uuid: uuid, db: db });
  if (userInfo.phoneNumber) {
    if (!force) {
      throw newError(c.ERROR_THIS_UUID_ALREADY_HAVE_PHONE_NUMBER);
    } else {
      const oldPhoneNumber = userInfo.phoneNumber;
      // 在phoneNumber表中删除
      await internalDeletePhoneNumber(oldPhoneNumber, db);
      // 发送解绑通知
      await internalSendUnbindSms(internalAesDecrypt(oldPhoneNumber), db);
    }
  }

  // 保存新手机号
  await internalPutPhoneNumber(phoneNumber, uuid, db);
  // 更新到user表
  await updateUserInfo({
    uuid: uuid,
    info: { phoneNumber: internalAesEncrypt(phoneNumber) },
    db: db
  });
  return { phoneNumber: phoneNumberDisplay(phoneNumber) };
}

function phoneNumberDisplay(number = "") {
  return number.substr(0, 3) + "****" + number.substr(7);
}

async function checkToken({ token, db }) {
  if (!token) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "token");
  }
  const tokenPK = [{ [c.DB_TOKENS_PK1]: token }];
  const tokenInfo = await internalCheckRowExist(c.DB_TOKENS, tokenPK, db);
  if (!tokenInfo) {
    throw newError(c.ERROR_TOKEN_NOT_EXIST);
  } else if (!tokenInfo.openid) {
    throw newError(c.ERROR_TOKEN_NOT_EXIST);
  }

  if (tokenInfo.expiredAt > Date.now()) {
    return tokenInfo.uuid;
  } else {
    throw newError(c.ERROR_TOKEN_EXPIRED);
  }
}

async function getUserInfo({ uuid, db }) {
  if(!uuid){
    return null
  }
  const userInfo = await internalCheckRowExist(c.DB_USERS, [{ [c.DB_USERS_PK1]: uuid }], db)
  if (!userInfo) {
    throw newError(c.ERROR_DB_READ_EMPTY, "users " + uuid);
  }
  userInfo._id = uuid;
  return userInfo;
}

async function getPhoneNumberDisplay({ uuid, db }) {
  const userInfo = await getUserInfo({ uuid, db })
  let encryptedPhoneNumber = userInfo.phoneNumber
  try {
    let phoneNumber = internalAesDecrypt(encryptedPhoneNumber)
    return { phoneNumber: phoneNumberDisplay(phoneNumber) }
  } catch (error) {
    return { phoneNumber: null }
  }
}

async function getUserInfobyID({ id, db }) {
  if (!id) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "id");
  }
  return await getUserInfo({ uuid: id, db: db })
}

async function updateUserInfo({ uuid, info, db }) {
  if (!uuid || !info) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "info");
  }
  let updateData = [];
  for (let attr in info) {
    updateData.push({ [attr]: info[attr] });
  }
  let updateParams = {
    tableName: c.DB_USERS,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_EXIST,
      null
    ),
    primaryKey: [{ [c.DB_USERS_PK1]: uuid }],
    updateOfAttributeColumns: [
      {
        PUT: updateData
      }
    ]
  };
  const updateResult = await db.updateRow(updateParams);
  if (!updateResult.hasOwnProperty("row")) {
    throw newError(c.ERROR_DB_UPDATE_FAIL, "uuid, while updateUserInfo");
  } else {
    return await getUserInfo({ uuid: uuid, db: db });
  }
}

async function internalSendSms(phoneNumber, db) {
  // 创建验证码
  const smsCode = Math.random().toFixed(4).slice(-4);
  const sendParams = {
    PhoneNumbers: phoneNumber,
    SignName: "带你练",
    TemplateCode: "SMS_176912828",
    TemplateParam: JSON.stringify({ code: smsCode })
  };
  const sendSmsOption = {
    method: "POST"
  };
  const sendResult = await smsClient.request(
    "SendSms",
    sendParams,
    sendSmsOption
  );
  // 保存sms_auth_code。数据3分钟后自动清除
  try {
    await internalPutSmsCode(phoneNumber, smsCode, db);
    return sendResult;
  } catch (error) {
    throw newError(c.ERROR_SMS_AUTH_CODE_SEND_FAIL, JSON.stringify(error, Object.getOwnPropertyNames(error)))
  }
}

async function internalSendUnbindSms(phoneNumber) {
  const sendParams = {
    PhoneNumbers: phoneNumber,
    SignName: "带你练",
    TemplateCode: "SMS_182683816",
    TemplateParam: JSON.stringify({ endNum: phoneNumber.slice(-4) })
  };
  const sendSmsOption = {
    method: "POST"
  };
  const sendResult = await smsClient.request(
    "SendSms",
    sendParams,
    sendSmsOption
  );
  return sendResult;
}

async function internalPutPhoneNumber(phoneNumber, uuid, db) {
  let tsPutParams = {
    tableName: c.DB_PHONE_NUMBER,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,
      null
    ),
    primaryKey: [{ [c.DB_PHONE_NUMBER_PK1]: internalAesEncrypt(phoneNumber) }],
    attributeColumns: [{ [c.DB_PHONE_NUMBER_COL_UUID]: uuid }]
  };
  await db.putRow(tsPutParams);
}

async function internalDeletePhoneNumber(phoneNumber, db) {
  let deleteParams = {
    tableName: c.DB_PHONE_NUMBER,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [{ [c.DB_PHONE_NUMBER_PK1]: phoneNumber }]
  };
  await db.deleteRow(deleteParams, function (err, data) {
    if (err) {
      throw err;
    }
    return;
  });
}

async function internalPutSmsCode(phoneNumber, smsCode, db) {
  let tsPutParams = {
    tableName: c.DB_SMS_AUTH_CODE,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [{ [c.DB_SMS_AUTH_CODE_PK1]: internalAesEncrypt(phoneNumber) }],
    attributeColumns: [
      {
        [c.DB_SMS_AUTH_CODE_COL_SMS_CODE]: smsCode,
        timestamp: Date.now() - (86400 - 600) * 1000 //目前是600秒（十分钟）有效。
      }
    ]
  };
  await db.putRow(tsPutParams);
}

// async function decodeShareTicket({ groupInfo }) {
//   return groupInfo;
// }

module.exports.checkToken = checkToken;
module.exports.updateUserInfo = updateUserInfo;
module.exports.getUserInfo = getUserInfo;

exports.register = function (reg) {
  reg(c.TYPE_GET_USER_INFO, getUserInfo);
  reg(c.TYPE_GET_USER_INFO_BY_ID, getUserInfobyID);
  reg(c.TYPE_UPDATE_USER_INFO, updateUserInfo);
  reg(c.TYPE_BIND_PHONE, bindPhoneNumber);
  reg(c.TYPE_GET_PHONE_NUMBER_DISPLAY, getPhoneNumberDisplay);
  reg(c.TYPE_SEND_AUTH_CODE_TO_NEW_PHONE, sendAuthCode);
  reg(c.TYPE_SEND_AUTH_CODE_TO_WX_BINDED_PHONE, sendAuthCodeToWXBindedPhone);
  reg(c.TYPE_UPDATE_USER_PROFILE, updateUserProfile);
  reg(c.TYPE_GET_CURRENT_USER_PROFILE, getCurrentUserProfile);
  reg(c.TYPE_GET_HISTORY_USER_PROFILE, getHistoryUserProfile);
  reg(c.TYPE_GET_FITNESS_REPORT, getFitnessReport);
  // reg(constants.TYPE_DECODE_SHARE_TICKET, decodeShareTicket);
};
