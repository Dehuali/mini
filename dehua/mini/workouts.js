"use strict";
const {
  oss,
  getWxAccessToken,
  promisPostRequest,
  newError,
  internalGetRowAttrs,
  internalCheckRowExist,
  internalPutTempData,
  localUuid,
  internalStaffNotify,
  internalOptimisticUpdate,
  internalInsertRow,
  internalUserActivityNotify,
  internalWorkoutTypeDisplay,
} = require("./fc-utils");
const { getUserInfo } = require("./users");
const c = require("./constants");
const TableStore = require("tablestore");
const images = require('./images');
const moment = require('moment-timezone');

// 兼容旧版本finishWorkout里用到了这个方法。下个版本可以删除。
async function internalUpdateWorkoutSession({ uuid, sid, type, data, db }) {
  const currentTimestamp = Date.now()
  // 本次要更新的数据
  let updateData = [{ updatedAt: currentTimestamp }]
  for (let attr in data) {
    if (data.hasOwnProperty(attr) && data[attr]) {
      updateData.push({ [attr]: data[attr] });
    }
  }
  switch (type) {
    case c.TYPE_START_WORKOUT:
      updateData.push({ startedAt: currentTimestamp })
      break;
    case c.TYPE_FINISH_WORKOUT:
      updateData.push({ finishedAt: currentTimestamp })
      break;
    default:
      break;
  }

  var params = {
    tableName: c.DB_WORKOUT_SESSION,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
    primaryKey: [{ uuid: uuid }, { sid: sid }],
    updateOfAttributeColumns: [{ PUT: updateData }],
  };
  await db.updateRow(params)
  return { updateResult: "SUCCESS" }
}

async function getAllSessions({ uuid, db }) {
  var params = {
    tableName: c.DB_WORKOUT_SESSION,
    direction: TableStore.Direction.FORWARD,
    maxVersions: 1,
    inclusiveStartPrimaryKey: [
      { uuid: uuid },
      { sid: TableStore.INF_MIN }
    ],
    exclusiveEndPrimaryKey: [
      { uuid: uuid },
      { sid: TableStore.INF_MAX }
    ]
  };
  let result = await db.getRange(params)
  if (!result.rows || result.rows.length == 0) {
    return []
  }
  let sessions = result.rows.map(row => {
    let session = internalGetRowAttrs(row)
    session.sid = row.primaryKey[1].value
    return session
  })
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return sessions
}

async function getHistory({ uuid, db }) {
  let allSessions = await getAllSessions({ uuid, db })
  let completedSessions = allSessions.filter(session => session.completed)
  if (completedSessions.length == 0) {
    return []
  }

  moment.tz.setDefault("Asia/Shanghai");

  let allWorkouts = await internalGetAllWorkouts(db)
  let history = {}
  completedSessions.forEach(session => {
    let finishedAt = session.finishedAt
    let monthDisplay = moment(finishedAt).format("YYYY 年 M 月")
    let dateDisplay = moment(finishedAt).format("M月D日")
    let wid = session.wid
    if (!allWorkouts[wid]) {
      return
    }
    let { title, coverImage, workoutType, estCalories, duration } = allWorkouts[wid]
    let workoutTypeDisplay = internalWorkoutTypeDisplay(workoutType)
    let durationDisplay = internalSecondDisplay(duration)

    if (history[monthDisplay]) {
      history[monthDisplay].push({ sessionId: session.sid, finishedAt, title, coverImage, estCalories, workoutTypeDisplay, durationDisplay, dateDisplay })
    } else {
      history[monthDisplay] = [{ sessionId: session.sid, finishedAt, title, coverImage, estCalories, workoutTypeDisplay, durationDisplay, dateDisplay }]
    }
  })
  return history
}

function internalSecondDisplay(sec) {
  if (!sec) {
    return "00:00";
  }
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec - m * 60);
  var mstr = (m < 10 ? "0" : "") + m
  var sstr = (s < 10 ? "0" : "") + s
  return mstr + ":" + sstr;
}

async function getMinePageData({ uuid, db }) {
  let allSessions = await getAllSessions({ uuid, db })
  let completedSessions = allSessions.filter(session => session.completed)
  if (completedSessions.length == 0) {
    return {}
  }

  // 最近完成的训练wid（5个，不重复）
  let latestCompletedWids = []
  for (let i = 0; i < completedSessions.length && latestCompletedWids.length < 6; i++) {
    let wid = completedSessions[i].wid
    if (latestCompletedWids.indexOf(wid) < 0) {
      latestCompletedWids.push(wid)
    }
  }
  // 获取训练详情
  let allWorkouts = await internalGetAllWorkouts(db)
  await internalWorkoutsRepoAddUserInfo(uuid, allWorkouts, db)
  let latestCompletedWorkouts = latestCompletedWids.map(wid => {
    return allWorkouts[wid] ? allWorkouts[wid] : null
  }).filter(w => w)

  // 设置moment本地参数
  moment.tz.setDefault("Asia/Shanghai");
  moment.updateLocale('Asia/Shanghai', {
    week: {
      dow: 1, //设置本周的第一天为周一
    }
  });
  const todayStartTimestamp = moment().hour(0).minute(0).valueOf()  //今天零点时间戳

  //今日sessions
  let todaySessions = completedSessions.filter(session => Number(session.updatedAt) > todayStartTimestamp)

  //今日训练数据
  let todayCalories = 0
  let todayWorkoutTime = 0
  let todayCompleteCount = todaySessions.length

  todaySessions.forEach(session => {
    let wid = session.wid
    if (!allWorkouts[wid]) {
      return
    }
    todayCalories += allWorkouts[wid].estCalories || 0
    todayWorkoutTime += allWorkouts[wid].duration || 0
  })
  todayWorkoutTime = Math.round(todayWorkoutTime / 60).toString()
  todayCalories = todayCalories.toString()
  todayCompleteCount = todayCompleteCount.toString()
  return { latestCompletedWorkouts, todayCalories, todayWorkoutTime, todayCompleteCount }
}

// async function getWeeklyReport({ uuid, db }) {
//   let allSessions = await getAllSessions({ uuid, db })
//   let completedSessions = allSessions.filter(session => session.completed)
//   if (completedSessions.length == 0) {
//     return {}
//   }

//   // 设置moment本地参数
//   moment.tz.setDefault("Asia/Shanghai");
//   moment.updateLocale('Asia/Shanghai', {
//     week: {
//       dow: 1, //设置本周的第一天为周一
//     }
//   });
//   const thisWeekStartTimestamp = moment().day(1).hour(0).minute(0).valueOf()  //本周周一零点时间戳

//   //本周sessions
//   let weekSessions = completedSessions.filter(session => Number(session.updatedAt) > thisWeekStartTimestamp)
//   // 如果本周没有完成过训练，只返回最近完成的训练
//   if (weekSessions.length == 0) {
//     return {}
//   }

//   // 训练详情repo
//   let allWorkouts = await internalGetAllWorkouts(db)
//   let result = { weekTotalDuration: 0, weekTotalCalories: 0, weekCompleteCount: weekSessions.length, trainedDayCount: 0 }

//   weekSessions.forEach(session => {
//     let wid = session.wid
//     if (!allWorkouts[wid]) {
//       return
//     }
//     let day = moment(session.finishedAt).day()
//     let { workoutType = '', duration = 0, estCalories = 0 } = allWorkouts[wid]
//     result.weekTotalDuration += duration
//     result.weekTotalCalories += estCalories

//     if (!result[day]) {
//       result[day] = { totalDuration: duration, [workoutType]: true }
//       result.trainedDayCount += 1
//     } else {
//       result[day].totalDuration += duration
//       result[day][workoutType] = true
//     }

//   })

//   return result
// }

