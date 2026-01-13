import { AbstractTool } from './AbstractTool.js'
import { Config } from '../config.js'
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

  // 从锅巴配置获取网易云Cookie
  getNeteaseCookie() {
    return Config.neteaseMusicCookie || ''
  }

  // 获取网易云音乐播放URL
  async getNeteasePlayUrl(songId) {
    try {
      let wyck = this.getNeteaseCookie()
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