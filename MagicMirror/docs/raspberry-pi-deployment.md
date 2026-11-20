# 树莓派部署指南

本文从新设备开始部署完整魔镜。目标环境为 Raspberry Pi 5、64 位 Raspberry Pi OS Bookworm 桌面版、CSI 相机、麦克风和扬声器。日常开发与增量更新见 [开发指南](project-development.md)。

## 1. 确定目录与设备

本文统一使用以下目录。Shell 中的 `$HOME` 表示树莓派登录用户的家目录；JavaScript 配置示例中的 `/home/pi` 按实际用户名替换。

```text
~/smart-mirror/
├── MagicMirror/                 # 界面与 Node 服务
├── face-recognition/            # Python 注册工具、C++ 识别程序和模型
├── voice/                      # Whisper.cpp、Piper 与语音模型
└── music_library/              # MP3 和同名 LRC
```

树莓派登录桌面后，在终端检查：

```bash
uname -m
cat /etc/os-release
rpicam-hello --list-cameras
arecord -l
aplay -l
```

`uname -m` 应输出 `aarch64`；相机列表应列出连接的 CSI 传感器。关机后连接或调整 CSI 排线，再开机检查。Bookworm 使用 `rpicam-*` 相机工具，详见 [Raspberry Pi 相机文档](https://www.raspberrypi.com/documentation/accessories/camera-software.html)。

安装系统依赖：

```bash
sudo apt update
sudo apt install -y git curl xz-utils unzip build-essential cmake ninja-build \
  pkg-config python3-venv python3-pip python3-picamera2 alsa-utils espeak-ng \
  libgl1 libopencv-dev libcamera-dev libyaml-cpp-dev libzip-dev zlib1g-dev
```

桌面版系统提供图形会话。Electron 在登录用户的桌面中运行，音频和相机也由该用户访问。

## 2. 获取项目代码与模型

在树莓派克隆仓库：

```bash
git clone https://github.com/mark85-xu/Self-MagicMirror-on-Raspberry-Pi.git "$HOME/smart-mirror"
```

仓库包含自定义模块、`css/custom.css`、本地开发配置和 YOLO/SFace/NCNN 推理模型。设备运行配置、API 密钥、注册照片与个人 NPZ 向量单独准备。已有人员库可从自己的开发电脑复制到 Pi 的 `face-recognition/face_vectors/`。

需要迁移开发电脑上尚未提交的工作目录时，可改用以下打包流程：

在开发电脑的项目根目录执行：

```bash
tar -czf /tmp/smart-mirror-source.tar.gz \
  --exclude='*/.git' --exclude='*/node_modules' --exclude='*/.venv' \
  --exclude='*/build' --exclude='*/__pycache__' --exclude='*/.local-tools' \
  --exclude='*/.env' --exclude='*/.env.*' --exclude='*/logs' \
  --exclude='*.bak*' --exclude='*.tar.gz' \
  --exclude='MagicMirror/config/config.js' \
  --exclude='MagicMirror/config/config.face-local.generated.js' \
  --exclude='face-recognition/faces' --exclude='face-recognition/outputs' \
  README.md README_CN.md MagicMirror face-recognition
scp /tmp/smart-mirror-source.tar.gz pi@raspberrypi.local:/tmp/
```

将 `pi@raspberrypi.local` 替换为树莓派实际用户名和主机名/IP。包中保留 `face_vectors/*.npz` 与 `names.json`，便于沿用已有人员；新人员照片在注册步骤单独准备。

在树莓派执行首次解压：

```bash
mkdir -p "$HOME/smart-mirror"
tar -xzf /tmp/smart-mirror-source.tar.gz -C "$HOME/smart-mirror"
```

Node 依赖、Python 虚拟环境和 C++ 二进制在树莓派重新安装或构建。API 密钥与天气私钥在树莓派配置，旧设备的绝对路径按本机目录重新填写。

## 3. 安装 Node.js 与魔镜依赖

项目要求 Node.js ≥22.18.0，`.nvmrc` 固定开发基线为 22.20.0。已有合适版本时直接检查 `node --version` 与 `npm --version`，然后安装项目依赖。

新设备可从 [Node.js 官方 22.x ARM64 发布目录](https://nodejs.org/download/release/latest-v22.x/) 选择维护版本；下面按仓库基线安装，校验文件与版本来自 [官方 22.20.0 发布](https://nodejs.org/download/release/v22.20.0/SHASUMS256.txt)：

```bash
MM_NODE_VERSION=$(tr -d '[:space:]' < "$HOME/smart-mirror/MagicMirror/.nvmrc")
mkdir -p "$HOME/.local/share/nodejs"
cd "$HOME/.local/share/nodejs"
curl -fLO "https://nodejs.org/download/release/v${MM_NODE_VERSION}/node-v${MM_NODE_VERSION}-linux-arm64.tar.xz"
curl -fL "https://nodejs.org/download/release/v${MM_NODE_VERSION}/SHASUMS256.txt" -o SHASUMS256.txt
awk -v archive="node-v${MM_NODE_VERSION}-linux-arm64.tar.xz" '$2 == archive' SHASUMS256.txt | sha256sum -c -
tar -xf "node-v${MM_NODE_VERSION}-linux-arm64.tar.xz"
export PATH="$HOME/.local/share/nodejs/node-v${MM_NODE_VERSION}-linux-arm64/bin:$PATH"
node --version
npm --version
```

将同一 Node `bin` 路径加入终端启动配置，供后续新终端使用。项目安装钩子调用 `git clean`；压缩包解压的新目录先初始化 Git，再按锁文件安装依赖：

```bash
cd "$HOME/smart-mirror/MagicMirror"
git init
npm ci
```

通过 Git 检出的目录使用原有 `.git`。`npm ci` 同时安装开发工具和 ARM64 Electron，适合后续在 Pi 上调试；首次安装需下载 Electron。

## 4. 建立树莓派配置并启动基础界面

首次配置可在 `MagicMirror/` 下复制部署模板：

```bash
cp config/config.pi.js.sample config/config.js
```

模板内容如下。已有配置先备份，再按本机路径调整模块条目。

```js
let config = {
  address: "localhost",
  port: 8080,
  basePath: "/",
  ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],
  language: "zh-cn",
  locale: "zh-CN",
  timeFormat: 24,
  units: "metric",
  electronOptions: { fullscreen: true, frame: false, autoHideMenuBar: true },
  modules: [
    { module: "alert" },
    { module: "clock", position: "top_left", config: { timeFormat: 24 } },
    { module: "MMM-PiStatus", position: "bottom_right" },
    { module: "MMM-QuoteDisplay", position: "lower_third" },
    {
      module: "MMM-WeatherCard",
      position: "top_left",
      disabled: true,
      config: { useWeatherService: true },
    },
    {
      module: "MMM-AIChat",
      position: "fullscreen_above",
      disabled: true,
      config: { voiceChat: { enabled: false } },
    },
    {
      module: "MMM-FaceRecognition",
      position: "fullscreen_above",
      disabled: true,
      config: {
        runtime: "cpp",
        source: "picamera2",
        projectRoot: "/home/pi/smart-mirror/face-recognition",
        threshold: 0.5,
        stableFrames: 3,
        stableMs: 1000,
      },
    },
  ],
};
if (typeof module !== "undefined") module.exports = config;
```

在 Pi 的桌面终端执行：

```bash
cd "$HOME/smart-mirror/MagicMirror"
npm run config:check
npm run start:wayland
```

X11 桌面使用 `npm run start:x11`。确认时钟、状态和名言显示，再按下一步逐个启用服务。终端按 `Ctrl+C` 停止。浏览器调试可使用 `npm run server`，在 Pi 本机打开 `http://localhost:8080`。

`scripts/run-face-pi.sh` 固定使用 `/usr/bin/node`。系统 Node 满足版本要求时可使用该脚本；用户目录安装 Node 时使用上面的 `npm run start:wayland` / `start:x11`，由当前 `PATH` 选择解释器。

## 5. 配置天气、AI、语音与音乐

| 模块       | 在 Pi 上完成的步骤                                                                                                 | 启用后检查                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 天气       | 复制示例 JSON 到 `~/.config/magicmirror/weather.json`，填写位置、和风标识和私钥路径；移除该模块的 `disabled: true` | 当前温度、预报与来源            |
| AI 文字    | 在 `modules/MMM-AIChat/.env` 写入 `DEEPSEEK_API_KEY`，按账户填写 `model`；启用 AI 模块                             | 输入问题、流式回答、停止与清空  |
| 语音       | 安装 Whisper.cpp/Piper，填写 `voiceChat` 的程序、模型和 ALSA 设备；设置 `enabled: true`                            | 录音、转写、回答朗读与音量      |
| 音乐       | 创建曲库并放入 MP3/LRC；统一配置和 helper 中的目录，加入模块条目                                                   | 播放、歌词、进度、语音暂停/恢复 |
| 日历与新闻 | 从模块 README 添加条目，填写 `.ics` 和 RSS 地址                                                                    | 日程与新闻更新                  |
| 诗词与名言 | 修改 `poems.json` 或 `quotes`，选择显示区域                                                                        | 手动切换或定时轮播              |

语音安装脚本已包含 Whisper.cpp 编译、模型下载和 Piper 虚拟环境安装。在 `MagicMirror/` 下执行：

```bash
VOICE_ROOT="$HOME/smart-mirror/voice" bash modules/MMM-AIChat/scripts/setup-voice.sh
```

脚本完成后打印 5 个路径，将它们填入 `voiceChat.whisperBinary`、`whisperModel`、`piperBinary`、`piperModel`、`piperConfig`。默认转写模型为 `ggml-tiny.bin`，默认语音为 `zh_CN-huayan-medium`。脚本支持 `WHISPER_MODEL_URL`、`PIPER_MODEL_URL`、`PIPER_CONFIG_URL` 覆盖下载地址，模型由所用来源及其许可管理。

独立检查 ALSA 与 Piper：

```bash
arecord -D default -f S16_LE -r 16000 -c 1 -d 3 /tmp/mirror-mic.wav
aplay -D default /tmp/mirror-mic.wav
printf '%s\n' '你好，欢迎使用智能魔镜。' | \
  "$HOME/smart-mirror/voice/piper-venv/bin/piper" \
  --model "$HOME/smart-mirror/voice/models/zh_CN-huayan-medium.onnx" \
  --config "$HOME/smart-mirror/voice/models/zh_CN-huayan-medium.onnx.json" \
  --output_file /tmp/mirror-tts.wav
aplay -D default /tmp/mirror-tts.wav
```

`default` 按 `arecord -l`、`aplay -l` 所列设备调整。语音输入/输出使用 Pi 上的 ALSA 设备。源码中的语音安装流程分别对应 [Whisper.cpp](https://github.com/ggml-org/whisper.cpp) 与 [Piper 安装](https://github.com/OHF-Voice/piper1-gpl)。各模块的完整参数、目录调整和排查步骤见 [模块索引](../modules/README.md)。

## 6. 部署人脸识别并接入问候

Python 用于注册，C++ NCNN 用于 Pi 实时识别。先在 Pi 建立 Python 环境：

```bash
cd "$HOME/smart-mirror/face-recognition"
/usr/bin/python3 -m venv --system-site-packages .venv
PIP_CONFIG_FILE=/dev/null .venv/bin/python -m pip install \
  --prefer-binary --only-binary=:all: -r requirements/raspberry-pi.txt
```

项目模型目录应包含：

```text
models/
├── yolo26n-face.pt
├── face_recognition_sface_2021dec.onnx
└── yolo26n-face_ncnn_model/
    ├── model.ncnn.param
    ├── model.ncnn.bin
    └── metadata.yaml
```

已有 NPZ 向量可直接使用。新增人员时，将照片放在 `faces/person_id/`，执行：

```bash
.venv/bin/python src/register.py --input faces/person_id --name person_id \
  --detector models/yolo26n-face_ncnn_model --device cpu --opencv-threads 4
./scripts/build-cpp-pi.sh
./scripts/run-cpp-pi.sh --source csi --no-show --max-frames 30
```

构建脚本在 Pi 上编译 NCNN 和应用，默认并行数为 2。修改应用后使用 `cmake --build build/cpp --parallel 2` 增量编译。

将 `face_vectors/names.example.json` 复制为 `face_vectors/names.json`，填写注册 ID 与中文名，例如 `{"person_id":"张三"}`。停止独立识别程序，移除魔镜人脸模块的 `disabled: true`，确认 `projectRoot` 与本机一致，然后重启魔镜。桥接接管相机，显示预览，并在稳定识别后通知 AI 助手问候。问候使用 AI 模块的 TTS 和朗读开关。

Python 实时入口、模型导出和底层选项见 [Python/CSI 部署](../../face-recognition/docs/raspberry-pi.md)，原生构建和测试见 [C++ 部署](../../face-recognition/docs/cpp-deployment.md)。

## 7. 逐项验收与运行维护

| 检查项 | 操作与期望结果                                           |
| ------ | -------------------------------------------------------- |
| 配置   | `npm run config:check` 通过                              |
| 桌面   | Pi 显示器上卡片位置正确、按钮和滑块可操作                |
| 相机   | 显示新画面、中文姓名和相似度；停止后可重新启动相机       |
| 问候   | 同一人连续出现满足条件后播放一次；离开再进入保持当次记录 |
| 语音   | 麦克风转写、回答朗读、音量及关闭语音均正常               |
| 音乐   | 播放与歌词同步；语音期间暂停，结束后按配置恢复           |
| 天气   | 显示位置、当前天气、七天预报与来源                       |
| 状态   | `vcgencmd`、内存和磁盘读数随采样刷新                     |

运行日志保留在启动终端。调查系统异常时可前台运行 `python3 scripts/pi-anomaly-recorder.py`，记录位置见 [脚本文档](../scripts/README.md)。

## 8. 桌面登录后自动启动（labwc）

Pi 使用 labwc 桌面时，登录后的启动项位于 `~/.config/labwc/autostart`，见 [Raspberry Pi 官方桌面启动示例](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)。先完成前台验收，再配置此步骤。

在 Pi 终端准备目录：

```bash
mkdir -p "$HOME/.config/labwc" "$HOME/.local/state"
```

编辑已有 `~/.config/labwc/autostart`，保留其中启动项，在末尾加入以下内容。该例使用第 3 步安装的用户目录 Node：

```bash
(
  MM_NODE_VERSION=$(tr -d '[:space:]' < "$HOME/smart-mirror/MagicMirror/.nvmrc")
  export PATH="$HOME/.local/share/nodejs/node-v${MM_NODE_VERSION}-linux-arm64/bin:$PATH"
  cd "$HOME/smart-mirror/MagicMirror" || exit
  npm run start:wayland
) >> "$HOME/.local/state/smart-mirror.log" 2>&1 &
```

系统 Node 或其他安装目录按实际 `PATH` 调整。退出并重新登录桌面后检查魔镜与日志；需要开机直接展示时，再在系统设置中启用桌面自动登录。其他桌面会话使用对应会话的启动机制，并沿用已验收的启动命令。

## 9. 更新与回退

更新前备份 Pi 的 `config/config.js`、`css/custom.css`、API 配置、天气配置和人员库。随后按 [开发指南的更新流程](project-development.md#更新到树莓派) 发布本次修改，并重复上表对应检查。

返回 [中文项目入口](../../README_CN.md) · [English overview](../../README.md)
