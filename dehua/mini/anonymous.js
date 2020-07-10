"use strict";
const {
  newError,
  internalGetRowAttrs,
  internalCheckRowExist,
  internalDecodeJscode,
  internalDecryptWXData,
  internalAesDecrypt,
  internalDecodeSwanJscode,
  getSwanUnionid,
  localUuid,
  internalWorkoutTypeDisplay,
} = require("./fc-utils");
const { getUserInfo, updateUserInfo } = require("./users");
const {
  getReferUserWorkout,
  internalGetWorkoutInfo,
} = require("./workouts");
const c = require("./constants");
const TableStore = require("tablestore");
const moment = require('moment-timezone');
moment.tz.setDefault("Asia/Shanghai");

/**
 * 通过jscode拿到openid，通过查openid表判断返回的匿名token绑定新的uuid还是旧的uuid。
 * 若openid exist，token绑定之前的uuid。users，openid不新增条目
 * 若openid not exist，token绑定新uuid。users，openid新增条目
 */
async function handleLoginWXO({ jscode, db }) {
  if (!jscode) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "jscode");
  }
  //解析jscode
  const { openid } = await internalDecodeJscode(jscode);
  //组装token
  const newAccessToken = localUuid();
  const newRefreshToken = localUuid();
  const tomorrowTimestamp = Date.now() + c.TIME_MILLISECONDS_IN_ONE_DAY;
  const loginResult = {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiredAt: tomorrowTimestamp,
    anonymous: true
  };
  //查openid表,判断是否存在
  const openidPK = [{ [c.DB_OPENID_PK1]: openid }, { [c.DB_OPENID_PK2]: "wx" }];
  const openidExist = await internalCheckRowExist("openid", openidPK, db);
  if (openidExist) {
    // 关联旧uuid
    loginResult.uuid = openidExist.uuid;
  } else {
    // 创建新uuid；users、openid、tokens各add一条记录；
    const newUuid = localUuid();
    const scode = await internalGetAndUpdateScode("users", db);
    await internalAddNewUser(newUuid, scode, db);
    await internalPutOpenID(openid, "wx", newUuid, db);
    loginResult.uuid = newUuid;
  }
  await internalAddToken({ ...loginResult, openid: openid, db: db });
  return loginResult;
}

/**
 * 非匿名登陆。获得unionid，将其绑定到uuid；返回非匿名token和userInfo
 */
async function handleLoginWXU({ jscode, userInfo, encryptedData, iv, db }) {
  if (!jscode) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "jscode");
  }
  //解析jscode
  let { openid, unionid, session_key } = await internalDecodeJscode(jscode);
  // 查openid表
  let uuid = null;
  const openidPK = [{ [c.DB_OPENID_PK1]: openid }, { [c.DB_OPENID_PK2]: "wx" }];
  const openidExist = await internalCheckRowExist("openid", openidPK, db);
  if (!openidExist) {
    // 新建user
    uuid = localUuid();
    const scode = await internalGetAndUpdateScode("users", db);
    await internalAddNewUser(uuid, scode, db);
    await internalPutOpenID(openid, "wx", uuid, db);
  } else {
    uuid = openidExist.uuid;
  }
  // 若用户之前没有关注公众号，需要解密取unionid
  if (!unionid) {
    let decryptedData = internalDecryptWXData(session_key, encryptedData, iv);
    unionid = decryptedData.unionId;
  }
  // 保存unionid，更新用户信息
  await internalPutUnionID(unionid, uuid, "wx", db);
  await updateUserInfo({ uuid: uuid, info: userInfo, db: db });

  // 判断之前是否保存了手机号
  const userInfoDB = await getUserInfo({ uuid: uuid, db: db });
  if (userInfoDB.phoneNumber) {
    var phoneNumber = internalAesDecrypt(userInfoDB.phoneNumber);
    userInfo.phoneNumber = phoneNumberDisplay(phoneNumber);
  }

  //组装非匿名token
  const newAccessToken = localUuid();
  const newRefreshToken = localUuid();
  const tomorrowTimestamp = Date.now() + c.TIME_MILLISECONDS_IN_ONE_DAY;
  const token = {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiredAt: tomorrowTimestamp,
    anonymous: false
  };
  await internalAddToken({ ...token, uuid: uuid, openid: openid, db: db });
  return {
    ...token,
    userInfo: userInfo,
    uuid: uuid
  };
}