async function viewWorkout({ uuid, wid, wToken, referrerUid, referrerGid, db, requestPath }) {
  if (!wid) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "wid");
  }
  let currentTimestamp = Date.now()
  let viewedAt = currentTimestamp
  let canPlay = false  //返回给前端

  // 判断vip用户
  const userInfo = await getUserInfo({ uuid, db })
  canPlay = userInfo && userInfo.vipExpiredAt && userInfo.vipExpiredAt > currentTimestamp
  // 如果前端发来wToken，需要校验token
  let maxTokenExpiredAt = 0
  if (wToken) {
    let tokenInfo = await internalCheckRowExist("workout_tokens", [{ wToken }], db)
    if (tokenInfo) {
      let widList = JSON.parse(tokenInfo.wids)
      // 该wToken可以解锁此课程，并且有效期大于现在
      if (widList.indexOf(wid) > -1) {
        maxTokenExpiredAt = tokenInfo.expiredAt > currentTimestamp ? tokenInfo.expiredAt : 0
      }
    }
  }
  // 读user_workout表，修改viewedAt以及maxTokenExpiredAt（默认为0）
  let userWorkoutPK = [{ uuid }, { wid }]
  let userWorkoutInfo = await internalCheckRowExist(c.DB_USER_WORKOUTS, userWorkoutPK, db)
  if (userWorkoutInfo) {
    let { updatedAt: lastUpdatedAt, maxTokenExpiredAt: existMaxTokenExpiredAt = 0 } = userWorkoutInfo
    if (maxTokenExpiredAt < existMaxTokenExpiredAt) {
      maxTokenExpiredAt = existMaxTokenExpiredAt
    }
    await internalUpdateUserWorkout({ uuid, wid, lastUpdatedAt, data: { viewedAt, maxTokenExpiredAt }, db });
  } else {
    // 该用户第一次浏览此训练，只需要写操作
    await internalInsertRow(c.DB_USER_WORKOUTS, userWorkoutPK, { createdAt: currentTimestamp, viewedAt, maxTokenExpiredAt }, db)
  }
  if (!canPlay) {
    canPlay = maxTokenExpiredAt > currentTimestamp
  }
  // 写入action表
  await internalInsertAction({ uuid, wid, type: c.TYPE_VIEW_WORKOUT, data: { referrerUid, referrerGid }, db });
  // 内部通知
  try {
    await internalUserActivityNotify({ type: c.TYPE_VIEW_WORKOUT, uuid, wid, requestPath })
  } catch (error) {
    console.error(`INTERNAL_NOTIFY_ERROR|${uuid}|${wid}|${c.TYPE_VIEW_WORKOUT}`);
  }
  return { canPlay, hasValidToken: canPlay };
}

async function startWorkout({ uuid, wid, wToken, db }) {
  if (!wid) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "wid");
  }
  let type = c.TYPE_START_WORKOUT
  // 写入action表
  let insertResult = await internalInsertAction({ uuid, wid, type, db })
  // 写入session表
  let sessionId = localUuid()
  await internalUpdateWorkoutSession({ uuid, sid: sessionId, type, data: { wid }, db })
  return { ...insertResult, sessionId }
}

async function finishWorkout({ uuid, wid, startId, sessionId, db, dbProd }) {
  if (!wid || !startId || !sessionId) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "wid or startId or sessionId");
  }
  let type = c.TYPE_FINISH_WORKOUT
  // 要保存到action表的数据
  let actionMeta = { sid: startId }

  // 获得开始训练信息
  const startActionInfo = await internalCheckRowExist(c.DB_ACTIONS, [{ uuid }, { wid }, { _id: startId }], db)
  if (!startActionInfo) {
    throw newError(
      c.ERROR_DB_READ_EMPTY,
      "can't find createdAt of startAction, in finishWorkout"
    );
  }
  // 获得了开始训练的时间，判断是否完成
  const workoutInfo = await internalGetWorkoutInfo(wid, db);
  const currentTimestamp = Date.now();
  const duration = Math.floor(
    (currentTimestamp - startActionInfo.createdAt) / 1000
  );
  actionMeta.duration = duration;
  let completed = duration >= Math.max(0, workoutInfo.duration - 5);
  // actionMeta.workoutInfo = workoutInfo
  actionMeta.completed = completed;
  if (completed) {
    //用户完成该训练，去userWorkouts表里更新finishedCount
    const updateUWParams = {
      tableName: c.DB_USER_WORKOUTS,
      condition: new TableStore.Condition(
        TableStore.RowExistenceExpectation.IGNORE,
        null
      ),
      primaryKey: [{ [c.DB_USER_WORKOUTS_PK1]: uuid }, { [c.DB_USER_WORKOUTS_PK2]: wid }],
      updateOfAttributeColumns: [
        {
          PUT: [{ [c.DB_USER_WORKOUTS_COL_FINISHED_AT]: currentTimestamp }]
        },
        {
          INCREMENT: [
            { [c.DB_USER_WORKOUTS_COL_FINISHED_COUNT]: TableStore.Long.fromNumber(1) }
          ]
        }
      ]
    };
    await db.updateRow(updateUWParams);
    await internalStaffNotify("WORKOUT_COMPLETE", { uuid, wid, duration, workoutTitle: workoutInfo.title, workoutType: workoutInfo.workoutType }, dbProd)
  }
  const insertActionResult = await internalInsertAction({ uuid, wid, type, data: actionMeta, db });
  // 写入session表
  await internalUpdateWorkoutSession({ uuid, sid: sessionId, type, data: { completed }, db })
  return insertActionResult;
}

async function checkUnfinishedSession({ uuid, db }) {
  let currentTimestamp = Date.now()
  let existSessionInfo = null
  let userInfo = await internalCheckRowExist(c.DB_USERS, [{ uuid }], db)
  let latestSessionId = userInfo && userInfo.latestSessionId ? userInfo.latestSessionId : null
  if (latestSessionId) {
    existSessionInfo = await internalCheckRowExist(c.DB_WORKOUT_SESSION, [{ uuid }, { sid: latestSessionId }], db)
  }
  // 上一个session没有结束，且更新时间在5分钟之内
  if (existSessionInfo && !existSessionInfo.finishedAt && currentTimestamp - existSessionInfo.updatedAt < 60 * 5 * 1000) {
    let startTime = existSessionInfo.playhead
    return { wid: existSessionInfo.wid, sessionId: latestSessionId, startTime }
  } else {
    return
  }
}

async function startSession({ uuid, wid, startType, db, requestPath }) {
  if (!wid) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "wid");
  }
  const startedAt = Date.now()
  // 写入action表
  let { _id } = await internalInsertAction({ uuid, wid, type: c.TYPE_START_WORKOUT, db })
  try {
    await internalUserActivityNotify({ type: c.TYPE_START_SESSION, uuid, wid, requestPath, startType })
  } catch (error) {
    console.error(`INTERNAL_NOTIFY_ERROR|${uuid}|${wid}|${c.TYPE_START_SESSION}`);
  }
  switch (startType) {
    case "NEW_SESSION":
      let sessionId = localUuid()
      let pk = [{ uuid }, { sid: sessionId }]
      await internalInsertRow(c.DB_WORKOUT_SESSION, pk, { wid, startedAt }, db)
      // 修改user表 latestSessionId
      let userInfo = await internalCheckRowExist(c.DB_USERS, [{ uuid }], db)
      let userUpdatedAt = userInfo && userInfo.updatedAt ? userInfo.updatedAt : 0
      await internalOptimisticUpdate(c.DB_USERS, [{ uuid }], userUpdatedAt, { latestSessionId: sessionId }, db)
      return { wid, sessionId, startedAt, _id }  //TODO 前端已经不需要startedAt了，等前端修改后在这里删除
    case "RESUME_SESSION":
      // 沿用之前的session，前端已经有sessionId。
      return { wid, startedAt, _id };
    default:
      break;
  }
}

