import { Config } from '../utils/config.js'
import { getChatHistoryGroup } from '../utils/chat.js'
import { convertFaces } from '../utils/face.js'
import { customSplitRegex, filterResponseChunk } from '../utils/text.js'
import core, { roleMap } from '../model/core.js'
import { formatDate } from '../utils/common.js'

export class bym extends plugin {
  constructor () {
    super({
      name: 'ChatGPT-Plugin 伪人bym',
      dsc: 'bym',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: '5000',
      rule: [
        {
          reg: '^[^#][sS]*',
          fnc: 'bym',
          priority: '-1000000',
          log: false
        }
      ]
    })
  }

  /**
   * 计算模拟人类打字的延迟时间
   * @param {string} text 要发送的文本
   * @returns {number} 延迟时间(毫秒)
   */
  calculateTypingDelay(text) {
    // 基本打字速度：假设平均每个字符200毫秒
    const baseSpeed = 200; // 毫秒/字符
    
    // 获取字符数
    const charCount = text.length;
    
    // 计算基础延迟时间（毫秒）
    let delay = charCount * baseSpeed;
    
    // 设置最小延迟和最大延迟
    const minDelay = 800;
    const maxDelay = 5000;
    
    // 确保延迟在合理范围内
    delay = Math.max(minDelay, delay);
    delay = Math.min(maxDelay, delay);
    
    // 添加随机波动(±15%)，让打字感觉更自然
    const randomFactor = 0.85 + (Math.random() * 0.3); // 0.85-1.15之间的随机数
    delay = Math.round(delay * randomFactor);
    
    return delay;
  }

  /** 复读 */
  async bym (e) {
    if (e.atme) {
      return false
    }

    if (!Config.enableBYM) {
      return false
    }

    if (Config.assistantLabel && e.msg?.includes(Config.assistantLabel)) {
      return await this.triggerReply(e, true)
    }

    // 伪人禁用群
    if (Config.bymDisableGroup?.includes(e.group_id?.toString())) {
      return false
    }

    // 普通概率触发逻辑
    return await this.triggerReply(e, false)
  }

  /** 触发回复逻辑 */
  async triggerReply(e, forceReply = false) {
    let sender = e.sender.user_id
    let card = e.sender.card || e.sender.nickname
    let group = e.group_id
    let prop = forceReply ? -1 : Math.floor(Math.random() * 100)
    
    let fuck = false
    let candidate = Config.bymPreset
    if (Config.bymFuckList?.find(i => e.msg?.includes(i))) {
      fuck = true
      candidate = candidate + Config.bymFuckPrompt
    }
    
    if (prop < Config.bymRate) {
      logger.info(`随机聊天命中，触发方式: ${forceReply ? '强制触发' : '概率触发'}，概率值: ${prop}`)
      // 获取群聊上下文
      let chats = await getChatHistoryGroup(e, Config.groupContextLength)
      
      let system = `你的名字是"${Config.assistantLabel}"，你在一个qq群里，群号是${group},当前和你说话的人群名片是${card}, qq号是${sender}, 请你结合用户的发言和聊天记录作出回应，要求表现得随性一点，最好参与讨论，混入其中。不要过分插科打诨诨，不知道说什么可以复读群友的话。要求你做搜索、发图、发视频和音乐等操作时要使用工具。禁止直接发"[图片]"这样的来蒙混过关。要求优先使用中文进行对话，不使用颜文字。禁止发送CQ码，禁止发送网址链接。如果此时不需要自己说话，可以只回复<EMPTY>` +
        candidate +
        `\n你的回复应该尽可能简练，像人类一样随意，不要附加任何奇怪的东西，如聊天记录的格式（比如${Config.assistantLabel}：），禁止重复聊天记录。`

      let rsp = await core.sendMessage(e.msg, {}, Config.bymMode, e, {
        enableSmart: Config.smartMode,
        system: {
          api: system,
          qwen: system,
          bing: system,
          claude: system,
          claude2: system,
          gemini: system,
          xh: system
        },
        settings: {
          replyPureTextCallback: msg => {
            msg = filterResponseChunk(msg)
            msg && e.reply(msg)
          },
          // 强制打开上下文，不然伪人笨死了
          enableGroupContext: true,
          // 传递群聊上下文
          groupContext: chats
        }
      })
      
      let text = rsp.text
      let texts = customSplitRegex(text, /(?<!\?)[。？\n](?!\?)/, 3)
      
      for (let t of texts) {
        if (!t) {
          continue
        }
        t = t.trim()
        if (text[text.indexOf(t) + t.length] === '？') {
          t += '？'
        }
        let finalMsg = await convertFaces(t, true, e)
        logger.info(JSON.stringify(finalMsg))
        finalMsg = finalMsg.map(filterResponseChunk).filter(i => !!i)
        
        if (finalMsg && finalMsg.length > 0) {
          // 先计算并等待模拟打字的延迟
          const typingDelay = this.calculateTypingDelay(t);
          logger.info(`模拟打字延迟：${typingDelay}ms，文本长度：${t.length}`);
          
          await new Promise(resolve => setTimeout(resolve, typingDelay));
          
          // 延迟后再发送消息
          if (Math.floor(Math.random() * 100) < 10) {
            await this.reply(finalMsg, true, {
              recallMsg: fuck ? 10 : 0
            })
          } else {
            await this.reply(finalMsg, false, {
              recallMsg: fuck ? 10 : 0
            })
          }
        }
      }
      return true
    }
    return false
  }
}