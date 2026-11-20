# MMM-AIChat

智能魔镜的 AI 助手，提供 DeepSeek 多轮对话、流式回答、Bing RSS 联网检索、Whisper.cpp 语音识别、Piper/eSpeak NG 朗读，以及人脸识别后的语音问候。面板在屏幕中央显示，动态宠物随等待、生成、成功和错误等状态变化。

## 部署到树莓派与开发

先按 [部署指南](../../docs/raspberry-pi-deployment.md) 安装魔镜依赖，再在 Pi 的本模块目录创建 `.env`。文字对话检查通过后，在 `MagicMirror/` 执行：

```bash
VOICE_ROOT="$HOME/smart-mirror/voice" bash modules/MMM-AIChat/scripts/setup-voice.sh
```

将输出的程序、模型路径填入 `voiceChat`，设置 `enabled: true`。默认目录对应：

| 配置            | Pi 路径（将 `/home/pi` 替换为实际用户目录）                        |
| --------------- | ------------------------------------------------------------------ |
| `whisperBinary` | `/home/pi/smart-mirror/voice/whisper.cpp/build/bin/whisper-cli`    |
| `whisperModel`  | `/home/pi/smart-mirror/voice/models/ggml-tiny.bin`                 |
| `piperBinary`   | `/home/pi/smart-mirror/voice/piper-venv/bin/piper`                 |
| `piperModel`    | `/home/pi/smart-mirror/voice/models/zh_CN-huayan-medium.onnx`      |
| `piperConfig`   | `/home/pi/smart-mirror/voice/models/zh_CN-huayan-medium.onnx.json` |

按 `arecord -l`、`aplay -l` 选择设备，先独立录播和合成，再从界面开启语音，检查转写、朗读、音量以及音乐恢复。安装脚本支持通过环境变量覆盖模型下载 URL。

界面修改位于 `MMM-AIChat.js`、`PetController.js` 和 CSS；请求及音频流程位于 `node_helper.js` 与 `lib/`。修改 helper 后重启魔镜；修改交互后在浏览器和 Pi 显示器上检查。模块定向测试见“排查与开发”，更新步骤见 [开发指南](../../docs/project-development.md)。

## 环境与快速配置

使用 MagicMirror² 2.33.0 和 Node.js 22.18.0 及以上版本。JavaScript 依赖由 MagicMirror 提供；语音工具独立安装在运行 Node helper 的 Linux 主机上。

在模块目录创建 `.env`，填入自己的密钥：

```dotenv
DEEPSEEK_API_KEY=your_api_key
```

进程环境变量优先于模块 `.env`。密钥由 `node_helper.js` 读取，前端配置填写环境变量名。

将以下条目加入 `config/config.js` 的 `modules`，可先运行文字对话：

```js
{
  module: "MMM-AIChat",
  position: "fullscreen_above",
  config: {
    title: "AI 助手",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    stream: true,
    requestTimeoutMs: 180000,
    apiKeyEnvName: "DEEPSEEK_API_KEY",
    voiceChat: { enabled: false },
    webSearch: { enabled: true, triggerMode: "auto" }
  }
}
```

`model` 示例沿用源码默认值，运行时按 API 账户可用的模型填写。会话历史保存在服务端内存中，清空会话或重启服务后重新开始。

## 文字对话与检索

Enter 发送，Shift+Enter 换行；生成过程中可停止，清空按钮重置会话。点击助手入口展开或收起面板，阅读历史消息时可滚动查看。

| 参数                                                | 默认值                           | 说明                             |
| --------------------------------------------------- | -------------------------------- | -------------------------------- |
| `title`                                             | `AI 助手`                        | 面板标题                         |
| `baseUrl`                                           | `https://api.deepseek.com`       | API 基础地址                     |
| `model`                                             | `deepseek-v4-flash`              | 请求模型名                       |
| `systemPrompt`                                      | `你是运行在智能魔镜中的AI助手。` | 系统提示词                       |
| `stream`                                            | `true`                           | 流式接收回答                     |
| `temperature`                                       | `0.7`                            | 生成采样温度                     |
| `maxTokens`                                         | `2048`                           | 最大输出 token 数                |
| `maxContextMessages`                                | `20`                             | 内存中保留的上下文消息数上限     |
| `maxInputCharacters`                                | `4000`                           | 单次输入字符数上限               |
| `requestTimeoutMs`                                  | `180000`                         | 请求超时，毫秒                   |
| `apiKeyEnvName`                                     | `DEEPSEEK_API_KEY`               | 密钥环境变量名                   |
| `showHeader` / `showClearButton` / `showStopButton` | `true`                           | 标题、清空和停止控件             |
| `autoFocus`                                         | `false`                          | 渲染后聚焦输入框                 |
| `persistConversation` / `debug`                     | `false`                          | 保留配置项；当前会话使用内存存储 |