// 播放过程中，每隔10秒校验一次播放进度
async function touchSession({ uuid, sessionId, playhead, db }) {
  let currentTimestamp = Date.now()
  //读之前的session 
  let pk = [{ uuid }, { sid: sessionId }]
  let existSessionInfo = await internalCheckRowExist(c.DB_WORKOUT_SESSION, pk, db)
  if (!existSessionInfo) {
    console.error(`TOUCH_SESSION_ERROR|${c.ERROR_DB_READ_EMPTY.errorCode}|${c.ERROR_DB_READ_EMPTY.message}|${uuid}`);
    return { continue: false }
  }
  let { touchCount: existTouchCount = 0, updatedAt, finishedAt } = existSessionInfo
  // 如果已结束，或者距离上次修改时间超过5分钟，终止本次session
  if (finishedAt || (currentTimestamp - updatedAt > 60 * 5 * 1000)) {
    return { continue: false }
  } else {
    // 更新touchCount
    let touchCount = existTouchCount + 1
    await internalOptimisticUpdate(c.DB_WORKOUT_SESSION, pk, updatedAt, { touchCount, playhead }, db)
    return { continue: true }
  }
}

// 如果用户修改进度，只更新playhead，不计算touchCount
async function updatePlayhead({ uuid, sessionId, playhead, db }) {
  let pk = [{ uuid }, { sid: sessionId }]
  let existSessionInfo = await internalCheckRowExist(c.DB_WORKOUT_SESSION, pk, db)
  let updatedAt = existSessionInfo ? existSessionInfo.updatedAt : 0
  // 如果已结束，或者距离上次修改时间超过5分钟，终止本次session
  await internalOptimisticUpdate(c.DB_WORKOUT_SESSION, pk, updatedAt, { playhead }, db)
  return
}

async function finishSession({ uuid, wid, sessionId, startId, db, dbProd, requestPath }) {
  if (!wid || !sessionId) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "wid or sessionId");
  }
  let currentTimestamp = Date.now()
  const workoutInfo = await internalGetWorkoutInfo(wid, db);
  const sessionPK = [{ uuid }, { sid: sessionId }]
  const sessionInfo = await internalCheckRowExist(c.DB_WORKOUT_SESSION, sessionPK, db)
  if (!sessionInfo || !workoutInfo) {
    throw newError(c.ERROR_DB_READ_EMPTY, " inside finishSession")
  }

  const workoutDuration = workoutInfo.duration ? workoutInfo.duration : 0
  const { startedAt, touchCount = 0 } = sessionInfo

  let sessionDuration = Math.ceil((currentTimestamp - startedAt) / 1000)
  let completed = false

  // 如果session 结束时间 - 开始时间 >  训练总时长 - 15 ，并且  实际touchCount > 应有touchCount*0.7，则判断用户完成了这次训练
  if (sessionDuration >= (workoutDuration - 15) && (touchCount * 10 >= workoutDuration * 0.7)) {
    completed = true
  }
  // completed = true // todo delete

  if (completed) {
    //用户完成该训练，去userWorkouts表里更新finishedCount
    let userWorkoutPK = [{ uuid }, { wid }]
    let userWorkoutInfo = await internalCheckRowExist(c.DB_USER_WORKOUTS, userWorkoutPK, db)
    let { finishedCount = 0, updatedAt: userWorkoutUpdatedAt } = userWorkoutInfo
    finishedCount = Number(finishedCount)
    await internalOptimisticUpdate(c.DB_USER_WORKOUTS, userWorkoutPK, userWorkoutUpdatedAt, { finishedCount: TableStore.Long.fromNumber(finishedCount + 1), finishedAt: currentTimestamp }, db);
  }
  // 写入action表
  if (startId) {
    let insertActionData = { sid: startId, completed, duration: touchCount * 10 }
    await internalInsertAction({ uuid, wid, type: c.TYPE_FINISH_WORKOUT, data: insertActionData, db });
  }
  // 修改session表
  let sessionUpdatedAt = sessionInfo ? sessionInfo.updatedAt : 0
  await internalOptimisticUpdate(c.DB_WORKOUT_SESSION, sessionPK, sessionUpdatedAt, { completed, finishedAt: currentTimestamp }, db)
  // 内部通知
  try {
    await internalUserActivityNotify({ type: c.TYPE_FINISH_SESSION, uuid, wid, sessionId, requestPath })
  } catch (error) {
    console.error(`INTERNAL_NOTIFY_ERROR|${uuid}|${wid}|${sessionId}|${c.TYPE_FINISH_SESSION}`);
  }
  return { completed, finishedAt: currentTimestamp, effectivePlayTime: sessionDuration };
}

// 在action表中新增记录
async function internalInsertAction({ uuid, wid, type, data = {}, db }) {
  const createdAt = Date.now()
  let insertData = [{ createdAt }, { type }]
  for (let attr in data) {
    if (data.hasOwnProperty(attr) && data[attr]) {
      insertData.push({ [attr]: data[attr] });
    }
  }
  // console.log("insertData===", insertData);

  const actionId = localUuid();
  let putParams = {
    tableName: c.DB_ACTIONS,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,
      null
    ),
    primaryKey: [
      { [c.DB_ACTIONS_PK1]: uuid },
      { [c.DB_ACTIONS_PK2]: wid },
      { [c.DB_ACTIONS_PK3]: actionId }
    ],
    attributeColumns: insertData
  };

  try {
    await db.putRow(putParams);
    return { ...data, wid, createdAt, _id: actionId }
  } catch (error) {
    throw newError(c.ERROR_DB_WRITE_FAIL, " internalInsertAction" + error);
  }
}

function ossImgAddr(imgName) {
  return "https://assets.pulsefitness.club/images/" + imgName
}

async function getDiscoverBlocks({ uuid, db }) {
  // 顶部轮播图
  let swipItems = []
  swipItems.push({ url: "/pages/list/list?type=COLLECTION&key=new_release_20200413&label=本周上新", image: ossImgAddr("banner/20200413.png") })
  swipItems.push({ url: "/pages/fitness-profile/fitness-profile", image: ossImgAddr("banner/fitness-profile.png") })
  swipItems.push({ url: "/pages/list/list?type=COLLECTION&key=home_strength_lv01&label=居家健身进行时", image: ossImgAddr("banner/colection-indoor.png") })
  let moreSwipItems = ["treadmill", "stretching"]
  moreSwipItems.forEach(c => {
    swipItems.push({ url: "/pages/list/list?type=WORKOUT_TYPE&key=" + c, image: ossImgAddr("banner/colection-" + c + ".png") })
  })
  let topSwiper = { id: 1, type: "swiper", items: swipItems }

  // 训练类型按钮
  let workoutTypes = ["strength", "stretching", "treadmill", "outdoor_running", "elliptical", "indoor_cycling", "rowing"]
  let workoutTypesData = workoutTypes.map(w => {
    return { url: "/pages/list/list?type=WORKOUT_TYPE&key=" + w, image: ossImgAddr("wt-" + w + ".png") }
  })
  let workoutTypesMenu = { id: 2, type: "menu", items: workoutTypesData }

  // 明星教练按钮
  let trainers = { 'kat': "颜颜", 'fangGe': "芳哥", 'C2': "C2", 'max': "MAX", 'rock': "ROCK", "YiTong": "依彤" }
  let trainersData = Object.keys(trainers).map(t => {
    return { url: "/pages/list/list?type=TRAINER&key=" + trainers[t], image: "https://assets.pulsefitness.club/miniprogram/trainer-" + t + ".png", label: trainers[t] }
  })
  let trainersMenu = { id: 4, type: "menu", items: trainersData, title: "明星教练" }

  // 训练列表
  let discoverWorkoutLists = await internalGetDiscoverWorkoutLists(uuid, db)

  // 最终排列
  let result = [topSwiper, workoutTypesMenu, ...discoverWorkoutLists]
  result.splice(5, 0, trainersMenu)

  // 暂时都不显示Vip Banner
  // let userInfo = await getUserInfo({uuid, db})
  // let isVip = userInfo && userInfo.vipExpiredAt > Date.now()
  // if(!isVip){
  //   let vipBanner = { id: 3, type: "banner", url: "/pages/premium-access/premium-access", image: ossImgAddr("banner/vip.png") }
  //   result.splice(3, 0, vipBanner)
  //   result.splice(6, 0, trainersMenu)
  // } else {
  //   result.splice(5, 0, trainersMenu)
  // }
  if (!result || result.length == 0) {
    console.log("Empty Discover Error====", uuid, JSON.stringify(discoverWorkoutLists));
  }
  return result
}

