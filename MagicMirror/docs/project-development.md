# 开发与树莓派更新指南

部署入口见 [树莓派部署指南](raspberry-pi-deployment.md)。本文按“修改代码 → 本地检查 → Pi 构建与设备检查 → 更新运行环境”组织开发步骤。

## 开发目录与职责

| 位置                                             | 开发内容                             | 生效方式                  |
| ------------------------------------------------ | ------------------------------------ | ------------------------- |
| `modules/MMM-*/MMM-*.js`                         | 卡片 DOM、交互、全局通知             | 重启或重新加载界面        |
| `modules/MMM-*/node_helper.js`                   | 文件、API、系统命令和进程管理        | 重启 Node/Electron 进程   |
| `modules/MMM-*/*.css`                            | 模块内部样式                         | 重新加载界面              |
| `css/custom.css`                                 | 项目主题、布局、跨模块层级           | 重新加载界面              |
| `config/config.js`                               | Pi 运行配置                          | 检查配置后重启            |
| `modules/MMM-AIChat/lib/`                        | API、检索、录音、STT、TTS、问候      | 模块测试后重启            |
| `modules/MMM-FaceRecognition/lib/face-bridge.js` | 识别进程、稳定帧、姓名映射和问候事件 | 模块测试后重启            |
| `../face-recognition/src/face_recognition/`      | Python 采集、检测、注册、向量和事件  | Python 测试后重新启动识别 |
| `../face-recognition/src/cpp/`                   | Pi 原生相机、NCNN、SFace 与事件输出  | 在 Pi 增量构建后重启      |

模块的 `README.md` 包含具体参数、通信通知和定向测试。修改行为或参数时，同步更新该 README。

## 建立开发环境

开发电脑与 Pi 使用各自架构的依赖目录。Node 版本沿用 `.nvmrc`；从 Git 工作树安装时在 `MagicMirror/` 执行：

```bash
npm ci
npm run config:check
npm run server
```

浏览器访问配置端口，打开开发者工具检查布局、控制台与网络请求。只开发文字、天气或静态内容时，在开发配置中停用相机与语音条目；需要联调时再配置对应设备和工具。

桌面 Electron 开发入口为 `npm run start:wayland:dev` 或 `npm run start:x11:dev`。这些入口启动桌面开发模式，便于检查 Electron 中的交互。

## 人脸与问候的本地联调

先在开发电脑的 `face-recognition/` 准备本机 Python 环境、模型与 NPZ 库。可使用视频固定输入，在 `MagicMirror/` 执行：

```bash
FACE_LOCAL_SOURCE=/path/to/face-video.mp4 ./scripts/run-face-local.sh
```

访问 `http://localhost:8082`。该入口使用 `config/config.face-local.js` 覆盖设备配置，切换为 Python 识别与 eSpeak NG；`prepare-face-local.js` 生成浏览器读取的普通配置文件。配置加载过程中的 `require`、文件系统和环境变量处理放在生成阶段。

开发电脑与 Pi 的运行方式：

| 项目       | 开发电脑                       | Pi 部署                                       |
| ---------- | ------------------------------ | --------------------------------------------- |
| 相机输入   | USB 编号或录制视频             | CSI：`picamera2` / C++ `csi`                  |
| 识别运行时 | Python                         | C++ NCNN；Python 作为独立对照入口             |
| TTS        | eSpeak NG 可快速联调           | Piper 中文语音                                |
| 启动       | `run-face-local.sh`，端口 8082 | `npm run start:wayland` 或 X11，默认端口 8080 |
| 配置       | 本地覆盖和生成文件             | `config/config.js` 中的本机路径               |

同一相机由一个识别进程使用。切换独立识别与魔镜桥接时，先结束当前采集进程。

## 根据修改运行检查

在 `MagicMirror/` 下执行公共检查：

```bash
npm run config:check
npm run test:unit -- --runInBand
npm test --prefix modules/MMM-AIChat
```

定向测试示例：

```bash
npm run test:unit -- --runInBand --runTestsByPath \
  tests/unit/modules/MMM-FaceRecognition.spec.js \
  tests/unit/modules/MMM-AIChat-greeting.spec.js
```

默认模块和核心代码可使用 `npm run test:js`、`npm run test:css`；修改自定义模块时按实际文件路径调用检查工具，覆盖到本次修改的文件。浏览器和 Electron 集成检查分别使用 `npm run test:e2e`、`npm run test:electron`。

Python 与 C++ 相关检查在 `face-recognition/` 下执行：

```bash
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```

原生集成测试在存在本机可执行文件和参考照片时执行。Pi 修改 C++ 后：

```bash
cmake --build build/cpp --parallel 2
./scripts/run-cpp-pi.sh --source csi --no-show --max-frames 30
```

相机、音频、触控、温度与供电检查在 Pi 上完成。界面样式修改同时查看实际显示器中的定位、层级、按钮命中和滚动。

## 更新到树莓派

1. 列出本次修改的模块、配置字段与测试结果；使用模块 README 记录新参数和依赖。
2. 在 Pi 停止魔镜，备份设备配置、密钥配置、主题和向量库。备份放在带日期的独立目录。
3. 将本次代码放入 Pi 的临时更新目录，核对差异后覆盖对应文件。首次整包迁移使用部署指南的工作目录打包命令；增量更新按文件清单复制。
4. `package-lock.json` 变化时在 Pi 执行 `npm ci`；Python 依赖变化时更新 Pi 虚拟环境；C++ 变化时在 Pi 重新构建。
5. 执行 `npm run config:check`，按既有桌面启动方式前台启动，并完成本次功能相关的设备检查。
6. 验收后使用同一命令恢复日常运行。回退时停止进程，恢复对应代码与配置备份，再按该版本依赖重新安装或构建。

部署文件清单应包含修改后的自定义模块代码、样式、模型和依赖文件，这些内容均纳入 Git。设备配置、密钥和个人向量保留在 Pi 本机。Node/Python 依赖目录及平台构建产物在各设备上生成。

## 开发排查顺序

| 问题                 | 优先查看                                                    |
| -------------------- | ----------------------------------------------------------- |
| 启动报版本或命令错误 | `command -v node`、`node --version`、启动命令中的解释器路径 |
| 模块未出现           | `disabled`、`module` 名、模块目录和启动日志                 |
| 卡片被遮挡或按钮失效 | 模块 CSS、`custom.css`、定位与 `z-index`                    |
| API/天气失败         | Node helper 日志、服务端配置、网络与账户参数                |
| 人脸事件中断         | 独立识别入口、JSON 事件、输入源与桥接超时                   |
| 语音失败             | ALSA 单独录播、Whisper 转写、Piper 单独合成，再检查模块联动 |

返回 [模块索引](../modules/README.md) · [树莓派部署](raspberry-pi-deployment.md)
