# 树莓派智能魔镜

[English](README.md) · [树莓派部署指南](MagicMirror/docs/raspberry-pi-deployment.md) · [开发指南](MagicMirror/docs/project-development.md) · [模块索引](MagicMirror/modules/README.md)

基于 MagicMirror² 2.33.0 的树莓派智能魔镜，整合信息面板、AI 对话、本地语音、音乐和 YOLO/SFace 人脸识别。项目以 **Raspberry Pi 5 + 64 位 Raspberry Pi OS Bookworm 桌面版**为部署环境，在开发电脑修改与检查代码，在 Pi 上构建原生程序并完成设备联调。

## 部署到树莓派

第一次安装按 [完整部署指南](MagicMirror/docs/raspberry-pi-deployment.md) 的顺序执行：

1. **准备系统与外设**：安装桌面系统、连接 CSI 相机和音频设备，检查 `aarch64`、相机列表和 ALSA 设备。
2. **获取完整项目**：在 Pi 将本仓库克隆到 `~/smart-mirror/`，获取模块、主题和推理模型；注册照片与人员向量按设备单独准备。
3. **安装依赖**：准备 Node.js ≥22.18.0，在 Pi 安装 npm 依赖；Python 使用系统解释器建立虚拟环境。
4. **配置与启动界面**：填写 Pi 的 `config/config.js`，检查配置后启动 Wayland/X11 桌面，先确认基础卡片。
5. **启用模块服务**：配置天气文件、DeepSeek Key、Whisper/Piper、ALSA 与音乐曲库，逐个启用并检查。
6. **接入人脸问候**：准备模型与人员库，在 Pi 构建 C++ NCNN 程序，先独立检查相机，再由魔镜接管识别与问候。
7. **验收与维护**：检查显示、录音、朗读、音乐联动和相机释放，再配置桌面登录后的自动启动。

依赖安装、配置文件和模型准备完成后，在 Pi 桌面终端运行：

```bash
cd "$HOME/smart-mirror/MagicMirror"
npm run config:check
npm run start:wayland
# X11 桌面使用 npm run start:x11
```

停止时在启动终端按 `Ctrl+C`。`run-face-pi.sh` 适用于 `/usr/bin/node` 满足版本要求的设备；用户目录安装的 Node 使用上面的 npm 启动入口。

## 开发与更新

具体流程见 [开发指南](MagicMirror/docs/project-development.md)：模块按前端、Node helper、样式和识别运行时拆分职责；修改后先做对应检查，再同步到 Pi 完成设备测试。

在 `MagicMirror/` 下运行：

```bash
npm run config:check
npm run test:unit -- --runInBand
npm test --prefix modules/MMM-AIChat
```

人脸和语音可在开发电脑使用视频输入联调：

```bash
FACE_LOCAL_SOURCE=/path/to/face-video.mp4 ./scripts/run-face-local.sh
```

本地浏览器访问 `http://localhost:8082`。Python 测试、Pi 的 C++ 增量构建、更新前备份和回退步骤集中在开发指南中。每个 [模块 README](MagicMirror/modules/README.md) 补充该模块的部署配置、修改位置和测试入口。

## 功能组成

| 组件     | 功能                                                           | 说明                                                                     |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| AI 助手  | DeepSeek 多轮对话、流式回答、Bing RSS 检索、语音聊天和动态宠物 | [MMM-AIChat](MagicMirror/modules/MMM-AIChat/README.md)                   |
| 人脸卡片 | 实时标注预览、姓名、相似度、每次运行中的首次识别问候           | [MMM-FaceRecognition](MagicMirror/modules/MMM-FaceRecognition/README.md) |
| 音乐     | 本地 MP3、LRC 同步歌词、播放进度和音量                         | [MMM-MusicPlayer](MagicMirror/modules/MMM-MusicPlayer/README.md)         |
| 天气     | 当前天气、七天预报、Open-Meteo 超时后回退到和风天气            | [MMM-WeatherCard](MagicMirror/modules/MMM-WeatherCard/README.md)         |
| 系统状态 | 温度、供电、降频、频率、内存、磁盘和 IP                        | [MMM-PiStatus](MagicMirror/modules/MMM-PiStatus/README.md)               |
| 诗词     | 本地诗词轮播、手动切换和词句排版                               | [MMM-PoemDisplay](MagicMirror/modules/MMM-PoemDisplay/README.md)         |
| 名言     | 原文、译文和出处轮播                                           | [MMM-QuoteDisplay](MagicMirror/modules/MMM-QuoteDisplay/README.md)       |
| 基础信息 | 时钟、日历、RSS 新闻、通知及其他默认模块                       | [全部模块](MagicMirror/modules/README.md)                                |

## 目录结构

```text
Self-MagicMirror-on-Raspberry-Pi/
├── README.md                    # 英文项目入口
├── README_CN.md                 # 中文项目入口
├── MagicMirror/                 # 魔镜界面、Node 服务和 Electron 桌面
│   ├── config/                  # 设备配置、本地预览配置
│   ├── modules/                 # 7 个自定义模块、8 个默认模块
│   ├── css/                     # 核心样式与项目主题
│   ├── assets/                  # 界面资源
│   ├── scripts/                 # 本地/Pi 启动和异常记录脚本
│   ├── tests/                   # 单元、浏览器与 Electron 测试
│   └── docs/                    # 设计、实施计划与变更记录
└── face-recognition/            # 注册与识别引擎
    ├── src/                     # Python 包、命令行入口、C++ 运行时
    ├── models/                  # YOLO、NCNN 与 SFace 模型
    ├── faces/                   # 注册照片
    ├── face_vectors/            # 按人员保存的 NPZ 向量与姓名映射
    ├── scripts/                 # Pi 构建与运行脚本
    ├── docs/                    # 部署及历史性能记录
    └── tests/                   # Python 与原生集成测试
```

部署目录统一为 `~/smart-mirror/`，语音工具放在 `voice/`，音乐放在 `music_library/`。配置里的 `/home/pi` 替换为实际 Pi 用户目录；依赖和二进制在目标设备安装、构建。

## 专题文档

- [完整树莓派部署](MagicMirror/docs/raspberry-pi-deployment.md)
- [开发、调试与 Pi 更新](MagicMirror/docs/project-development.md)
- [MagicMirror 部署与开发入口](MagicMirror/README_CN.md)
- [模块配置、通知与定向测试](MagicMirror/modules/README.md)
- [启动与异常诊断脚本](MagicMirror/scripts/README.md)
- [Python 注册与识别](face-recognition/README.md)
- [Pi Python/CSI 部署](face-recognition/docs/raspberry-pi.md)
- [Pi C++ 构建与历史基准](face-recognition/docs/cpp-deployment.md)

## 项目来源

魔镜基于 [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror)，核心沿用其 [MIT 许可](MagicMirror/LICENSE.md)。YOLO 参考工程使用其独立 [许可证](https://github.com/akanametov/yolo-face/blob/master/LICENSE)，模型沿用各自许可；SFace 来源与许可记录在人脸识别说明中。