async function internalGetDiscoverWorkoutLists(uuid, db) {
  const discoverWorkoutListsExist = await internalCheckRowExist("temp_session", [{ key: "discoverWorkoutLists" }], db)
  if (discoverWorkoutListsExist) {
    return JSON.parse(discoverWorkoutListsExist.discoverWorkoutLists)
  } else {
    console.log("获取新的Discovery Items");
    let cols = []
    let colnames = ["居家健身", "腹肌核心", "拉伸放松", "有氧燃脂", "户外运动", "热身激活", "缓解压力"]
    let id = 2
    colnames.forEach(col => {
      id++
      cols.push({ id: id, type: "workoutMenu", items: [], title: col })
    })

    let allWorkouts = await internalGetAllWorkouts(db)
    await internalWorkoutsRepoAddUserInfo(uuid, allWorkouts, db)

    const items = [{ "wid": "3d0582b0-30fa-11ea-a666-cf23f163ce29", "title": "下背部拉伸 · 1", "colname": "居家健身" }, { "wid": "ff7bae90-4992-11ea-a5df-ffa0ff884347", "title": "15分钟下肢力量", "colname": "居家健身" }, { "wid": "11aa6360-48d3-11ea-8920-e3370dee6703", "title": "稳稳的 · 1", "colname": "居家健身" }, { "wid": "x5cRDhBnOllZRfwAMpKPl4Y37HTtW6C0JDZH9HSDtxWgTtPm", "title": "奔跑之王", "colname": "居家健身" }, { "wid": "185f10e0-3c38-11ea-a1b1-a9d9e43b1bc4", "title": "基础力量训练 · 1", "colname": "居家健身" }, { "wid": "3ad86530-3289-11ea-aca9-c5bd7e659e08", "title": "集中修炼-腹", "colname": "腹肌核心" }, { "wid": "11aa6360-48d3-11ea-8920-e3370dee6703", "title": "稳稳的 · 1", "colname": "腹肌核心" }, { "wid": "55277b204caf11eaa4d0717409794b55", "title": "稳稳的 · 2", "colname": "腹肌核心" }, { "wid": "a8f352404f0911ea80aa65b022ea5b9a", "title": "稳稳的 · 3", "colname": "腹肌核心" }, { "wid": "5039f250-2f77-11ea-8560-3d6033d15699", "title": "肩颈拉伸 · 1", "colname": "拉伸放松" }, { "wid": "868ea350-2f77-11ea-b29c-23f26e78c8e5", "title": "肩颈拉伸 · 2", "colname": "拉伸放松" }, { "wid": "F49PGYQdIMkVZ9jP7Mnjp1TNhDu0ljJ0Sij74Xp5BzUu2lIW", "title": "久坐不动拉伸系列 · 1", "colname": "拉伸放松" }, { "wid": "dad06010-1ff1-11ea-9a20-5f84b555fbe6", "title": "运动前热身", "colname": "拉伸放松" }, { "wid": "cdbc5440-0040-11ea-ab9d-dd9f8705b50f", "title": "跑是生活的解药", "colname": "有氧燃脂" }, { "wid": "78c63c20-26f2-11ea-8f51-0dac9f7f9415", "title": "温暖20倍", "colname": "有氧燃脂" }, { "wid": "ddaffc20-05e1-11ea-a1e2-09f62a703371", "title": "动起来", "colname": "有氧燃脂" }, { "wid": "4Nu1WajXft6NujoqzcEqkyTXcCJcVbsWjRaQZapck2TeQxSA", "title": "开心的浪花儿", "colname": "有氧燃脂" }, { "wid": "2m6Juj1pqYmlUrnr31XbRjHZjLOj0QaJqKlkVi2OkrG5u9xM", "title": "动感半小时", "colname": "有氧燃脂" }, { "wid": "c9084210-0040-11ea-8987-4d0185ea3ba5", "title": "乡间小路", "colname": "户外运动" }, { "wid": "ece26960-0ade-11ea-ac49-512594168397", "title": "冬日暖阳", "colname": "户外运动" }, { "wid": "47gmH2kxxqv6oZPgnxZaYIb27xi3RjrY7v1yveLMhxqccYAC", "title": "下午茶走开", "colname": "户外运动" }, { "wid": "UTWViiir5vIv8cZGsfnouwKRbaToVx9kk11MZF8ZOBqhPXwu", "title": "一碗大米饭", "colname": "户外运动" }, { "wid": "cbb99ab0-30f9-11ea-a2fa-1b9b6a6df2ab", "title": "强韧的精神力Lite", "colname": "户外运动" }, { "wid": "N5BozMeU8cX5cJNCHKVWDYWc891OC2rCIHSLh9G1MRbQo1eE", "title": "1.5公里热身小跑", "colname": "热身激活" }, { "wid": "a7fb7ca0-0058-11ea-9452-3b68ae1ea038", "title": "户外间歇热身小跑", "colname": "热身激活" }, { "wid": "dad06010-1ff1-11ea-9a20-5f84b555fbe6", "title": "运动前热身", "colname": "热身激活" }, { "wid": "2636db10-06e8-11ea-80b7-0b7c44178122", "title": "好好拉伸 · 运动前", "colname": "热身激活" }, { "wid": "VfNbAgve2y4sg1vt7PMstTDIxWolfFkB618FEbMr1TylgnW8", "title": "一番妥", "colname": "热身激活" }, { "wid": "01196e30-06e6-11ea-9e5e-c33bfb335321", "title": "久坐不动拉伸系列·2", "colname": "缓解压力" }, { "wid": "2bb8aac0-2306-11ea-bd19-91547e922ec6", "title": "久坐不动拉伸系列 · 3", "colname": "缓解压力" }, { "wid": "868ea350-2f77-11ea-b29c-23f26e78c8e5", "title": "肩颈拉伸 · 2", "colname": "缓解压力" }, { "wid": "3d0582b0-30fa-11ea-a666-cf23f163ce29", "title": "下背部拉伸 · 1", "colname": "缓解压力" }, { "wid": "7b468d80-30fa-11ea-8ba8-d7d9424b22b4", "title": "下背部拉伸 · 2", "colname": "缓解压力" }]
    items.forEach(item => {
      cols.forEach(col => {
        if (col.title == item.colname && allWorkouts[item.wid]) {
          col.items.push(allWorkouts[item.wid])
        }
      })
    })
    await internalPutTempData("discoverWorkoutLists", JSON.stringify(cols), 60 * 60 * 2, db)
    return cols
  }
}