async function handleLoginSWO({ jscode, db }) {
  if (!jscode) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "jscode");
  }
  //解析jscode
  const { openid } = await internalDecodeSwanJscode(jscode);
  //组装token
  const newAccessToken = localUuid();
  const newRefreshToken = localUuid();
  const tomorrowTimestamp = Date.now() + c.TIME_MILLISECONDS_IN_ONE_DAY;
  const loginResult = {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiredAt: tomorrowTimestamp,
    anonymous: true
  };

  //查openid表,判断是否存在
  const openidPK = [{ [c.DB_OPENID_PK1]: openid }, { [c.DB_OPENID_PK2]: "swan" }];
  const openidExist = await internalCheckRowExist("openid", openidPK, db);
  if (openidExist) {
    // 关联旧uuid
    loginResult.uuid = openidExist.uuid;
  } else {
    // 创建新uuid；users、openid、tokens各add一条记录；
    const newUuid = localUuid();
    const scode = await internalGetAndUpdateScode("users", db);
    await internalAddNewUser(newUuid, scode, db);
    await internalPutOpenID(openid, "swan", newUuid, db);
    loginResult.uuid = newUuid;
  }
  await internalAddToken({ ...loginResult, openid: openid, db: db });
  return loginResult;
}

async function handleLoginSWD({ swanId, db }) {
  if (!swanId) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "swanId");
  }

  //组装token
  const newAccessToken = localUuid();
  const newRefreshToken = localUuid();
  const tomorrowTimestamp = Date.now() + c.TIME_MILLISECONDS_IN_ONE_DAY;
  const loginResult = {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiredAt: tomorrowTimestamp,
    anonymous: true
  };

  //查openid表,判断是否存在
  const openidPK = [{ [c.DB_OPENID_PK1]: swanId }, { [c.DB_OPENID_PK2]: "swan" }];
  const openidExist = await internalCheckRowExist("openid", openidPK, db);
  if (openidExist) {
    // 关联旧uuid
    loginResult.uuid = openidExist.uuid;
  } else {
    // 创建新uuid；users、openid、tokens各add一条记录；
    const newUuid = localUuid();
    const scode = await internalGetAndUpdateScode("users", db);
    await internalAddNewUser(newUuid, scode, db);
    await internalPutOpenID(swanId, "swan", newUuid, db);
    loginResult.uuid = newUuid;
  }
  await internalAddToken({ ...loginResult, openid: swanId, db: db });
  return loginResult;
}

async function handleLoginSWU({ jscode, userInfo, db, dbProd }) {
  if (!jscode) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "jscode");
  }
  //解析jscode
  let { openid } = await internalDecodeSwanJscode(jscode);
  // 查openid表
  let uuid;
  const openidPK = [{ [c.DB_OPENID_PK1]: openid }, { [c.DB_OPENID_PK2]: "swan" }];
  const openidExist = await internalCheckRowExist("openid", openidPK, db);
  if (!openidExist) {
    // 新建user
    uuid = localUuid();
    const scode = await internalGetAndUpdateScode("users", db);
    await internalAddNewUser(uuid, scode, db);
    await internalPutOpenID(openid, "swan", uuid, db);
  } else {
    uuid = openidExist.uuid;
  }

  // 获取unionid
  const unionid = await getSwanUnionid(openid, dbProd);
  await internalPutUnionID(unionid, uuid, "swan", db);
  // 更新用户信息
  await updateUserInfo({ uuid: uuid, info: userInfo, db: db });

  // 判断之前是否保存了手机号
  const userInfoDB = await getUserInfo({ uuid: uuid, db: db });
  if (userInfoDB.phoneNumber) {
    var phoneNumber = internalAesDecrypt(userInfoDB.phoneNumber);
    userInfo.phoneNumber = phoneNumberDisplay(phoneNumber);
  }

  //组装非匿名token
  const newAccessToken = localUuid();
  const newRefreshToken = localUuid();
  const tomorrowTimestamp = Date.now() + c.TIME_MILLISECONDS_IN_ONE_DAY;
  const token = {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiredAt: tomorrowTimestamp,
    anonymous: false
  };
  await internalAddToken({ ...token, uuid: uuid, openid: openid, db: db });
  return {
    ...token,
    userInfo: userInfo,
    uuid: uuid
  };
}

