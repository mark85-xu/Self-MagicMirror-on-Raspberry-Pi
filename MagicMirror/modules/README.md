# 模块索引

本项目基于 MagicMirror² 2.33.0。模块在 `config/config.js` 的 `modules` 数组中启用，设置 `disabled: true` 可停用单个模块。下列示例中的时间参数均以毫秒为单位。

## 部署与开发入口

首次安装从 [树莓派部署指南](../docs/raspberry-pi-deployment.md) 开始：克隆本仓库，在 Pi 安装依赖，按本机目录填写配置，再逐个启用模块。自定义模块代码、主题和推理模型随仓库提供。

修改模块时，前端处理界面与全局通知，Node helper 处理服务端资源和子进程，CSS 处理显示；各模块 README 的首节说明 Pi 部署、修改位置和设备检查。完整调试、测试和更新流程见 [开发指南](../docs/project-development.md)。

## 自定义模块

| 模块                | 功能                                                  | 配置位置                               | 文档                                      |
| ------------------- | ----------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| MMM-AIChat          | DeepSeek 对话、联网检索、语音聊天、动态宠物和问候播放 | `fullscreen_above`，样式固定在屏幕中央 | [使用说明](MMM-AIChat/README.md)          |
| MMM-FaceRecognition | YOLO/SFace 实时预览、姓名显示、首次识别问候           | `fullscreen_above`，样式固定在右侧居中 | [使用说明](MMM-FaceRecognition/README.md) |
| MMM-MusicPlayer     | 本地 MP3、LRC 歌词、进度与音量控制                    | `top_center`                           | [使用说明](MMM-MusicPlayer/README.md)     |
| MMM-WeatherCard     | 实时天气、七天预报、展开卡片和数据源回退              | `top_left`                             | [使用说明](MMM-WeatherCard/README.md)     |
| MMM-PiStatus        | 温度、供电、降频、频率、内存、磁盘和 IP               | `bottom_right`                         | [使用说明](MMM-PiStatus/README.md)        |
| MMM-PoemDisplay     | 本地诗词轮播、上一首/下一首、词句排版                 | `middle_center`，现有配置中停用        | [使用说明](MMM-PoemDisplay/README.md)     |
| MMM-QuoteDisplay    | 原文、译文和出处的离线轮播                            | 现有配置为 `top_right`                 | [使用说明](MMM-QuoteDisplay/README.md)    |

`position` 控制 MagicMirror 挂载区域；模块自身 CSS 与 `css/custom.css` 共同决定最终位置和大小。AI 助手、人脸识别使用视口固定定位。

## 默认模块

| 模块               | 功能                                    | 文档                                             |
| ------------------ | --------------------------------------- | ------------------------------------------------ |
| alert              | 通知与弹窗                              | [使用说明](default/alert/README.md)              |
| clock              | 时间、日期与模拟时钟                    | [使用说明](default/clock/README.md)              |
| calendar           | iCalendar 日历聚合                      | [使用说明](default/calendar/README.md)           |
| newsfeed           | RSS 新闻轮播                            | [使用说明](default/newsfeed/README.md)           |
| weather            | 天气提供器及 `WEATHER_UPDATED` 数据广播 | [使用说明](default/weather/README.md)            |
| compliments        | 按时段显示问候文字                      | [使用说明](default/compliments/README.md)        |
| helloworld         | 静态文字                                | [使用说明](default/helloworld/README.md)         |
| updatenotification | 核心与模块的 Git 更新检查               | [使用说明](default/updatenotification/README.md) |

## 模块联动

1. `MMM-FaceRecognition` 的 Node helper 启动识别子进程，读取逐行 JSON 和最新 JPEG，向前端发送状态。
2. 稳定识别后，前端广播 `FACE_RECOGNIZED_GREETING`，由 `MMM-AIChat` 排队合成和播放问候。
3. AI 语音通过 `MUSIC_PAUSE_FOR_VOICE` 暂停音乐，通过 `MUSIC_RESUME_AFTER_VOICE` 恢复原先播放状态。
4. `MMM-WeatherCard` 可接收默认 `weather` 的 `WEATHER_UPDATED`，也可单独使用服务端天气聚合。

## 配置与维护

每个模块条目由 `module`、`position`、`config` 和可选的 `disabled`、`header`、`classes` 组成。通知模块 `alert` 可以省略 `position`。

```js
{
  module: "MMM-QuoteDisplay",
  position: "lower_third",
  config: {
    updateInterval: 300000,
    quotes: [{ text: "保持好奇，持续学习。", source: "每日提醒" }]
  }
}
```

修改配置后，在 `MagicMirror/` 下执行 `npm run config:check`，然后重启服务。密钥由各模块的服务端配置读取；配置示例使用占位值。

自定义模块实现、README、样式与安装脚本均纳入版本控制。`.env`、设备运行配置、日志、备份和生成的预览保留在本机。

返回 [项目中文说明](../../README_CN.md) · [MagicMirror 运行说明](../README_CN.md)