async function getCollectionWorkouts({ uuid, collectionKey, db }) {
  const collectionExist = await internalCheckRowExist("temp_session", [{ key: collectionKey }], db)
  if (collectionExist) {
    return JSON.parse(collectionExist[collectionKey])
  } else {
    console.log("获取新的collection");
    let allWorkouts = await internalGetAllWorkouts(db)
    await internalWorkoutsRepoAddUserInfo(uuid, allWorkouts, db)
    let wids = []
    let collections = []
    switch (collectionKey) {
      case "home_strength_lv01":
        wids = ["11aa6360-48d3-11ea-8920-e3370dee6703", "ff7bae90-4992-11ea-a5df-ffa0ff884347", "922cd8d0-2306-11ea-b739-018302446a1b", "55277b204caf11eaa4d0717409794b55", "3a6ece304f3611eaaf6c6732c3e93a9b", "a8f352404f0911ea80aa65b022ea5b9a", "c1408d70532511eabc843795a43f6f74"]
        break;
      case "new_release_20200413":
        wids = [
          'a4ba1dd066a111eaa2c4b162fabf6809',
          'b9aeff0072fc11eab19cfbb054a05e34',
          'e2974e40724811eaa0d3b78501d1686d',
          'b4d919c0724811ea8ab81f96cf549c7a'
        ]
        break;
      case "new_release_20200329":
        wids = [
          'ffd938b0-30f8-11ea-98ac-13cd3127df9f',
          '54ea6800-3159-11ea-b5bf-8b71fef07ba2',
          '910ba1b0-30f9-11ea-9491-e5408f44ebd1',
          '883a80a0-35f0-11ea-86e0-91e23cc861d2'
        ]
        break;
      default:
        break;
    }
    wids.forEach(wid => {
      if (allWorkouts[wid]) {
        collections.push(allWorkouts[wid])
      }
    })
    await internalPutTempData(collectionKey, JSON.stringify(collections), 60 * 60 * 2, db)
    return collections
  }
}

async function internalGetAllWorkouts(db) {
  console.log("db====", db);

  const workoutsRepoExist = await internalCheckRowExist("temp_session", [{ key: "workoutsRepo" }], db)
  let workoutsRepo = {}
  if (workoutsRepoExist) {
    workoutsRepo = JSON.parse(workoutsRepoExist.workoutsRepo)
  } else {
    let tsParams = {
      tableName: "workouts",
      direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: [{ _id: TableStore.INF_MIN }],
      exclusiveEndPrimaryKey: [{ _id: TableStore.INF_MAX }]
    };
    let result = await db.getRange(tsParams)
    let workoutsRepo0 = internalExtractWorkoutList(result["rows"]);
    workoutsRepo0.forEach(w => {
      workoutsRepo[w._id] = w
    })
    await internalPutTempData("workoutsRepo", JSON.stringify(workoutsRepo), 60 * 60 * 2, db)
  }
  return workoutsRepo
}

async function internalWorkoutsRepoAddUserInfo(uuid, workoutsRepo, db) {
  let finishedWidInfos = await internalGetFinishedWidInfos({ uuid, db })
  if (JSON.stringify(finishedWidInfos) == '{}') {
    return
  }

  for (const wid in finishedWidInfos) {
    if (workoutsRepo[wid]) {
      workoutsRepo[wid].userInfo = finishedWidInfos[wid];
    }
  }
}


async function getViewedWorkouts({ uuid, db }) {
  //获得该用户的训练列表userWorkoutsList
  let userWorkoutsList = await internalGetUserWorkoutsList(uuid, db);
  // 排序
  userWorkoutsList.sort((a, b) => b.viewedAt - a.viewedAt);
  // 取前20个
  userWorkoutsList = userWorkoutsList.slice(0, 20)
  // 根据训练列表，获得对应的训练详情列表（附带userinfo：viewedAt）
  const viewedWorkouts = await internalGetWorkoutsUserInfoList(
    userWorkoutsList,
    m => ({
      viewedAt: m.viewedAt,
      wToken: m.wToken,
    }),
    db
  );
  return viewedWorkouts;
}

async function getFinishedWorkouts({ uuid, db }) {
  //获得该用户的训练列表userWorkoutsList，筛选条件finishedCount > 0
  const userWorkoutsList = await internalGetUserWorkoutsList(uuid, db);
  const finishedList = userWorkoutsList.filter(uw => uw.finishedCount > 0);
  // 根据训练列表，获得对应的训练详情列表（附带userinfo）
  const finishedWorkouts = await internalGetWorkoutsUserInfoList(
    finishedList,
    m => ({
      finishedCount: m.finishedCount,
      finishedAt: m.finishedAt,
      viewedAt: m.viewedAt
    }),
    db
  );
  // 排序
  finishedWorkouts.sort(
    (a, b) => b.userInfo.finishedAt - a.userInfo.finishedAt
  );
  return finishedWorkouts;
}

async function internalGetFinishedWidInfos({ uuid, db }) {
  const userWorkoutsList = await internalGetUserWorkoutsList(uuid, db);
  let finishedWids = {}
  userWorkoutsList.forEach(uw => {
    if (uw.finishedCount > 0) {
      finishedWids[uw.wid] = {
        finishedCount: uw.finishedCount,
        finishedAt: uw.finishedAt,
        viewedAt: uw.viewedAt
      }
    }
  })
  return finishedWids;
}

async function internalExtractSearchResult(searchParams, uuid, db) {
  let searchResult = await db.search(searchParams);
  if (!searchResult.rows || searchResult.rows.length == 0) {
    return []
  }
  let allWorkouts = await internalGetAllWorkouts(db)
  await internalWorkoutsRepoAddUserInfo(uuid, allWorkouts, db)
  let result = searchResult.rows.map(row => {
    let wid = row.primaryKey[0].value
    return allWorkouts[wid] ? allWorkouts[wid] : null
  }).filter(w => w)
  return result;
}

async function getRecommendedWorkouts({ db }) {
  var batchGetRecommendParam = {
    tables: [
      {
        tableName: c.DB_WORKOUTS,
        primaryKey: [] //下面填充
      }
    ]
  };
  //order:预定义推荐object的顺序，自动加一
  var order = 1;
  var predef = {
    YwCsRqXvGE8xH5f3rbZWqfBdRSvUilMs3P4rMUv1i2D8zL59: {
      text: "20分钟 • 中等强度 • 麻雀虽小五脏俱全的减压神器",
      order: order++
    },
    ANIUBh0ZArKtDdV25CtnUwAr1AZp7okuD5uT3WNIYE3hjG0Q: {
      text: "15分钟 • 中等强度 • 踩过一次就停不下来",
      order: order++
    },
    ujkLYulcpZ2sB5o2aoShu6zMJCaLNi4z0tl4CNXpt40Ll8Xf: {
      text: "30分钟 • 中等强度 • 电音加持的高效燃脂课程",
      order: order++
    },
    VfNbAgve2y4sg1vt7PMstTDIxWolfFkB618FEbMr1TylgnW8: {
      text: "10分钟 • 中等强度 • 踩出状态开始训练",
      order: order++
    },
    MPKOXbtVyucbgrlSSTuEn6aq0brZbTt2nH32SsZn7b0gKrTB: {
      text: "20分钟 • 中高强度 • 20分钟妥妥燃脂",
      order: order++
    },
    IxrS17rCJuIs5maxJXjzUjUYc5TbZr5r8D9MLFrQxXLBb4Rj: {
      text: "10分钟 • 中低强度 • 热完直接去撸铁",
      order: order++
    },
    N5BozMeU8cX5cJNCHKVWDYWc891OC2rCIHSLh9G1MRbQo1eE: {
      text: "10分钟 • 中等强度 • 热身小跑两相宜",
      order: order++
    },
    b1jmDSZdwQtinBYuwRBaVJkALsKD6bYjOlaphUfSP2IYizcP: {
      text: "20分钟 • 中低强度 • 减压全套一次吃到饱",
      order: order++
    },
    "8ATcTUe8QlEEn5LYC7efP0GAhPYDr8yQ8rTuPJt89GzBCQkf": {
      text: "20分钟 • 中低强度 • 给紧绷的神经减负",
      order: order++
    },
    PZXydMUOPkQrkjSGpeq9wpR9d9rKTwNbBe4oF2PEWKLjSzvu: {
      text: "30分钟 • 中高强度 • 间歇冲刺一把梭",
      order: order++
    },
    H4mrZADYwNg0xCDnVEaKuhhHA02GQOoMDICszxqzEysxXFks: {
      text: "30分钟 • 中等强度 • 节奏与心率的完美结合，室内户外都可用",
      order: order++
    }
  };
  Object.keys(predef).forEach(_id => {
    batchGetRecommendParam.tables[0].primaryKey.push([{ _id: _id }]);
  });
  try {
    var batchGetResult = await db.batchGetRow(batchGetRecommendParam);
    var workoutlist = internalExtractWorkoutList(batchGetResult.tables[0]);
    return workoutlist.map(workout => {
      var id = workout["_id"];
      return {
        ...workout,
        userInfo: {
          editorNotes: predef[id]
        }
      };
    });
  } catch (error) {
    throw newError(
      c.ERROR_DB_BATCH_READ_FAIL,
      "in getRecommendedWorkouts " + error
    );
  }
}

