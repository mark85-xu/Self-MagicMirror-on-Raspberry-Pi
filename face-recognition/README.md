# YOLO 五点人脸注册与识别

检测使用已有 YOLO26 人脸模型，五点对齐和特征提取使用 SFace。注册与识别已拆分为独立入口，所有实现代码放在 `src/`；原 `detect.py` 保留为检测演示。

树莓派 5 + CSI 相机的启动、依赖和部署说明见 [树莓派部署](docs/raspberry-pi.md)。
新增的 C++ 原生实时识别版本使用 `./scripts/run-cpp-pi.sh`，见 [C++ 部署与测速](docs/cpp-deployment.md)；注册工具继续使用 Python，两版共用原始 NPZ 向量库。
树莓派上的 `scripts/run-pi.sh` 默认使用 NCNN 检测与 OpenCV 4 线程；直接运行下面的通用 Python 入口默认使用 `.pt`，可通过 `--detector models/yolo26n-face_ncnn_model --device cpu` 选择 NCNN。

魔镜实时卡片与首次识别语音问候见 [MMM-FaceRecognition](../MagicMirror/modules/MMM-FaceRecognition/README.md)。中文姓名配置放在 `face_vectors/names.json`，例如 `{"person_id": "张三"}`，以原始 ID 映射界面称呼。Python 与更新后的 C++ 入口均提供 `--json-events --preview-file` 供本地模块读取。

## 树莓派部署与开发入口

完整魔镜的安装与联动从 [树莓派部署指南](../MagicMirror/docs/raspberry-pi-deployment.md) 开始。识别工程统一放在 `~/smart-mirror/face-recognition/`，Python 环境在 Pi 用系统解释器重建，实时识别在 Pi 构建 C++ NCNN 运行时。

部署顺序：准备模型与 NPZ 人员库 → 建立 Python 注册环境 → 编译 C++ → 独立检查 CSI → 在魔镜配置中启用 `runtime: "cpp"` 与 `source: "picamera2"`。下面的 Python 通用命令用于注册、开发和对照；Pi 的依赖固定版本与 CSI 入口见 [Python/CSI 部署](docs/raspberry-pi.md)。

开发时按 `models/`、`services/`、`storage/`、`utils/` 分工修改 Python 包，原生实现位于 `src/cpp/`。在 `face-recognition/` 运行 Python 测试；C++ 修改后在 Pi 执行 `cmake --build build/cpp --parallel 2`，再检查独立相机与魔镜联动。模块通信、本地视频调试和更新步骤见 [开发指南](../MagicMirror/docs/project-development.md)。

## 目录职责

```text
face-recognition/
├── src/
│   ├── register.py                 # 注册入口
│   ├── recognize.py                # 识别入口
│   └── face_recognition/
│       ├── config.py               # 默认路径、模型配置
│       ├── domain.py               # 检测、人脸、匹配结果的数据结构
│       ├── cli.py                  # 两个入口共用的命令行参数
│       ├── models/
│       │   ├── detector.py         # YOLO 检测框和五点定位
│       │   └── embedder.py         # 五点对齐、SFace 提取特征
│       ├── services/
│       │   ├── pipeline.py         # 组合检测与特征提取
│       │   ├── registration.py     # 注册业务、逐张错误处理
│       │   └── recognition.py      # 图片批量识别、摄像头/视频识别
│       ├── storage/
│       │   └── vector_store.py     # 向量读写、去重更新、相似度比对
│       └── utils/
│           ├── images.py           # 单图读取、递归扫描、图片保存
│           ├── capture.py          # USB/视频与 Picamera2 CSI 采集
│           ├── display.py          # Qt 字体和窗口配置
│           └── drawing.py          # 框、五点、姓名、分数绘制
├── faces/                          # 原始注册照片，不由程序修改
│   └── huangqichao/
│       ├── h-1.jpg
│       └── ...
├── face_vectors/                   # 人脸向量专用目录
│   └── huangqichao.npz             # 每人一个文件
├── models/                         # 检测及识别权重
├── outputs/                        # 可选：保存识别标注图
└── tests/                          # 输入、注册、向量存储测试
```

## 运行环境

