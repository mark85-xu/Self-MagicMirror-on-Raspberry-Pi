# MMM-FaceRecognition

人脸识别卡片，将独立的 [YOLO/SFace 人脸识别工程](../../../face-recognition/README.md) 接入魔镜，显示实时标注画面、中文姓名和相似度。稳定识别已注册人员后，广播问候事件，由 [MMM-AIChat](../MMM-AIChat/README.md) 合成和播放语音。

## 树莓派部署顺序与开发

1. 按 [部署指南](../../docs/raspberry-pi-deployment.md) 将识别工程放在 `~/smart-mirror/face-recognition/`，准备模型和 NPZ 人员库。
2. 在 Pi 的识别工程运行 `./scripts/build-cpp-pi.sh`，再用 `./scripts/run-cpp-pi.sh --source csi --no-show --max-frames 30` 独立检查相机。
3. 结束独立识别，在魔镜配置中填写 `runtime: "cpp"`、`source: "picamera2"` 和实际 `projectRoot`，启用模块。
4. 配置 AI 助手的 Piper 路径及朗读开关，启动魔镜，检查预览、显示名、稳定识别和一次性问候。

界面和通知修改在本模块，检测/采集/特征修改在识别工程。C++ 变化后在 Pi 运行 `cmake --build build/cpp --parallel 2`；桥接变化后运行定向测试并重启魔镜。开发电脑可使用下文的视频预览入口，开发与更新流程见 [开发指南](../../docs/project-development.md)。

## 运行准备

默认目录结构为同级的 `MagicMirror/` 和 `face-recognition/`。先在识别工程安装 Python 环境、准备模型并注册人脸；树莓派可构建 C++ 运行时。注册、依赖和模型说明见识别工程 README。

```js
{
  module: "MMM-FaceRecognition",
  position: "fullscreen_above",
  config: {
    runtime: "auto",
    source: "0",
    stableFrames: 3,
    stableMs: 1000,
    threshold: 0.5
  }
}
```

卡片 CSS 将其定位在右侧居中。识别工程位于其他位置时，设置 `projectRoot` 为其绝对路径。每个 MagicMirror 服务使用一个识别桥接子进程，相机由该进程统一打开。

## 树莓派启动

在 Pi 的 `config/config.js` 中配置 `runtime: "cpp"`、`source: "picamera2"` 和实际 `projectRoot`。C++ 桥接会将 `picamera2` 转换为 `csi`。构建命令见 [C++ 部署](../../../face-recognition/docs/cpp-deployment.md)。

在已登录桌面的 Pi 上，从 `MagicMirror/` 运行：

```bash
./scripts/run-face-pi.sh
```

脚本选择现有 Wayland 桌面套接字，或使用 X11，魔镜显示在 Pi 屏幕上。按 `Ctrl+C` 停止。独立识别脚本与魔镜桥接使用同一个相机，切换运行入口前先退出正在使用相机的进程。

## 本地预览

在 `MagicMirror/` 下运行：

```bash
./scripts/run-face-local.sh
```

浏览器打开 `http://localhost:8082`。脚本加载已有 `config/config.js`，将人脸识别切换为 Python/USB 摄像头，将 TTS 切换为 eSpeak NG，将天气切回默认 `weather` 供数，并生成浏览器可读取的配置文件。

| 环境变量                  | 默认值                                    | 说明                         |
| ------------------------- | ----------------------------------------- | ---------------------------- |
| `FACE_LOCAL_SOURCE`       | `0`                                       | USB 摄像头编号或视频文件路径 |
| `FACE_LOCAL_TTS_BINARY`   | 本地工具目录中的 eSpeak NG 或 `espeak-ng` | 合成程序                     |
| `FACE_LOCAL_AUDIO_DEVICE` | `default`                                 | ALSA 输出设备                |

使用测试视频：

```bash
FACE_LOCAL_SOURCE=/path/to/video.mp4 ./scripts/run-face-local.sh
```

本地配置和生成文件分别为 `config/config.face-local.js`、`config/config.face-local.generated.js`。生成步骤由 `scripts/prepare-face-local.js` 完成。