async function getUnreleasedWorkouts({ uuid, db }) {
  const searchParams = {
    tableName: "workouts",
    indexName: "WORKOUTS_INDEX",
    searchQuery: {
      offset: 0,
      limit: 100,
      query: {
        queryType: TableStore.QueryType.BOOL_QUERY,
        query: {
          mustNotQueries: [
            {
              queryType: TableStore.QueryType.EXISTS_QUERY,
              query: {
                fieldName: "releasedAt"
              }
            }
          ]
        }
      },
      sort: {
        sorters: [
          {
            fieldSort: {
              fieldName: "createdAt",
              order: TableStore.SortOrder.SORT_ORDER_DESC
            }
          }
        ]
      }
    },
    columnToGet: {
      returnType: TableStore.ColumnReturnType.RETURN_NONE
    }
  };
  return await internalExtractSearchResult(searchParams, uuid, db)
}

async function getNewReleasedWorkouts({ uuid, db, count = 20 }) {
  const searchParams = {
    tableName: "workouts",
    indexName: "WORKOUTS_INDEX",
    searchQuery: {
      offset: 0,
      limit: count,
      query: {
        queryType: TableStore.QueryType.EXISTS_QUERY,
        query: {
          fieldName: "releasedAt"
        }
      },
      sort: {
        sorters: [
          {
            fieldSort: {
              fieldName: "releasedAt",
              order: TableStore.SortOrder.SORT_ORDER_DESC
            }
          }
        ]
      }
    },
    columnToGet: {
      returnType: TableStore.ColumnReturnType.RETURN_NONE
    }
  };
  return await internalExtractSearchResult(searchParams, uuid, db)
}

async function getNewReleasedTimestamp({ uuid, db }) {
  let newReleased = await getNewReleasedWorkouts({ uuid, db, count: 1 });
  return { newReleasedTimestamp: newReleased[0]["releasedAt"] };
}

async function getTypedWorkouts({ uuid, workoutType, limit = 50, db }) {
  const searchParams = {
    tableName: "workouts",
    indexName: "WORKOUTS_INDEX",
    searchQuery: {
      offset: 0,
      limit: limit,
      query: {
        queryType: TableStore.QueryType.BOOL_QUERY,
        query: {
          mustQueries: [
            {
              queryType: TableStore.QueryType.EXISTS_QUERY,
              query: {
                fieldName: "releasedAt"
              }
            },
            {
              queryType: TableStore.QueryType.TERM_QUERY,
              query: {
                fieldName: "workoutType",
                term: workoutType
              }
            }
          ]
        }
      },
      sort: {
        sorters: [
          {
            fieldSort: {
              fieldName: "releasedAt",
              order: TableStore.SortOrder.SORT_ORDER_DESC
            }
          }
        ]
      }
    },
    columnToGet: {
      returnType: TableStore.ColumnReturnType.RETURN_NONE //只返回主键
    }
  };
  return await internalExtractSearchResult(searchParams, uuid, db)
}

async function getTagWorkouts({ uuid, tag, db, limit = 50 }) {
  const searchParams = {
    tableName: "workouts",
    indexName: "WORKOUTS_INDEX",
    searchQuery: {
      offset: 0,
      limit: limit,
      query: {
        queryType: TableStore.QueryType.BOOL_QUERY,
        query: {
          mustQueries: [
            {
              queryType: TableStore.QueryType.EXISTS_QUERY,
              query: {
                fieldName: "releasedAt"
              }
            },
            {
              queryType: TableStore.QueryType.TERM_QUERY,
              query: {
                fieldName: "tags",
                term: tag
              }
            }
          ]
        }
      },
      sort: {
        sorters: [
          {
            fieldSort: {
              fieldName: "releasedAt",
              order: TableStore.SortOrder.SORT_ORDER_DESC
            }
          }
        ]
      }
    },
    columnToGet: {
      returnType: TableStore.ColumnReturnType.RETURN_NONE
    }
  };
  return await internalExtractSearchResult(searchParams, uuid, db)
}

async function getTrainerWorkouts({ uuid, trainer, db, limit = 100 }) {
  const searchParams = {
    tableName: "workouts",
    indexName: "WORKOUTS_INDEX",
    searchQuery: {
      offset: 0,
      limit: limit,
      query: {
        queryType: TableStore.QueryType.BOOL_QUERY,
        query: {
          mustQueries: [
            {
              queryType: TableStore.QueryType.EXISTS_QUERY,
              query: {
                fieldName: "releasedAt"
              }
            },
            {
              queryType: TableStore.QueryType.TERM_QUERY,
              query: {
                fieldName: "trainerName",
                term: trainer
              }
            }
          ]
        }
      },
      sort: {
        sorters: [
          {
            fieldSort: {
              fieldName: "releasedAt",
              order: TableStore.SortOrder.SORT_ORDER_DESC
            }
          }
        ]
      }
    },
    columnToGet: {
      returnType: TableStore.ColumnReturnType.RETURN_NONE
    }
  };
  return await internalExtractSearchResult(searchParams, uuid, db)
}

//从一行tablestore记录中提取训练信息
function internalExtractWorkout(row) {
  if (!row) {
    throw newError(
      c.ERROR_DB_READ_EMPTY,
      "workouts, while internalExtractWorkout"
    );
  }
  let workout = internalGetRowAttrs(row);
  if (!workout) {
    return null;
  }
  workout["steps"] = JSON.parse(workout["steps"]);
  if (workout["tags"]) {
    workout["tags"] = workout["tags"].split(",");
  }
  if (workout["moves"]) {
    workout["moves"] = JSON.parse(workout["moves"]);
  }
  workout["audio"] = {
    offline: workout["audioOffline"],
    streaming: workout["audioStreaming"]
  };
  workout["trainer"] = {
    name: workout["trainerName"],
    pic: workout["trainerPic"]
  };
  ["audioOffline", "audioStreaming", "trainerName", "trainerPic"].forEach(
    key => delete workout[key]
  );
  return {
    _id: row["primaryKey"][0]["value"],
    ...workout
  };
}

//处理批量读workouts的结果，返回训练列表
function internalExtractWorkoutList(rows) {
  if (rows.length == 0) {
    return [];
  }
  return rows.map(row => {
    return internalExtractWorkout(row);
  });
}

//获取训练详情
async function internalGetWorkoutInfo(wid, db) {
  if (!wid) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "wid");
  }
  const getParams = {
    tableName: c.DB_WORKOUTS,
    primaryKey: [{ [c.DB_WORKOUTS_PK1]: wid }]
  };
  const getResult = await db.getRow(getParams);
  return internalExtractWorkout(getResult["row"]);
}