Python 工程使用 `numpy`、`opencv-python`、`ultralytics`，选择 NCNN 时使用 `ncnn`。在 `face-recognition/` 目录准备开发电脑环境：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install numpy opencv-python ultralytics ncnn
```

树莓派使用系统 Python、Picamera2 与固定版本依赖，安装步骤见 [树莓派部署](docs/raspberry-pi.md)。原生实时运行时的构建步骤见 [C++ 部署](docs/cpp-deployment.md)。

激活虚拟环境并查看入口参数：

```bash
source .venv/bin/activate
python src/register.py --help
python src/recognize.py --help
```

以下示例使用 `--device 0` 让 YOLO 使用 CUDA；去掉此参数默认使用 CPU。SFace 使用 OpenCV 的 CPU 后端。默认模型及向量目录均以项目根目录定位，不依赖启动时的工作目录。

图片输入支持 JPG、JPEG、PNG、BMP、WebP、TIF、TIFF、JFIF，扩展名大小写均可；目录中的其他文件忽略。

## 注册人脸

### 单张照片

单张照片必须指定姓名：

```bash
python src/register.py --input faces/huangqichao/h-1.jpg \
  --name huangqichao --device 0
```

### 递归读取一个人的照片目录

指定 `--name` 后，目录中所有层级的照片都属于这个人：

```bash
python src/register.py --input faces/huangqichao \
  --name huangqichao --device 0
```

例如 `faces/huangqichao/indoor/day1.jpg` 也会被读取。

### 按人员子目录批量注册

不指定 `--name` 时，使用第一层子目录名作为姓名，并递归读取各子目录中的照片：

```bash
python src/register.py --input faces --device 0
```

例如：

```text
faces/
├── huangqichao/
│   ├── h-1.jpg
│   └── indoor/h-2.jpg
└── zhangsan/
    └── z-1.jpg
```

生成 `face_vectors/huangqichao.npz`、`face_vectors/zhangsan.npz`。若照片直接放在输入根目录，程序会要求指定 `--name`，避免猜测照片属于谁。

每张注册照片必须恰好检测到一个人脸，并通过大小和五点有效性检查。损坏、无人脸、多人脸或人脸过小的照片会打印 `SKIP` 及原因，其他照片继续注册。至少有一张成功注册或更新时返回 0；全部失败时返回 1。打印的汇总会列出新增、更新和跳过数量。

同一姓名下，以原始照片的绝对路径作为样本标识。重复注册同一路径会更新对应向量，新增照片则追加；照片内容更新后可直接重新运行注册命令。文件路径改变视为新样本。某张照片重新注册失败时，其已有向量仍保留。

## 识别人脸

### 单张照片

```bash
python src/recognize.py --input /path/to/query.jpg --device 0
```

默认在命令行输出每张图中各人脸的姓名和余弦相似度，低于阈值为 `Unknown`。图片输入默认不弹窗；加 `--show` 可以查看标注，按任意键查看下一张，`Q`、`Esc` 或关闭窗口结束。

### 递归读取照片目录

```bash
python src/recognize.py --input /path/to/query_folder --device 0 \
  --output outputs
```

目录中各层级支持的图片都会被识别。损坏图片会打印原因并继续，任一图片处理失败时最终返回 1，全部处理成功返回 0。未检测到可用人脸也是一个正常识别结果，不算图片读取失败。

`--output` 是**目录**，保存检测框、五点和姓名标注。输出保留相对目录层级，并在原文件名后追加 `.recognized.jpg`，避免同名的不同图片格式互相覆盖：

```text
query_folder/indoor/photo.png
→ outputs/indoor/photo.png.recognized.jpg
```

输出目录位于输入目录内部时会自动排除，不会被再次扫描；输入目录与输出目录不能相同。程序不会覆盖原始照片。

### 摄像头或视频

```bash
python src/recognize.py --source 0 --device 0
python src/recognize.py --source /path/to/video.mp4 --device 0
```

摄像头/视频默认弹窗，按 `Q`、`Esc` 或关闭窗口退出。不提供 `--input` / `--source` 时默认使用摄像头 0。

无窗口读取前 30 帧：

```bash
python src/recognize.py --source 0 --device 0 --no-show --max-frames 30
```

## 向量存储

默认目录 `face_vectors/` 中每人保存一个 `.npz` 文件，使用 NumPy 加载（不启用 pickle）。内容为：

- `name`：人员姓名。
- `model_id`：识别模型标识。
- `features`：`N×128` 的 float32、L2 归一化特征向量。
- `sources`：每条向量对应的原始照片绝对路径，用于更新和去重。

向量目录不保存原始照片。注册和识别都支持 `--vectors-dir`，两边应指定相同目录：

```bash
python src/register.py --input faces --vectors-dir /path/to/vectors --device 0
python src/recognize.py --input /path/to/query.jpg \
  --vectors-dir /path/to/vectors --device 0