联网检索由服务端请求 Bing RSS，将摘要和来源链接加入本轮上下文：

| `webSearch` 参数 | 默认值     | 说明                                                            |
| ---------------- | ---------- | --------------------------------------------------------------- |
| `enabled`        | `true`     | 开启检索功能                                                    |
| `triggerMode`    | `auto`     | `auto` 按关键词触发，`always` 每次检索，`manual` 按输入前缀触发 |
| `provider`       | `bing-rss` | 检索提供器                                                      |
| `maxResults`     | `4`        | 检索结果条数上限                                                |
| `timeoutMs`      | `8000`     | 检索超时，毫秒                                                  |
| `locale`         | `zh-CN`    | 检索语言与区域                                                  |

自动触发词包括“今天”“最新”“新闻”“搜索”等；手动模式支持以“联网”“搜索”“查一下”“帮我查”或 `search` 开头。检索请求发送用户问题，DeepSeek 请求发送本轮问题、上下文与检索摘要。

## 语音聊天

语音流程：ALSA 录音 → 静音检测分段 → Whisper.cpp 转写 → DeepSeek 回答 → Piper/eSpeak NG 合成 → ALSA 播放 → 继续聆听。点击语音按钮开启和关闭，朗读开关与音量控件独立控制播放。

在 Linux 主机准备 `arecord`、`aplay`、`amixer`（`alsa-utils`），并准备 Whisper.cpp 可执行文件和模型。树莓派可使用 Piper 中文语音；开发电脑也可选 eSpeak NG。

在模块的 `config` 中添加：

```js
voiceChat: {
  enabled: true,
  inputDevice: "default",
  outputDevice: "default",
  whisperBinary: "/path/to/whisper-cli",
  whisperModel: "/path/to/ggml-model.bin",
  whisperThreads: 4,
  ttsProvider: "piper",
  piperBinary: "/path/to/piper",
  piperModel: "/path/to/voice.onnx",
  piperConfig: "/path/to/voice.onnx.json",
  speakEnabled: true,
  initialVolume: 0.22,
  resumeMusicAfterSpeech: true
}
```

选择 eSpeak NG 时改为 `ttsProvider: "espeak-ng"`，并设置 `espeakBinary: "espeak-ng"`、`espeakVoice: "zh"`、`espeakSpeed: 150`。

| `voiceChat` 参数                                 | 默认值                  | 说明                                       |
| ------------------------------------------------ | ----------------------- | ------------------------------------------ |
| `enabled`                                        | `true`                  | 显示并启用语音聊天入口；用户点击后开始录音 |
| `inputDevice` / `outputDevice`                   | `default`               | ALSA 录音和播放设备                        |
| `initialVolume` / `speakEnabled`                 | `0.22` / `true`         | 初始音量和朗读开关                         |
| `mixerDevice` / `mixerControl`                   | `default` / `Master`    | ALSA 混音设备和控件                        |
| `sampleRate` / `channels`                        | `16000` / `1`           | 录音采样率与声道数                         |
| `language`                                       | `zh`                    | Whisper 识别语言                           |
| `startupListeningDelayMs` / `recordingWarmupMs`  | `1200` / `450`          | 启动聆听延迟与录音预热时长                 |
| `vadThreshold`                                   | `0.018`                 | 语音活动检测阈值                           |
| `silenceDurationMs`                              | `1200`                  | 一轮语音结束所需静音时长                   |
| `minSpeechDurationMs` / `maxRecordingDurationMs` | `500` / `30000`         | 最短语音和最长录音时长                     |
| `sttProvider` / `whisperThreads`                 | `whisper.cpp` / `4`     | 转写后端与线程数                           |
| `whisperBinary` / `whisperModel`                 | 空字符串                | Whisper 程序和模型路径                     |
| `whisperPrompt`                                  | 空字符串                | 可选的转写提示词                           |
| `ttsProvider`                                    | `piper`                 | `piper` 或 `espeak-ng`                     |
| `piperBinary` / `piperModel` / `piperConfig`     | 空字符串                | Piper 程序、模型和配置路径                 |
| `ttsLengthScale`                                 | `1.0`                   | Piper 语速参数                             |
| `espeakBinary` / `espeakVoice` / `espeakSpeed`   | 空字符串 / `zh` / `150` | eSpeak NG 程序、声音和语速                 |
| `sttTimeoutMs` / `ttsTimeoutMs`                  | `90000` / `90000`       | 转写和合成超时，毫秒                       |
| `maxSpeechCharacters`                            | `600`                   | 朗读文本长度上限                           |
| `temporaryAudioDirectory`                        | `/tmp/mmm-aichat-voice` | 临时音频目录                               |
| `resumeMusicAfterSpeech`                         | `true`                  | 结束语音后恢复原先播放的音乐               |
| `debug`                                          | `false`                 | 语音调试选项                               |