// 获得该用户的训练列表
async function internalGetUserWorkoutsList(uuid, db) {
  const getRangeParams = {
    tableName: c.DB_USER_WORKOUTS,
    direction: TableStore.Direction.BACKWARD,
    inclusiveStartPrimaryKey: [
      { [c.DB_USER_WORKOUTS_PK1]: uuid },
      { [c.DB_USER_WORKOUTS_PK2]: TableStore.INF_MAX }
    ],
    exclusiveEndPrimaryKey: [
      { [c.DB_USER_WORKOUTS_PK1]: uuid },
      { [c.DB_USER_WORKOUTS_PK2]: TableStore.INF_MIN }
    ],
    limit: 200 //要设置成比workouts总数大的数字
  };
  try {
    const getRangeResult = await db.getRange(getRangeParams);
    if (getRangeResult["rows"].length == 0) {
      return []
    }
    const userWorkoutMeta = getRangeResult["rows"].map(row => {
      let attrs = internalGetRowAttrs(row);
      return {
        wid: row["primaryKey"][1]["value"],
        ...attrs
      };
    });
    return userWorkoutMeta;
  } catch (error) {
    throw newError(c.ERROR_DB_GET_RANGE_FAIL, error);
  }
}

//获取训练详情列表（附带userWorkoutInfo）
async function internalGetWorkoutsUserInfoList(meta, infoMapper, db) {
  let workoutsRepo = await internalGetAllWorkouts(db)
  if (!workoutsRepo) {
    throw newError(
      c.ERROR_DB_READ_EMPTY,
      " can't get workoutRepo: " + JSON.stringify(error, Object.getOwnPropertyNames(error))
    );
  }
  var dict = {}; //{wid1:userworkout1, wid2:userworkout2 ...}
  var wids = meta.map(o => {
    dict[o.wid] = o;
    return o.wid;
  });
  if (wids.length == 0) {
    return [];
  }
  let result = wids.map(wid => {
    // 有可能该wid已经被删掉了，这里判断一下。后面的filter是过滤空值
    if (workoutsRepo[wid]) {
      return {
        ...workoutsRepo[wid],
        userInfo: infoMapper(dict[wid])
      };
    }
  }).filter(w => w);
  return result
}

/**
 *  修改user_workouts(支持修改多属性),增加乐观锁（updatedAt)
 *  只供内部使用
 *  data里不需要传入新的updatedAt
*/
async function internalUpdateUserWorkout({ uuid, wid, lastUpdatedAt, data, db }) {
  if (!wid || !uuid) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, " wid, uuid, column");
  }
  const currentTimestamp = Date.now()
  // 本次要更新的数据
  let updateData = [{ updatedAt: currentTimestamp }]
  for (let attr in data) {
    if (data.hasOwnProperty(attr) && data[attr]) {
      updateData.push({ [attr]: data[attr] });
    }
  }
  // 乐观锁
  let condition = new TableStore.SingleColumnCondition('updatedAt', lastUpdatedAt, TableStore.ComparatorType.EQUAL);

  let updateParams = {
    tableName: c.DB_USER_WORKOUTS,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, condition),
    primaryKey: [
      { [c.DB_USER_WORKOUTS_PK1]: uuid },
      { [c.DB_USER_WORKOUTS_PK2]: wid }
    ],
    updateOfAttributeColumns: [{ PUT: updateData }]
  };

  try {
    await db.updateRow(updateParams);
    return true; //TODO
  } catch (error) {
    throw newError(
      c.ERROR_DB_UPDATE_FAIL,
      " user_workouts, while internalUpdateUserWorkout, " + JSON.stringify(error, Object.getOwnPropertyNames(error))
    );
  }
}

//获取该用户训练信息
async function internalGetUserWorkout(uuid, wid, db) {
  const getUserWorkoutParam = {
    tableName: c.DB_USER_WORKOUTS,
    primaryKey: [
      { [c.DB_USER_WORKOUTS_PK1]: uuid },
      { [c.DB_USER_WORKOUTS_PK2]: wid }
    ]
  };
  const userWorkout = await db.getRow(getUserWorkoutParam);
  if (!userWorkout["row"].hasOwnProperty("attributes")) {
    return null;
  }
  const userWorkoutInfo = {};
  userWorkoutInfo.wid = wid;
  userWorkoutInfo.uid = uuid;
  userWorkout["row"]["attributes"].forEach(attr => {
    userWorkoutInfo[attr.columnName] = attr.columnValue;
  });
  return userWorkoutInfo;
}

// 用户通过他人分享进入小程序时，通过此函数获得分享者上一次做该训练时的信息
async function getReferUserWorkout({ uid, wid, db }) {
  if (!wid || !uid) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, " wid or uid");
  }
  try {
    //获取用户信息
    const userInfo = await getUserInfo({ uuid: uid, db: db });
    //获取用户训练信息
    const userWorkout = await internalGetUserWorkout(uid, wid, db);
    // 返回用户信息+用户训练信息
    return {
      ...userWorkout,
      userInfo
    };
  } catch (error) {
    throw newError(c.ERROR_GET_REFER_USER_INFO, error);
  }
}

//在获取单个训练详情时，附带上user-workouts（包含是否完成过等信息）
async function getWorkoutById({ uuid, id, db }) {
  if (!id) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "id");
  }
  let workoutInfo = await internalGetWorkoutInfo(id, db);
  const userWorkout = await internalGetUserWorkout(uuid, id, db);
  if (userWorkout) {
    workoutInfo.userInfo = {
      finishedCount: userWorkout.finishedCount,
      finishedAt: userWorkout.finishedAt,
      viewedAt: userWorkout.viewedAt
    }
  }
  return workoutInfo
}

//生成训练分享二维码
async function getWorkoutCode({ uuid, id, platform = "wx", db, dbProd }) {
  if (!uuid || !id) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "uuid or id");
  }
  if (platform == "swan") {
    return {
      tempFileURL: ossImgAddr("qrcode_small.jpg")
    }
  }
  const userWorkout = await internalGetUserWorkout(uuid, id, db);
  const userInfo = await getUserInfo({ uuid: uuid, db: db });
  const workoutInfo = await internalGetWorkoutInfo(id, db);
  if (!userWorkout || !userInfo || !userInfo.scode || !workoutInfo.scode) {
    throw newError(
      c.ERROR_DB_READ_EMPTY,
      "at getWorkoutCode, can't get scode"
    );
  }
  // 判断之前是否有缓存
  if (userWorkout.ossAddr3) {
    const ossUrl = "https://assets.pulsefitness.club/" + userWorkout.ossAddr3;
    return {
      tempFileURL: ossUrl
    };
  } else {
    // 获取二维码图片
    const scene = "w=" + workoutInfo.scode + ",u=" + userInfo.scode;
    const wxAccessToken = await getWxAccessToken(dbProd);
    const requestData = {
      scene: scene,
      is_hyaline: true,
      auto_color: true,
      page: "pages/workout/workout"
    };
    const url =
      "https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=" +
      wxAccessToken;
    const wxacode = await promisPostRequest({
      url,
      method: "POST",
      json: true,
      encoding: null,
      body: requestData
    });
    //保持二维码图片到oss
    let ossAddr3 =
      "wxacode/w" + workoutInfo.scode + "u" + userInfo.scode + ".jpg";
    try {
      await oss.put(ossAddr3, new Buffer(wxacode.body));
    } catch (e) {
      throw newError(c.ERROR_OSS, "put fail at getWorkoutCode " + e);
    }
    //添加ossAddr到User_Workouts表
    let { updatedAt: lastUpdatedAt } = userWorkout
    await internalUpdateUserWorkout({ uuid, wid: id, lastUpdatedAt, data: { ossAddr3 }, db });
    //oss文件临时访问地址
    const ossUrl = "https://assets.pulsefitness.club/" + ossAddr3;
    return {
      tempFileURL: ossUrl
    };
  }
}