```

注册按人员原子写入，不会因某个坏样本写坏该人的向量文件；不同人员分别保存。移除人员时可删除对应 `.npz` 文件，下次启动识别时生效。更换识别模型应使用新向量目录并重新注册。上一版的 `data/faces.npz` 不会自动导入；请用原照片重新注册到新目录。

## 模型和阈值

流程：原图 → YOLO 检测框与五点 → SFace 对齐为 112×112 → 提取 128 维特征 → 归一化 → 与已注册样本取最高余弦相似度。

五点使用 `result.keypoints.xy` 的原图像素坐标。顺序为图像左侧眼、图像右侧眼、鼻尖、图像左侧嘴角、图像右侧嘴角，按图像坐标约定排列。SFace `alignCrop` 接受 `[x,y,w,h, 五点的十个坐标, confidence]`，float32，形状 `(1,15)`。

当前已有权重：

- `models/yolo26n-face.pt`：检测框与五点。
- `models/face_recognition_sface_2021dec.onnx`：识别特征，来自 [OpenCV Zoo SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)，Apache-2.0 许可。

SFace 权重 SHA-256 为 `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`。需要重新下载时：

```bash
curl -fL -o models/face_recognition_sface_2021dec.onnx \
  https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
```

默认阈值为 `0.5`，分数为特征向量的余弦相似度。可通过 `--threshold 0.6` 调高阈值，在误认与漏认之间调整。使用独立于注册集的本人照片和其他人员照片评估，再确定现场阈值。本工程用于身份展示与个性化问候，活体检测可作为后续扩展。

向量和命令行姓名支持中文；OpenCV 窗口采用英文或拼音标注，魔镜卡片通过 `names.json` 显示中文姓名。脚本保留了当前环境的 Qt 字体、xcb 配置处理。OpenCV 5.0.0 初始化 SFace 时可能出现 `Targets are not supported by the new graph engine for now` 的 DNN 警告，当前环境实际特征提取正常。

## 测试

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
```

测试覆盖递归与单图输入、按目录分组、输出目录排除、坏样本隔离、多人注册拒绝、向量读写、重复注册更新、模型标识校验、不同身份匹配和 Unknown 拒识。真实模型检查可使用上述注册与识别命令。注册原照片用于回归检查；识别效果评估使用独立采集的身份、姿态和光照样本。原生集成测试在存在本机 C++ 程序和参考照片时执行。

## 接入魔镜与事件输出

识别程序可作为 `MMM-FaceRecognition` 的子进程运行：

```bash
python src/recognize.py --source 0 --no-show --json-events \
  --preview-file /tmp/face-preview.jpg
```

`--json-events` 每帧向标准输出写入一行 JSON，包含 `type`、`frame`、`previewUpdated` 和 `faces`。每张人脸只传递 `name` 和 `score`。`--preview-file` 配合事件模式使用，将标注图原子替换为最新 JPEG，每 500 毫秒至多更新一次。

`face_vectors/names.json` 保存显示名映射；识别进程使用原始 ID，魔镜桥接负责映射中文名、累计稳定帧和生成问候。运行魔镜时由桥接管理相机，使用独立识别入口前先停止桥接。

## 文档导航

- [项目中文入口](../README_CN.md)
- [魔镜人脸卡片](../MagicMirror/modules/MMM-FaceRecognition/README.md)
- [Python 树莓派部署](docs/raspberry-pi.md)
- [C++ 构建、运行与历史基准](docs/cpp-deployment.md)
- [运行时性能剖析](docs/performance-profile.md)