async function handleRefreshToken(meta) {
  const { accessToken, refreshToken, anonymous, db } = meta;
  if (!refreshToken) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "refreshToken");
  }
  let tokenPK = [{ [c.DB_TOKENS_PK1]: accessToken }];
  let tokenExist = await internalCheckRowExist(c.DB_TOKENS, tokenPK, db);
  if (!tokenExist) {
    throw newError(c.ERROR_TOKEN_NOT_EXIST, " while handleRefreshToken");
  }
  const ts_refreshToken = tokenExist[c.DB_TOKENS_COL_REF_TOKEN];
  const uuid = tokenExist[c.DB_TOKENS_COL_UUID];
  if (refreshToken == ts_refreshToken) {
    let tsUpdateParams = {
      tableName: c.DB_TOKENS,
      condition: new TableStore.Condition(
        //表示只有此行存在时，才会修改成功
        TableStore.RowExistenceExpectation.EXPECT_EXIST,
        null
      ),
      primaryKey: [{ [c.DB_TOKENS_PK1]: accessToken }],
      updateOfAttributeColumns: [
        {
          PUT: [
            {
              [c.DB_TOKENS_COL_EXPIRED_AT]: TableStore.Long.fromNumber(
                Date.now() + 30 * c.TIME_MILLISECONDS_IN_ONE_DAY
              )
            },
            {
              [c.DB_TOKENS_COL_REF_TOKEN]: "USED at:" + Date.now()
            }
          ]
        }
      ]
    };
    await db.updateRow(tsUpdateParams);
    return {
      accessToken: accessToken,
      refreshToken: "USED",
      expiredAt: Date.now() + 30 * c.TIME_MILLISECONDS_IN_ONE_DAY,
      anonymous: anonymous,
      uuid: uuid
    };
  } else {
    // refreshToken不匹配或者已经使用过. 匿名用户申请新的AccessToken，注册用户重新输入密码；
    throw newError(c.ERROR_TOKEN_IS_USED);
  }
}

async function internalAddToken(meta) {
  const { accessToken, db } = meta;
  const attributeColumns = [];
  for (let attr in meta) {
    if (attr != "db" && attr != "accessToken") {
      attributeColumns.push({ [attr]: meta[attr] });
    }
  }
  let tsPutParams = {
    tableName: c.DB_TOKENS,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,
      null
    ),
    primaryKey: [{ [c.DB_TOKENS_PK1]: accessToken }],
    attributeColumns: attributeColumns
  };
  await db.putRow(tsPutParams);
}

async function internalPutUnionID(unionid, uuid, platform, db) {
  let tsPutParams = {
    tableName: c.DB_UNIONID,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [
      { [c.DB_UNIONID_PK1]: unionid },
      { [c.DB_UNIONID_PK2]: platform }
    ],
    attributeColumns: [{ [c.DB_UNIONID_COL_UUID]: uuid }]
  };
  await db.putRow(tsPutParams);
}

async function internalPutOpenID(openid, platform, uuid, db) {
  let tsPutParams = {
    tableName: c.DB_OPENID,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [
      { [c.DB_OPENID_PK1]: openid },
      { [c.DB_OPENID_PK2]: platform }
    ],
    attributeColumns: [{ [c.DB_OPENID_COL_UUID]: uuid }]
  };
  await db.putRow(tsPutParams);
}

async function internalAddNewUser(uuid, scode, db) {
  let tsPutParams = {
    tableName: c.DB_USERS,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,
      null
    ),
    primaryKey: [{ [c.DB_USERS_PK1]: uuid }],
    attributeColumns: [
      {
        [c.DB_USERS_COL_SCODE]: TableStore.Long.fromNumber(scode)
      },
      { [c.DB_USERS_COL_CREATED_AT]: Date.now() }
    ]
  };
  await db.putRow(tsPutParams);
}

async function internalGetAndUpdateScode(colName, db) {
  if (!colName) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "colName");
  }
  const getScodeParams = {
    tableName: c.DB_SCODE,
    primaryKey: [{ [c.DB_SCODE_PK1]: colName }]
  };
  const getRowResult = await db.getRow(getScodeParams);
  if (!getRowResult["row"].hasOwnProperty("attributes")) {
    throw newError(c.ERROR_DB_READ_EMPTY, "scode");
  }
  const scode = Number(getRowResult["row"]["attributes"][0]["columnValue"]);
  const updateParams = {
    tableName: c.DB_SCODE,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_EXIST,
      null
    ),
    primaryKey: [{ [c.DB_SCODE_PK1]: colName }],
    updateOfAttributeColumns: [
      {
        INCREMENT: [{ [c.DB_SCODE_COL_SCODE]: TableStore.Long.fromNumber(1) }]
      }
    ]
  };
  try {
    await db.updateRow(updateParams);
    return scode;
  } catch (error) {
    throw newError(c.ERROR_DB_UPDATE_FAIL, "scode");
  }
}

