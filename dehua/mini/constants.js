module.exports = Object.freeze({
  TYPE_LOGIN_WXO: "LOGIN_WXO",
  TYPE_LOGIN_WXU: "LOGIN_WXU",
  TYPE_LOGIN_SWO: "LOGIN_SWO",
  TYPE_LOGIN_SWD: "LOGIN_SWD",
  TYPE_LOGIN_SWU: "LOGIN_SWU",
  TYPE_REFRESH_TOKEN: "REFRESH_TOKEN",
  TYPE_INTERNAL_WORKOUT_COMPLETE_INFO: "INTERNAL_WORKOUT_COMPLETE_INFO",
  TYPE_INTERNAL_USER_ACTIVITY_DETAIL: "INTERNAL_USER_ACTIVITY_DETAIL",

  TYPE_UPDATE_USER_INFO: "UPDATE_USER_INFO",
  TYPE_GET_USER_INFO: "GET_USER_INFO",
  TYPE_GET_USER_INFO_BY_ID: "GET_USER_INFO_BY_ID",
  TYPE_DECODE_SHARE_TICKET: "DECODE_SHARE_TICKET",

  TYPE_UPDATE_USER_PROFILE: "UPDATE_USER_PROFILE",
  TYPE_GET_CURRENT_USER_PROFILE: "GET_CURRENT_USER_PROFILE",
  TYPE_GET_HISTORY_USER_PROFILE: "GET_HISTORY_USER_PROFILE",
  TYPE_GET_FITNESS_REPORT: "GET_FITNESS_REPORT",

  TYPE_SEND_AUTH_CODE_TO_WX_BINDED_PHONE: "SEND_AUTH_CODE_TO_WX_BINDED_PHONE",
  TYPE_SEND_AUTH_CODE_TO_NEW_PHONE: "SEND_AUTH_CODE_TO_NEW_PHONE",
  TYPE_BIND_PHONE: "BIND_PHONE",
  TYPE_GET_PHONE_NUMBER_DISPLAY: "GET_PHONE_NUMBER_DISPLAY",

  TYPE_REQUEST_SUBSCRIBE_MESSAGE: "REQUEST_SUBSCRIBE_MESSAGE",
  TYPE_GET_WX_ACCESS_TOKEN: "GET_WX_ACCESS_TOKEN",

  TYPE_GET_DISCOVER_BLOCKS: "GET_DISCOVER_BLOCKS",
  
  TYPE_GET_VIEWED_WORKOUTS: "GET_VIEWED_WORKOUTS",
  TYPE_GET_FINISHED_WORKOUTS: "GET_FINISHED_WORKOUTS",
  TYPE_GET_RECOMMENDED_WORKOUTS: "GET_RECOMMENDED_WORKOUTS",
  TYPE_GET_UNRELEASED_WORKOUTS: "GET_UNRELEASED_WORKOUTS",
  TYPE_GET_NEW_RELEASED_WORKOUTS: "GET_NEW_RELEASED_WORKOUTS",
  TYPE_GET_NEW_RELEASED_TIMESTAMP: "GET_NEW_RELEASED_TIMESTAMP",
  TYPE_GET_TYPED_WORKOUTS: "GET_TYPED_WORKOUTS",
  TYPE_GET_TAG_WORKOUTS: "GET_TAG_WORKOUTS",
  TYPE_GET_TRAINER_WORKOUTS: "GET_TRAINER_WORKOUTS",
  TYPE_GET_COLLECTION_WORKOUTS: "GET_COLLECTION_WORKOUTS",
  TYPE_CHECK_WORKOUT_TOKEN: "CHECK_WORKOUT_TOKEN",

  TYPE_GET_WORKOUT_BY_ID: "GET_WORKOUT_BY_ID",
  TYPE_GET_WORKOUT_CODE: "GET_WORKOUT_CODE",
  TYPE_GET_WORKOUT_BY_SCENE_CODE: "GET_WORKOUT_BY_SCENE_CODE",
  TYPE_GET_USER_WORKOUT: "GET_USER_WORKOUT",

  TYPE_VIEW_WORKOUT: "VIEW_WORKOUT",
  TYPE_START_WORKOUT: "START_WORKOUT",
  TYPE_FINISH_WORKOUT: "FINISH_WORKOUT",
  TYPE_SHARE_FINISHED_WORKOUT: "SHARE_FINISHED_WORKOUT",
  TYPE_CHECK_UNFINISHED_SESSION: "CHECK_UNFINISHED_SESSION",

  TYPE_START_SESSION: "START_SESSION",
  TYPE_TOUCH_SESSION: "TOUCH_SESSION",
  TYPE_UPDATE_PLAYHEAD: "UPDATE_PLAYHEAD",
  TYPE_FINISH_SESSION: "FINISH_SESSION",

  TYPE_GET_MINE_PAGE_DATA: "GET_MINE_PAGE_DATA",
  TYPE_GET_HISTORY: "GET_HISTORY",
  TYPE_GET_WEEKLY_REPORT: "GET_WEEKLY_REPORT",

  WORKOUT_TYPE_TREADMILL: "TREADMILL",
  WORKOUT_TYPE_OUTDOOR_RUNNING: "OUTDOOR_RUNNING",
  WORKOUT_TYPE_ELLIPTICAL: "ELLIPTICAL",
  WORKOUT_TYPE_ROWING: "ROWING",
  WORKOUT_TYPE_STRETCHING: "STRETCHING",
  WORKOUT_TYPE_INDOOR_CYCLING: "INDOOR_CYCLING",

  TIME_MILLISECONDS_IN_ONE_DAY: 86400000,

  DB_SCODE: "scode",
  DB_SCODE_PK1: "tablename",
  DB_SCODE_COL_SCODE: "scode",

  DB_OPENID: "openid",
  DB_OPENID_PK1: "openid",
  DB_OPENID_PK2: "platform",
  DB_OPENID_COL_UUID: "uuid",

  DB_UNIONID: "unionid",
  DB_UNIONID_PK1: "unionid",
  DB_UNIONID_PK2: "platform",
  DB_UNIONID_COL_UUID: "uuid",

  DB_TOKENS: "tokens",
  DB_TOKENS_PK1: "accessToken",
  DB_TOKENS_COL_UUID: "uuid",
  DB_TOKENS_COL_REF_TOKEN: "refreshToken",
  DB_TOKENS_COL_EXPIRED_AT: "expiredAt",
  DB_TOKENS_COL_ANONYMOUS: "anonymous",

  DB_USERS: "users",
  DB_USERS_PK1: "uuid",
  DB_USERS_COL_CREATED_AT: "createdAt",
  DB_USERS_COL_SCODE: "scode",

  DB_USER_PROFILE: "user_profile",
  DB_USER_PROFILE_PK1: "uuid",

  DB_SMS_AUTH_CODE: "sms_auth_code",
  DB_SMS_AUTH_CODE_PK1: "phoneNumber",
  DB_SMS_AUTH_CODE_COL_SMS_CODE: "smsCode",

  DB_TEMP_SESSION: "temp_session",
  DB_TEMP_SESSION_PK1: "key",
  DB_TEMP_SESSION_COL_TOKEN: "token",

  DB_PHONE_NUMBER: "phone_number",
  DB_PHONE_NUMBER_PK1: "phoneNumber",
  DB_PHONE_NUMBER_COL_UUID: "uuid",

  DB_WORKOUT_SESSION: "workout_session",

  DB_WORKOUTS: "workouts",
  DB_WORKOUTS_PK1: "_id",
  DB_WORKOUTS_COL_CREATED_AT: "createdAt",
  DB_WORKOUTS_COL_RELEASED_AT: "releasedAt",
  DB_WORKOUTS_COL_TYPE: "workoutType",

  DB_USER_WORKOUTS: "user_workouts",
  DB_USER_WORKOUTS_PK1: "uuid",
  DB_USER_WORKOUTS_PK2: "wid",
  DB_USER_WORKOUTS_COL_CREATED_AT: "createdAt",
  DB_USER_WORKOUTS_COL_VIEWED_AT: "viewedAt",
  DB_USER_WORKOUTS_COL_FINISHED_AT: "finishedAt",
  DB_USER_WORKOUTS_COL_FINISHED_COUNT: "finishedCount",

  DB_ACTIONS: "actions",
  DB_ACTIONS_PK1: "uuid",
  DB_ACTIONS_PK2: "wid",
  DB_ACTIONS_PK3: "_id",
  DB_ACTIONS_COL_CREATED_AT: "createdAt",
  DB_ACTIONS_COL_TYPE: "type",

  DB_SUBSCRIBE_MESSAGE: "subscribe_message",
  DB_SUBSCRIBE_MESSAGE_PK1: "template_id",
  DB_SUBSCRIBE_MESSAGE_PK2: "touser",
  DB_SUBSCRIBE_MESSAGE_COL_DATA: "data",

  ERROR_TOKEN_NOT_EXIST: {
    errCode: 4011,
    message: "Can't match any AccessToken in DB "
  },
  ERROR_TOKEN_EXPIRED: {
    errCode: 4012,
    message: "AccessToken is expired, please refresh your token "
  },
  ERROR_TOKEN_IS_USED: {
    errCode: 4013,
    message: "This refreshToken has been used, please try login again "
  },
  ERROR_LOGIN: {
    errCode: 4014,
    message: "Error in handleLogin or handleRefreshToken "
  },
  ERROR_USERINFO: {
    errCode: 4015,
    message: "Fail get userInfo: "
  },
  ERROR_DUPLICATED_PHONE_NUMBER: {
    errCode: 4016,
    message:
      "This PhoneNumber has already been registed, please change another number or unBind the old number.  "
  },
  ERROR_SMS_AUTH_CODE_SEND_FAIL: {
    errCode: 4017,
    message: "Fail Sending SMS code. "
  },
  ERROR_SMS_AUTH_CODE_EMPTY: {
    errCode: 4018,
    message: "This PhoneNumber matchs no sms auth code in the DB. "
  },
  ERROR_SMS_AUTH_CODE_WRONG: {
    errCode: 4019,
    message: "sms auth code does not match. "
  },
  ERROR_THIS_UUID_ALREADY_HAVE_PHONE_NUMBER: {
    errCode: 4020,
    message: "This user have binded to another phone number. "
  },
  ERROR_TOKEN_HAS_NO_OPENID: {
    errCode: 4030,
    message: "This token has no openid, please refresh and get a new token "
  },

  ERROR_DB_READ_EMPTY: {
    errCode: 4021,
    message: "Provided pk find no match in db: "
  },
  ERROR_DB_WRITE_FAIL: {
    errCode: 4022,
    message: "Fail Adding new item to: "
  },
  ERROR_DB_UPDATE_FAIL: {
    errCode: 4023,
    message: "Failing update: "
  },
  ERROR_DB_GET_RANGE_FAIL: {
    errCode: 4024,
    message: "Fail get range: "
  },
  ERROR_DB_BATCH_READ_FAIL: {
    errCode: 4025,
    message: "BatchRead Fail "
  },
  ERROR_DB_BATCH_WRITE_FAIL: {
    errCode: 4026,
    message: "Batch READ Fail "
  },
  ERROR_DB_INTERNAL: {
    errCode: 4027,
    message: "DB internal error "
  },
  ERROR_DB_INIT_FAIL: {
    errCode: 4028,
    message: "DB initial fail due to invalid request path "
  },
  ERROR_DB_EMPTY_ROW: {
    errCode: 4029,
    message: "The row pased to internalGetRowAttrs is empty "
  },

  ERROR_MISS_REQUIRED_PARAMETER: {
    errCode: 4031,
    message: "Miss required parameter: "
  },
  ERROR_UNSUPPORTED_TYPE: {
    errCode: 4032,
    message: "Request Type is not supported: "
  },
  ERROR_WORKOUT_LOCK: {
    errCode: 4033,
    message: "This workout is locked."
  },
  ERROR_CLOSED_SESSION: {
    errCode: 4034,
    message: "This session is closed. "
  },
  ERROR_IMAGE: {
    errCode: 4035,
    message: "Image error: "
  },

  ERROR_API_WX: {
    errCode: 4041,
    message: "WX API: "
  },
  ERROR_OSS: {
    errCode: 4042,
    message: "OSS Error: "
  },
  ERROR_API_SWAN: {
    errCode: 4043,
    message: "SWAN API: "
  },

  ERROR_GET_REFER_USER_INFO: {
    errCode: 4051,
    message: "Fail Get Refer user_workouts info: "
  },
  ERROR_SCENE_CODE: {
    errCode: 4052,
    message: "Fail Get Scene Code: "
  },

  ERROR_INTERNAL_ENCRYPT: {
    errCode: 4061,
    message: "Internal Encryption Fail: "
  },

  ERROR_UNDEFINED_CODE: 4070
});
