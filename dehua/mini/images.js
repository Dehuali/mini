const gm = require('gm').subClass({ imageMagick: true });
const axios = require('axios');
const temp = require('temp');
const moment = require('moment-timezone');
moment.tz.setDefault("Asia/Shanghai");

const streamToFile = (inp, ws) => {
    return new Promise((resolve, reject) => {
        inp.pipe(ws).on('finish', resolve).on('error', reject)
    })
}

/**
 * 生成训练打卡图
 * 
 *  @param options 打卡图配置参数
 *      coverFileUrl: 训练的封面图url地址（如下载失败将启用默认背景）
 *      avatarFileUrl: 头像图url地址（如下载失败将启用默认头像）
 *      workoutTitle: 训练名称（默认为空）
 *      count: 训练了第几次（默认为1）
 *      duration: 训练时长，单位秒（默认为0）
 *      calories: 消耗的千卡数（默认为0）
 *      outputFormat: 输出的文件格式（默认为PNG）
 */
function generateCardImage({ coverFileUrl, avatarFileUrl, workoutTitle = "", workoutTypeDisplay = "", count = 1, duration = 0, calories = 0, outputFormat = "PNG" }) {
    return new Promise(async (resolve, reject) => {

        temp.track();

        var baseDir = process.env["FC_FUNC_CODE_PATH"] ? process.env["FC_FUNC_CODE_PATH"] : __dirname + "/"

        // 背景图资源
        var defaultAvatarFile = `${baseDir}assets/avatar.png`
        var defaultCover = `${baseDir}assets/cover.png`
        var maskFile = `${baseDir}assets/mask.png`
        var maskAllFile = `${baseDir}assets/mask_all.png`
        var titleFontFile = `${baseDir}assets/PingFang-SC-Semibold.ttf`
        var digiFontFile = `${baseDir}assets/BebasNeue-Bold.ttf`
        var cardFile = `${baseDir}assets/card.png`

        //下载远端资源文件

        var coverFile = defaultCover
        var avatarFile = defaultAvatarFile
        try {
            var coverResp = await axios.get(coverFileUrl, { responseType: 'stream' });
            var coverTempFileStream = temp.createWriteStream();
            await streamToFile(coverResp.data, coverTempFileStream)
            coverFile = coverTempFileStream.path
        }
        catch (e) {
            console.error(`IMAGE_ERROR|${coverFileUrl}|${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
        }
        try {
            var avatarResp = await axios.get(avatarFileUrl, { responseType: 'stream' });
            var avatarTempFileStream = temp.createWriteStream();
            await streamToFile(avatarResp.data, avatarTempFileStream)
            avatarFile = avatarTempFileStream.path
        }
        catch (e) {
            console.error(`IMAGE_ERROR|${avatarFileUrl}|${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
        }



        // 动态文字
        var m = Math.floor(duration / 60)
        var s = duration % 60
        var mstr = (m < 10 ? "0" : "") + m //运动分钟
        var sstr = (s < 10 ? "0" : "") + s //运动秒数
        var countPrefix = count && count > 1 ? count.toString() : "首"
        var countstr = `${countPrefix}刷达成`
        var kcalstr = calories.toString()
        var now = moment()
        var datestr = now.format("MM/DD HH:mm")


        //颜色样式
        var textColor = "#3C3B3D"
        var highlightColor1 = "#6B4F95"
        var highlightColor2 = "#FFB318"
        var neutralColor1 = "#CDCDD7"
        var neutralColor2 = "#8D92A3"
        var bgBlockColor = "rgba(255,255,255,0.2)"

        //位置布局
        var imageWidth = 640 //整个图片的宽度
        var imageHeight = 1008 //整个图片的高度
        var outerPaddingX = 20 //最外面透明效果的外留白X宽度
        var outerPaddingY = 40 //最外面透明效果的外留白Y宽度
        var outterRectRadius = 20 //最外面透明边框的圆角度数
        var innerPaddingX = 50 //卡片的外留白X宽度
        var innerPaddingY = 74 //卡片的外留白Y宽度
        var avatarX = 247 //头像X
        var avatarY = 247 //头像Y
        var avatarWidth = 146 //头像宽度
        var avatarHeight = 146 //头像高度
        var avatarBorderX0 = 320 //头像外边框X0
        var avatarBorderY0 = 320 //头像外边框Y0
        var avatarBorderX1 = 373 //头像外边框X1
        var avatarBorderY1 = 373 //头像外边框Y1
        var avatarBorderWidth = 5 //头像外边框宽度
        var titleYOffset = -55 //大标题纵轴偏移
        var titleFontSize = 36 //大标题字号
        var subtitleYOffset = -15 //小标题纵轴偏移
        var subtitleFontSize = 24 //小标题字号
        var digiY = 180 //数字纵轴偏移
        var digiWidth = 26 //单个数字字体的宽度
        var digiFontSize = 72 //数字字号
        var digiSpacing = 5;
        var charFontSize = 32 //单位字号
        var charWidth = 36 //中文单位字体的单个字宽度
        var charY = 185 //中文单位字体的Y
        var digiCardWidth = 490 // 文字白色背景宽度
        var metaFontSize = 32 //角标日期字体大小
        var metaXOffset = -170 //角标日期X偏移
        var metaYOffset = 380 //角标日期Y偏移

        function drawDuration(state) {
            var offsetX = digiCardWidth / 4 - 20
            var charSecX = - offsetX + digiWidth * sstr.length + digiSpacing + charWidth / 2 + digiSpacing / 2
            var digiSecX = -offsetX + digiWidth * sstr.length / 2 + digiSpacing / 2
            var charMinX = - offsetX - charWidth / 2 - digiSpacing / 2
            var digiMinX = -offsetX - charWidth - digiWidth * mstr.length / 2 - digiSpacing / 2 - digiSpacing

            return state.fill(textColor)
                .font(digiFontFile, digiFontSize)
                .fill(textColor)
                .gravity("Center")
                .draw(`text ${digiMinX},${digiY} "${mstr}"`)
                .draw(`text ${digiSecX},${digiY} "${sstr}"`)
                .font(titleFontFile, charFontSize)
                .fill(neutralColor2)
                .draw(`text ${charMinX},${charY} "分"`)
                .draw(`text ${charSecX},${charY} "秒"`)
                .gravity(null)
        }

        function drawCalories(state) {
            var offsetX = digiCardWidth / 4
            var totalWidth = digiWidth * kcalstr.length + charWidth * 2 + digiSpacing
            var digiCalX = offsetX - totalWidth / 2 + digiWidth * kcalstr.length / 2
            var charCalX = digiCalX + digiWidth * kcalstr.length / 2 + charWidth + digiSpacing

            return state.fill(textColor)
                .font(digiFontFile, digiFontSize)
                .gravity("Center")
                .draw(`text ${digiCalX},${digiY} "${kcalstr}"`)
                .font(titleFontFile, charFontSize)
                .fill(neutralColor2)
                .draw(`text ${charCalX},${charY} "千卡"`)
                .gravity(null)
        }


        var state = gm(coverFile)
            .scale(null, imageHeight)
            .gravity("Center")
            .crop(imageWidth, imageHeight)
            .blur(7, 3)
            .gravity(null)
            .stroke(null)
            .fill(bgBlockColor)
            .drawRectangle(outerPaddingX, outerPaddingY, imageWidth - outerPaddingX, imageHeight - outerPaddingY, outterRectRadius, outterRectRadius)
            .draw(`image Over ${innerPaddingX},${innerPaddingY} 0,0 '${cardFile}'`)
            .mask(maskFile)
            .draw(`image Over ${avatarX},${avatarY} ${avatarWidth},${avatarHeight} '${avatarFile}'`)
            .mask(maskAllFile)
            .fill(null)
            .stroke(highlightColor2, avatarBorderWidth)
            .drawCircle(avatarBorderX0, avatarBorderY0, avatarBorderX1, avatarBorderY1)
            .stroke(null)
            .fill(textColor)
            .font(titleFontFile, titleFontSize)
            .drawText(0, titleYOffset, countstr, 'Center')
            .fill(highlightColor1)
            .font(titleFontFile, subtitleFontSize)
            .drawText(0, subtitleYOffset, workoutTypeDisplay + " • " + workoutTitle, 'Center')
            .fill(neutralColor1)
            .font(digiFontFile, metaFontSize)
            .drawText(metaXOffset, metaYOffset, datestr, 'Center')
        state = drawDuration(state)
        state = drawCalories(state)
        state.toBuffer(outputFormat, function (err, buffer) {
            temp.cleanup();
            if (!err) {
                resolve(buffer)
            }
            else {
                reject(err)
            }
        })
    })
}


module.exports.generateCardImage = generateCardImage