function phoneNumberDisplay(number = "") {
  return number.substr(0, 3) + "****" + number.substr(7);
}

async function internalGetWorkoutCompleteInfo({ uid, wid, wTitle, wType, wDuration, db }) {
  let result = {}
  let userWorkoutInfo = await getReferUserWorkout({ wid, uid, db })
  let createdAt = new Date(Number(userWorkoutInfo.userInfo.createdAt))
  let vipExpiredAt = userWorkoutInfo.userInfo.vipExpiredAt || null
  let wTokenExpiredAt = userWorkoutInfo.maxTokenExpiredAt || null
  if (vipExpiredAt) {
    vipExpiredAt = new Date(Number(vipExpiredAt))
  }
  if (wTokenExpiredAt) {
    wTokenExpiredAt = new Date(Number(wTokenExpiredAt))
  }

  result["1.昵称"] = userWorkoutInfo.userInfo.nickName
  result["2.用户注册日期"] = createdAt.toLocaleDateString()
  result = { ...result, "3.训练名称：": wTitle, "4.训练类别：": wType, "5.本次训练时长：": wDuration }
  result["6.累计完成次数"] = userWorkoutInfo.finishedCount
  result["7.VIP有效期至"] = vipExpiredAt ? vipExpiredAt.toLocaleDateString() : undefined
  result["8.wToken有效期至"] = wTokenExpiredAt ? wTokenExpiredAt.toLocaleDateString() : undefined
  return result
}

async function internalGetUserActivityDetail({ aType, uuid, wid, sessionId, db, resumeSession }) {
  let result = {}
  let workoutInfo = await internalGetWorkoutInfo(wid, db)
  let userWorkoutInfo = await getReferUserWorkout({ wid, uid: uuid, db })
  let sessionInfo = null
  if (sessionId) {
    sessionInfo = await internalCheckRowExist(c.DB_WORKOUT_SESSION, [{ uuid }, { sid: sessionId }], db)
  }

  let createdAt = userWorkoutInfo && userWorkoutInfo.userInfo ? userWorkoutInfo.userInfo.createdAt : 0
  let vipExpiredAt = userWorkoutInfo && userWorkoutInfo.userInfo ? userWorkoutInfo.userInfo.vipExpiredAt : 0
  let wTokenExpiredAt = userWorkoutInfo ? userWorkoutInfo.maxTokenExpiredAt : 0
    
  if (createdAt) {
    createdAt = moment(Number(createdAt))
  }
  if (vipExpiredAt) {
    vipExpiredAt = moment(Number(vipExpiredAt))
  }
  if (wTokenExpiredAt) {
    wTokenExpiredAt = moment(Number(wTokenExpiredAt))
  }
  result["行为类型"] = aType
  result["是一次断点续播"] = resumeSession ? " ": undefined
  result["昵称"] = userWorkoutInfo && userWorkoutInfo.userInfo && userWorkoutInfo.userInfo.nickName ? userWorkoutInfo.userInfo.nickName : "未登录用户"
  result["用户注册时间"] = createdAt ? createdAt.format() : undefined
  result["训练名称"] = workoutInfo.title
  result["训练类别"] = internalWorkoutTypeDisplay(workoutInfo.workoutType)
  result["累计完成次数"] = userWorkoutInfo && userWorkoutInfo.finishedCount ? userWorkoutInfo.finishedCount : undefined
  result["VIP有效期至"] = vipExpiredAt ? vipExpiredAt.format() : undefined
  result["wToken有效期至"] = wTokenExpiredAt ? wTokenExpiredAt.format() : undefined
  result["本次训练是否完成"] = sessionInfo && sessionInfo.completed==true ? "完成训练" : "未完成"
  result["本次训练时长"] = sessionInfo && sessionInfo.touchCount ? (sessionInfo.touchCount * 10) + "秒" : undefined
  return result
}

exports.types = {
  [c.TYPE_LOGIN_WXO]: handleLoginWXO,
  [c.TYPE_LOGIN_WXU]: handleLoginWXU,
  [c.TYPE_LOGIN_SWO]: handleLoginSWO,
  [c.TYPE_LOGIN_SWD]: handleLoginSWD,
  [c.TYPE_LOGIN_SWU]: handleLoginSWU,
  [c.TYPE_REFRESH_TOKEN]: handleRefreshToken,
  [c.TYPE_INTERNAL_WORKOUT_COMPLETE_INFO]: internalGetWorkoutCompleteInfo,
  [c.TYPE_INTERNAL_USER_ACTIVITY_DETAIL]: internalGetUserActivityDetail,
};
