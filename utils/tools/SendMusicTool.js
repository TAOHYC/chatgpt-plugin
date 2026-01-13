import { AbstractTool } from './AbstractTool.js'
import YAML from 'yaml'
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

export class SendMusicTool extends AbstractTool {
  name = 'sendMusic'

  parameters = {
    properties: {
      id: {
        type: 'string',
        description: '音乐的id'
      },
      targetGroupIdOrQQNumber: {
        type: 'string',
        description: 'Fill in the target user_id or groupId when you need to send music to specific group or user, otherwise leave blank'
      }
    },
    required: ['id']
  }

  // 获取配置文件路径
  getConfigPath() {
    const DATA_DIR = path.join(process.cwd(), 'plugins/musicShare/data')
    const CONFIG_PATH = path.join(DATA_DIR, 'config.yaml')
    
    // 确保目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }

    // 确保配置文件存在
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, YAML.stringify({
        wyck: '0050705497FF5123F4341A4B3A03817F1AA12AED60AEDC0D0877CE692D0CF08D06E45D2864FF1F61279CA7FA1337EF37F500DBB94BD186EF01E1D2F3153276C3CD2BBD407D6B929F55FAE52761DC6C669BDD15B8D1671B13B5536BD3D10E63B8910CF7C86FFD1EF0715F6E1A16398CDECE1A40DA4F0042A5D9378FA0FD102E3F5CF5C33CB779A37B0789421AB2C5C22D67634D2D105B4A2FDB02F62E88F9652EF8600640394A5116594682B1B4E9A52061B81AF945ED21F8EE99B53767039E0669BB61E6203BDD1A3A6CE95B11DA6F2E1A8ECD59AFA8184BB6D3BB3CE807589265023165250D59FBA2F5D756F4DC65DF60A9DBFBEE64135ED944F478FE9F45D9FACF4DB1A6744F8AEDA04730BC8AFE5A7D82CE20E77C75660208EA1774A92541542924221622AAB0F7C08156D1039CFC19A229D5C99CA59E463760CFDC951606853DC16BE0A50C70E5745881B1E439F609'
      }))
    }

    return CONFIG_PATH
  }

  // 获取网易云音乐播放URL
  async getNeteasePlayUrl(songId) {
    try {
      const CONFIG_PATH = this.getConfigPath()
      let config = YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      let wyck = config.wyck
      let ids = String(songId)
      let url = 'http://music.163.com/song/media/outer/url?id=' + ids

      let options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI Build/SKQ1.211230.001)',
          'Cookie': 'versioncode=8008070; os=android; channel=xiaomi; ;appver=8.8.70; ' + "MUSIC_U=" + wyck
        },
        body: `ids=${JSON.stringify([ids])}&level=standard&encodeType=mp3`
      }
      
      let response = await fetch('https://music.163.com/api/song/enhance/player/url/v1', options)
      let res = await response.json()
      
      if (res.code == 200 && res.data[0]?.url) {
        return res.data[0].url
      }
      
      return url // 返回默认URL作为备选
    } catch (error) {
      console.log('获取网易云音乐播放URL失败:', error)
      return `http://music.163.com/song/media/outer/url?id=${songId}`
    }
  }

  // 判断机器人类型
  getBotType(e) {
    const userId = e.user_id || e.author?.id || e.sender?.user_id
    if (/^\d+$/.test(userId)) {
      return 'onebot'
    }
    if (userId && (userId.includes('_') || userId.includes('-') || /[a-zA-Z]/.test(userId))) {
      return 'qqguild'
    }
    return 'onebot'
  }

  func = async function (opts, e) {
    let { id, targetGroupIdOrQQNumber } = opts
    // 非法值则发送到当前群聊
    const defaultTarget = e.isGroup ? e.group_id : e.sender.user_id
    const target = isNaN(targetGroupIdOrQQNumber) || !targetGroupIdOrQQNumber
      ? defaultTarget
      : parseInt(targetGroupIdOrQQNumber) === e.bot.uin ? defaultTarget : parseInt(targetGroupIdOrQQNumber)

    // 判断机器人类型
    const botType = this.getBotType(e)

    try {
      let resultMessage = ''

      // 根据机器人类型决定发送内容
      if (botType === 'onebot') {
        // 首先发送音乐分享卡片
        let group = await e.bot.pickGroup(target)
        
        // 检查是否支持 shareMusic 方法
        if (typeof group.shareMusic === 'function') {
          await group.shareMusic('163', id)
        } else {
          // 构建音乐分享消息
          const musicMsg = {
            type: 'music',
            data: {
              type: '163',
              id: id,
              jumpUrl: `https://music.163.com/#/song?id=${id}`
            }
          }
          await e.reply(musicMsg)
        }
        resultMessage += '音乐卡片已发送，'

        // 获取网易云音乐播放URL并发送语音
        try {
          const playUrl = await this.getNeteasePlayUrl(id)
          
          // 创建语音消息
          const recordMsg = segment.record(playUrl)
          await e.reply(recordMsg)
          
          resultMessage += '语音已发送'
          return `${resultMessage}到 ${target}`
        } catch (voiceError) {
          console.log('发送语音失败:', voiceError)
          return `音乐卡片已发送到 ${target}，但语音发送失败: 歌曲文件可能太大或无法访问`
        }

      } else {
        
        // 获取网易云音乐播放URL并发送语音
        try {
          const playUrl = await this.getNeteasePlayUrl(id)
          
          // 创建语音消息
          const recordMsg = segment.record(playUrl)
          await e.reply(recordMsg)
          
          return `语音已成功发送到 ${target}`
        } catch (voiceError) {
          console.log('发送语音失败:', voiceError)
          return `语音发送失败: 歌曲文件可能太大或无法访问`
        }
      }

    } catch (error) {
      console.log('发送音乐失败:', error)
      return `音乐分享失败: ${error.message || error}`
    }
  }

  description = 'Useful when you want to share music. You must use searchMusic first to get the music id.Please do not use ⤶ to segment your reply.If no extra description needed, just reply <EMPTY> at the next turn'
}