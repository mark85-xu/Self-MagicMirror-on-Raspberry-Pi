# MMM-MusicPlayer

本地音乐播放器，读取 MP3 曲库和同名 LRC 歌词，在顶部显示可展开的播放卡片。运行依赖由 MagicMirror 的 `express`、`node_helper` 和浏览器音频接口提供。

## 部署到树莓派与开发

在 Pi 创建曲库：

```bash
mkdir -p "$HOME/smart-mirror/music_library"
```

放入 MP3 与同名 LRC，将 `config.musicDir` 和 `node_helper.js` 的 `start()` 中 `this.musicDir` 同时设为该目录的绝对路径，例如 `/home/pi/smart-mirror/music_library`。随后在 Pi 重启魔镜，检查曲目 URL、播放、歌词、进度和音量。

开发时，曲库扫描、文件名和 LRC 解析修改在 `node_helper.js`，播放与展开交互修改在 `MMM-MusicPlayer.js`。先运行下文的模块测试，再在 Pi 检查实际音频，以及 AI 语音期间的暂停/恢复。共用部署依赖由魔镜 `npm ci` 安装，步骤见 [部署指南](../../docs/raspberry-pi-deployment.md)；代码更新见 [开发指南](../../docs/project-development.md)。

## 配置

将以下条目加入 `config/config.js` 的 `modules`：

```js
{
  module: "MMM-MusicPlayer",
  position: "top_center",
  config: {
    musicDir: "/home/lhx/Desktop/music_library",
    initialVolume: 0.22,
    autoplay: false
  }
}
```

| 参数            | 默认值                            | 说明                     |
| --------------- | --------------------------------- | ------------------------ |
| `musicDir`      | `/home/lhx/Desktop/music_library` | 服务端扫描的曲库绝对路径 |
| `initialVolume` | `0.22`                            | 初始音量，范围 0–1       |
| `autoplay`      | `false`                           | 加载曲目后尝试自动播放   |

当前 `node_helper.js` 在启动时将 `/MMM-MusicPlayer/library` 绑定到上述默认目录，随后通过 `musicDir` 扫描歌曲。使用自定义曲库路径时，应同步调整 helper 启动时的目录，使静态路由与扫描路径一致，再重启服务。

## 准备曲库

```text
music_library/
├── 歌曲名 - 歌手.mp3
├── 歌曲名 - 歌手.lrc
└── 另一首歌.mp3
```

扫描仅读取曲库第一层的 `.mp3` 文件，按文件名排序。文件名以带空格的 `-`、`–` 或 `—` 分隔歌名和歌手。没有歌手字段时显示“未知歌手”。添加歌曲后重启服务以重新扫描。

LRC 支持分钟、秒和小数时间戳，以及一行多个时间戳：

```text
[00:12.50]第一句歌词
[00:25.000][01:10.000]重复的歌词
```

## 操作

- 指针移入或键盘焦点进入卡片时展开，移出后收起；标题按钮可固定展开状态。
- 使用上一首、播放/暂停、下一首切换曲目；播放结束后循环到下一首。
- 拖动进度条定位，拖动音量条调整音量；曲目时长加载完成后开放拖动进度。
- 歌词随播放时间更新，折叠状态保留曲目信息和进度提示。

## 语音联动

| 通知                       | 方向 | 用途                                                     |
| -------------------------- | ---- | -------------------------------------------------------- |
| `MUSIC_GET_STATE`          | 接收 | 查询当前曲目、时间、音量和播放状态                       |
| `MUSIC_STATE_RESPONSE`     | 广播 | 返回状态，并携带原 `requestId`                           |
| `MUSIC_PAUSE_FOR_VOICE`    | 接收 | 暂停播放，记录原状态                                     |
| `MUSIC_PAUSE_CONFIRMED`    | 广播 | 返回 `wasPlaying`、`trackIndex`、`currentTime`、`volume` |
| `MUSIC_RESUME_AFTER_VOICE` | 接收 | 根据保存的状态恢复播放                                   |

`MMM-AIChat` 使用这些通知协调语音与音乐。浏览器播放音乐时，声音来自浏览器所在设备；AI 的 ALSA 语音播放来自运行 Node helper 的设备。

## 排查与验证

| 现象                 | 处理                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| 曲库为空             | 检查目录读取权限，并将 MP3 放在目录第一层                               |
| 曲目可见但播放失败   | 检查 `/MMM-MusicPlayer/library/` 下的文件 URL，并核对静态路由和曲库路径 |
| 歌词为空             | 检查 LRC 与 MP3 主文件名一致、UTF-8 编码以及时间戳格式                  |
| 自动播放被浏览器拦截 | 点击播放按钮启动音频                                                    |

在 `MagicMirror/` 下运行：

```bash
npm run test:unit -- --runInBand --runTestsByPath tests/unit/modules/MMM-MusicPlayer.spec.js
```

源码：`MMM-MusicPlayer.js` 负责播放器与交互，`node_helper.js` 负责曲库扫描、歌词解析和静态路由，`MMM-MusicPlayer.css` 负责卡片样式。

返回 [模块索引](../README.md)