async function getWorkoutBySceneCode({ scene, db }) {
  if (!scene) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "scene");
  }
  let [wpair, upair] = scene.split(",");
  let [wstring, wcode] = wpair.split("=");
  let [ustring, ucode] = upair.split("=");
  try {
    let userId = await getIdbyScode("users", Number(ucode), db);
    const workoutId = await getIdbyScode("workouts", Number(wcode), db);
    const userInfo = await getUserInfo({ uuid: userId, db: db });
    const workoutInfo = await internalGetWorkoutInfo(workoutId, db);
    return {
      workout: workoutInfo,
      referrerUser: userInfo
    };
  } catch (error) {
    throw newError(c.ERROR_SCENE_CODE, error);
  }
}

//内部辅助函数，通过scode获得user或workout的id
async function getIdbyScode(tablename, scode, db) {
  let pk = "";
  let indexname = "";
  switch (tablename) {
    case "users":
      pk = "uuid";
      indexname = "users_scode";
      break;
    case "workouts":
      pk = "_id";
      indexname = "workout_scode";
      break;
  }
  let indexParams = {
    tableName: indexname,
    direction: TableStore.Direction.BACKWARD,
    inclusiveStartPrimaryKey: [
      { scode: TableStore.Long.fromNumber(scode) },
      { [pk]: TableStore.INF_MAX }
    ],
    exclusiveEndPrimaryKey: [
      { scode: TableStore.Long.fromNumber(scode) },
      { [pk]: TableStore.INF_MIN }
    ],
    limit: 3
  };
  try {
    const rangeResult = await db.getRange(indexParams);
    if (rangeResult["rows"].length > 0) {
      return rangeResult["rows"][0]["primaryKey"][1]["value"];
    } else {
      return null
    }
  } catch (e) {
    throw newError(c.ERROR_DB_GET_RANGE_FAIL, "getIdbyScode" + JSON.stringify(e, Object.getOwnPropertyNames(e)));
  }
}

/**
 * 接收用户的订阅，保存到数据库
 */
async function handleWXRequestSubscribMessage(meta) {
  const { subscribTmplId, subscribData = null, token, db } = meta;
  if (!subscribTmplId) {
    throw newError(c.ERROR_MISS_REQUIRED_PARAMETER, "subscribTmplId");
  }
  // 获取openid
  const tokenPK = [{ [c.DB_TOKENS_PK1]: token }];
  const tokenInfo = await internalCheckRowExist(c.DB_TOKENS, tokenPK, db);
  if (!tokenInfo) {
    throw newError(c.ERROR_TOKEN_NOT_EXIST);
  } else if (!tokenInfo.openid) {
    throw newError(c.ERROR_TOKEN_HAS_NO_OPENID);
  }
  const openid = tokenInfo.openid;
  const insertData = {
    templateId: subscribTmplId,
    touser: openid,
    data: subscribData
  };
  try {
    await internalPutSubscribMessage(insertData, db);
    return { success: true };
  } catch (error) {
    throw newError(
      c.ERROR_DB_WRITE_FAIL,
      " while internalPutSubscribMessage " + error
    );
  }
}

async function internalPutSubscribMessage(insertData, db) {
  const { templateId, touser, data } = insertData;
  let attributeColumns = [];
  if (data) {
    for (let attr in data) {
      attributeColumns.push({ [attr]: data[attr] });
    }
  }
  let params = {
    tableName: c.DB_SUBSCRIBE_MESSAGE,
    condition: new TableStore.Condition(
      TableStore.RowExistenceExpectation.IGNORE,
      null
    ),
    primaryKey: [
      { [c.DB_SUBSCRIBE_MESSAGE_PK1]: templateId },
      { [c.DB_SUBSCRIBE_MESSAGE_PK2]: touser }
    ],
    attributeColumns: attributeColumns
  };
  await db.putRow(params);
}

async function shareFinishedWorkout({ uuid, wid, resp, db }) {
  let userWorkoutInfo = await getReferUserWorkout({ wid, uid: uuid, db })
  let workoutInfo = await internalGetWorkoutInfo(wid, db)

  if (!userWorkoutInfo || !workoutInfo) {
    throw newError(c.ERROR_DB_READ_EMPTY, " in shareFinishedWorkout")
  }

  let avatarFileUrl = userWorkoutInfo.userInfo.avatarUrl ? userWorkoutInfo.userInfo.avatarUrl : null
  let count = userWorkoutInfo.finishedCount

  try {
    var buffer = await images.generateCardImage({
      coverFileUrl: workoutInfo.coverImage,
      avatarFileUrl,
      count,
      duration: workoutInfo.duration,
      calories: workoutInfo.estCalories,
      workoutTitle: workoutInfo.title,
      workoutTypeDisplay: internalWorkoutTypeDisplay(workoutInfo.workoutType),
      outputFormat: "JPG"
    })
    if (buffer && Buffer.isBuffer(buffer)) {
      resp.setHeader("content-type", 'image/jpeg');
      return buffer
    } else {
      throw newError(c.ERROR_IMAGE, `error buffer. buffer=${JSON.stringify(buffer)}`)
    }
  } catch (error) {
    throw newError(c.ERROR_IMAGE, " in shareFinishedWorkout. error=" + JSON.stringify(error))
  }
}

exports.getReferUserWorkout = getReferUserWorkout;
exports.internalGetWorkoutInfo = internalGetWorkoutInfo;

exports.register = function (reg) {
  reg(c.TYPE_GET_VIEWED_WORKOUTS, getViewedWorkouts);
  reg(c.TYPE_GET_FINISHED_WORKOUTS, getFinishedWorkouts);
  reg(c.TYPE_GET_UNRELEASED_WORKOUTS, getUnreleasedWorkouts);
  reg(c.TYPE_GET_NEW_RELEASED_WORKOUTS, getNewReleasedWorkouts);
  reg(c.TYPE_GET_NEW_RELEASED_TIMESTAMP, getNewReleasedTimestamp);
  reg(c.TYPE_GET_TYPED_WORKOUTS, getTypedWorkouts);
  reg(c.TYPE_GET_TAG_WORKOUTS, getTagWorkouts);
  reg(c.TYPE_REQUEST_SUBSCRIBE_MESSAGE, handleWXRequestSubscribMessage);

  reg(c.TYPE_GET_WORKOUT_BY_ID, getWorkoutById);
  reg(c.TYPE_GET_WORKOUT_CODE, getWorkoutCode);
  reg(c.TYPE_GET_WORKOUT_BY_SCENE_CODE, getWorkoutBySceneCode);
  reg(c.TYPE_GET_RECOMMENDED_WORKOUTS, getRecommendedWorkouts);
  reg(c.TYPE_GET_USER_WORKOUT, getReferUserWorkout);
  reg(c.TYPE_GET_DISCOVER_BLOCKS, getDiscoverBlocks);
  reg(c.TYPE_GET_TRAINER_WORKOUTS, getTrainerWorkouts);
  reg(c.TYPE_GET_COLLECTION_WORKOUTS, getCollectionWorkouts);
  reg(c.TYPE_VIEW_WORKOUT, viewWorkout);
  reg(c.TYPE_START_WORKOUT, startWorkout);
  reg(c.TYPE_FINISH_WORKOUT, finishWorkout);
  reg(c.TYPE_START_SESSION, startSession);
  reg(c.TYPE_TOUCH_SESSION, touchSession);
  reg(c.TYPE_FINISH_SESSION, finishSession);
  reg(c.TYPE_UPDATE_PLAYHEAD, updatePlayhead);
  reg(c.TYPE_CHECK_UNFINISHED_SESSION, checkUnfinishedSession);
  reg(c.TYPE_SHARE_FINISHED_WORKOUT, shareFinishedWorkout);

  reg(c.TYPE_GET_MINE_PAGE_DATA, getMinePageData);
  reg(c.TYPE_GET_HISTORY, getHistory);
  // reg(c.TYPE_GET_WEEKLY_REPORT, getWeeklyReport);

};