模型路径在服务端主机解析。通过另一台电脑浏览魔镜时，麦克风和扬声器仍使用运行 helper 主机的 ALSA 设备。

## 人脸问候与音乐联动

配合 [MMM-FaceRecognition](../MMM-FaceRecognition/README.md)，接收稳定识别事件后播放按时段生成的中文问候。问候直接进入 TTS 播放通道，独立于 DeepSeek 请求和麦克风采集。助手忙碌时排队等待，遵守朗读开关与音量。

语音期间向 [MMM-MusicPlayer](../MMM-MusicPlayer/README.md) 请求暂停，并保留曲目与进度；结束后按 `resumeMusicAfterSpeech` 恢复之前的播放状态。

## 外部通知

其他前端模块可调用：

```js
this.sendNotification("AI_CHAT_SUBMIT", { text: "介绍一下今天的安排" });
```

| 通知                                             | 负载                                   | 作用               |
| ------------------------------------------------ | -------------------------------------- | ------------------ |
| `AI_CHAT_SHOW` / `AI_CHAT_HIDE`                  | 无                                     | 显示或隐藏模块     |
| `AI_CHAT_FOCUS`                                  | 无                                     | 聚焦输入框         |
| `AI_CHAT_SUBMIT`                                 | 字符串或 `{ text }`                    | 提交文字问题       |
| `AI_CHAT_CLEAR` / `AI_CHAT_ABORT`                | 无                                     | 清空对话或停止生成 |
| `FACE_RECOGNIZED_GREETING`                       | `{ eventId, name, displayName, text }` | 排队播放人脸问候   |
| `MUSIC_PAUSE_CONFIRMED` / `MUSIC_STATE_RESPONSE` | 播放器状态                             | 协调语音与音乐     |

## 排查与开发

| 现象               | 检查内容                                                 |
| ------------------ | -------------------------------------------------------- |
| 提示配置 API Key   | 检查进程环境变量或模块 `.env`，修改后重启服务            |
| 请求参数或模型错误 | 核对 `baseUrl`、`model` 和账户可用模型                   |
| 请求超时           | 检查服务端网络与 `requestTimeoutMs`                      |
| 转写组件未配置     | 核对 `whisperBinary`、`whisperModel` 路径及执行权限      |
| 录音或播放失败     | 用 `arecord -l`、`aplay -l` 检查设备，填写对应 ALSA 名称 |
| 朗读组件未配置     | 核对 TTS 后端、可执行文件、模型及 JSON 配置              |

在 `MagicMirror/` 下运行：

```bash
npm test --prefix modules/MMM-AIChat
npm run test:unit -- --runInBand --runTestsByPath tests/unit/modules/MMM-AIChat.spec.js tests/unit/modules/MMM-AIChat-greeting.spec.js
npm run config:check
```

`MMM-AIChat.js` 负责界面与通知，`PetController.js` 负责宠物状态，`node_helper.js` 负责会话与请求调度。`lib/` 按 API、流解析、检索、录音、转写、合成、播放和问候拆分职责。模型输出使用 `textContent` 展示，API 密钥保留在 helper 侧。

返回 [模块索引](../README.md)
