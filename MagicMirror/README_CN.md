# MagicMirror 智能魔镜界面

[English](README.md) · [树莓派部署](docs/raspberry-pi-deployment.md) · [开发指南](docs/project-development.md) · [模块索引](modules/README.md)

本目录基于 MagicMirror² **2.33.0**，承载魔镜界面、Node 服务与 Electron 桌面窗口。Node helper 负责文件、API、语音及识别子进程，前端负责卡片展示与用户交互。

## 树莓派部署与启动

新设备按照 [完整部署指南](docs/raspberry-pi-deployment.md) 完成系统依赖、工作目录迁移、Node 安装、配置和模型准备。部署目录统一为 `~/smart-mirror/MagicMirror/`，同级放置 `face-recognition/`；语音工具位于 `~/smart-mirror/voice/`。

在 Pi 的桌面终端运行：

```bash
cd "$HOME/smart-mirror/MagicMirror"
npm run config:check
npm run start:wayland
```

X11 使用 `npm run start:x11`。这些命令使用当前 `PATH` 中的 Node。`scripts/run-face-pi.sh` 自动选择桌面会话，并固定调用 `/usr/bin/node`，适用于该路径满足 Node ≥22.18.0 的设备。按 `Ctrl+C` 停止。

迁移时保留自定义模块和 `css/custom.css`，在 Pi 上按锁文件执行 `npm ci`；压缩包目录的 Git 安装钩子准备步骤见部署指南。首次配置可使用部署指南的基础配置，逐个开启天气、AI、音频与人脸模块。

## 配置文件

| 路径                                    | 作用                               |
| --------------------------------------- | ---------------------------------- |
| `config/config.js`                      | 设备配置、模块列表、端口和访问设置 |
| `config/config.js.sample`               | 上游初始配置                       |
| `config/config.face-local.js`           | 基于设备配置的本地覆盖             |
| `config/config.face-local.generated.js` | 序列化后的本地浏览器配置           |
| `css/custom.css`                        | 项目主题、布局与模块样式           |
| `modules/MMM-AIChat/.env`               | 本地 DeepSeek API Key              |
| `~/.config/magicmirror/weather.json`    | 天气位置和服务端凭据               |

7 个自定义模块分别为 AIChat、FaceRecognition、MusicPlayer、WeatherCard、PiStatus、PoemDisplay、QuoteDisplay；8 个默认模块提供通知、时钟、日历、新闻、天气、文字问候、静态文字和更新提示。每个模块目录内均有 README 和配置示例。

现有布局中，音乐位于顶部中央，天气位于左侧，状态位于右下角，日历位于左下角。AI 和人脸卡片通过模块 CSS 固定在视口中央和右侧。诗词在当前设备配置中停用。模块挂载区域与最终视觉位置可分别在配置和 CSS 中调整。

## 在 Pi 接入人脸与语音

按照 [Python/CSI 部署](../face-recognition/docs/raspberry-pi.md) 准备系统 Python 环境、模型与人员库，再按 [C++ 部署](../face-recognition/docs/cpp-deployment.md) 在 Pi 编译原生运行时。魔镜配置中设置 `runtime: "cpp"`、`source: "picamera2"` 和本机 `projectRoot`。

语音安装入口为 `VOICE_ROOT="$HOME/smart-mirror/voice" bash modules/MMM-AIChat/scripts/setup-voice.sh`。脚本打印 Whisper.cpp/Piper 的程序与模型路径，按 [AI 模块说明](modules/MMM-AIChat/README.md) 写入 `voiceChat`。问候与语音聊天使用 Pi 的 ALSA 设备。

先分别检查相机、转写和 TTS，再停止独立相机程序，启动魔镜检查人脸预览、稳定识别问候与音乐暂停/恢复。

## 开发与检查

开发流程和文件职责见 [开发指南](docs/project-development.md)。修改前端或样式后重新加载界面，修改 helper 后重启进程，修改 C++ 后在 Pi 增量构建。

浏览器开发使用 `npm run server`，桌面开发使用 `npm run start:wayland:dev` 或 `start:x11:dev`。视频联调用 `FACE_LOCAL_SOURCE=/path/to/video.mp4 ./scripts/run-face-local.sh`，访问 `http://localhost:8082`。

```bash
npm run config:check
npm run test:unit -- --runInBand
npm test --prefix modules/MMM-AIChat
```

项目还提供 `test:js`、`test:css`、`test:markdown`、`test:e2e` 和 `test:electron` 脚本。上游开发流程见 [DEVELOPMENT.md](DEVELOPMENT.md)，自定义模块 README 提供定向测试命令。

自定义模块代码、主题、配置模板与推理模型均纳入 Git。设备运行配置、密钥、照片、个人向量、依赖和构建产物保留在本机。

## 上游来源

MagicMirror² 由 Michael Teeuw 创建，由 MagicMirror 社区维护，核心代码采用 [MIT 许可](LICENSE.md)。

- [MagicMirror² 仓库](https://github.com/MagicMirrorOrg/MagicMirror)
- [上游文档](https://docs.magicmirror.builders)
- [社区论坛](https://forum.magicmirror.builders)
- [更新记录](CHANGELOG.md)
- [协作说明](Collaboration.md)