## 参数

| 参数             | 默认值                                  | 说明                                                         |
| ---------------- | --------------------------------------- | ------------------------------------------------------------ |
| `runtime`        | `auto`                                  | `auto` 优先选择现有 C++ 程序；`cpp`、`python` 显式选择运行时 |
| `source`         | `"0"`                                   | 字符串：USB 编号、视频路径或 `picamera2[:index]`             |
| `projectRoot`    | 同级 `face-recognition/`                | 识别工程绝对路径                                             |
| `pythonBinary`   | `<projectRoot>/.venv/bin/python`        | Python 解释器绝对路径                                        |
| `namesFile`      | `<projectRoot>/face_vectors/names.json` | 显示姓名映射文件                                             |
| `threshold`      | `0.5`                                   | 识别与问候使用的余弦相似度阈值                               |
| `stableFrames`   | `3`                                     | 同一身份连续出现的最少帧数                                   |
| `stableMs`       | `1000`                                  | 同一身份持续出现的最少时长，毫秒                             |
| `frameTimeoutMs` | `60000`                                 | 等待画面事件的超时，毫秒                                     |
| `maxFrames`      | 不设置                                  | 开发时限制识别帧数                                           |

自动选择的原生程序为 `<projectRoot>/build/cpp/face_recognizer`。Python 入口为 `src/recognize.py`，桥接固定传入 CPU 和 OpenCV 4 线程，检测模型使用 Python 默认 `.pt`。独立 Pi Python 启动脚本则显式使用 NCNN。

## 中文姓名与问候

在识别工程的 `face_vectors/names.json` 填写 ID 到显示名的映射：

```json
{
  "person_id": "张三"
}
```

键对应 NPZ 中的原始身份，值用于界面与 TTS。保存后重启服务加载。拼音 ID 原样显示；有中文显示名时问候带姓名，其他情况使用通用称呼。

身份同时满足 `threshold`、连续帧数和持续时间后触发；中途消失则重新累计。每位人员在桥接本次运行中问候一次，重启后重新计数。问候按运行主机的时段生成；Unknown 显示为“陌生访客”。

`FACE_RECOGNIZED_GREETING` 负载为 `{ eventId, name, displayName, text }`。AI 助手排队播放、遵守朗读与音量设置，并协调音乐暂停和恢复。

## 事件与预览

桥接使用 `--no-show --json-events --preview-file` 启动识别程序，逐行读取如下事件：

```json
{ "type": "frame", "frame": 12, "previewUpdated": true, "faces": [{ "name": "person_id", "score": 0.82 }] }
```

状态通过 `FACE_STATE` 发送，问候通过 `FACE_GREETING` 发送，再由前端转换为全局通知。最新 JPEG 从 `/MMM-FaceRecognition/preview` 读取，每 500 毫秒至多更新一次；特征向量留在识别进程内。停止时结束子进程并清理临时预览目录。

## 排查与测试

| 现象                 | 检查内容                                            |
| -------------------- | --------------------------------------------------- |
| 识别程序启动失败     | 核对 `projectRoot`、解释器或 C++ 程序路径和执行权限 |
| 摄像头长时间无画面   | 检查输入源、相机连接和其他占用相机的进程            |
| 显示 Unknown         | 采集已确认身份的现场样本，检查注册质量并评估阈值    |
| 姓名显示正确但未问候 | 检查连续帧/持续时间、当次运行问候记录及 AI 朗读设置 |
| 语音播放失败         | 检查 AI 模块的 TTS 模型、输出设备和音量             |

在 `MagicMirror/` 下运行：

```bash
npm run test:unit -- --runInBand --runTestsByPath tests/unit/modules/MMM-FaceRecognition.spec.js tests/unit/modules/MMM-AIChat-greeting.spec.js
```

源码：`lib/face-bridge.js` 负责进程、逐行事件、稳定识别与问候生成；`node_helper.js` 提供 socket 和 JPEG 路由；前端负责卡片与全局通知。

返回 [模块索引](../README.md)
