# 树莓派 5 / CSI 摄像头部署

本部署使用 Raspberry Pi 5、64 位 Raspberry Pi OS Bookworm、系统 Python 3.11 和 IMX219 CSI 相机。工程目录统一为 `~/smart-mirror/face-recognition/`。完整魔镜安装见 [树莓派部署指南](../../MagicMirror/docs/raspberry-pi-deployment.md)，代码修改和更新见 [开发指南](../../MagicMirror/docs/project-development.md)。

本文描述 Python 版本。新增的原生 C++ 识别程序使用 `./scripts/run-cpp-pi.sh`，无需 Python 运行时，见 [C++ 部署与测速](cpp-deployment.md)。

## 环境选择

CSI 相机通过系统 Picamera2/libcamera 读取，而不是 USB 摄像头的 `cv2.VideoCapture(0)`。项目新增 `utils/capture.py`，通过 `--source picamera2` 选择 CSI；`--source 0` 仍表示 USB 摄像头，`--source picamera2:1` 可选择第二台 CSI 相机。

Bookworm 上的 Picamera2 使用系统 Python 的相机绑定。使用树莓派系统解释器和 `--system-site-packages` 新建 ARM64 环境，以加载系统相机绑定。见 [Picamera2 官方手册](https://datasheets.raspberrypi.com/camera/picamera2-manual.pdf)。

在树莓派上重建环境时：

```bash
cd "$HOME/smart-mirror/face-recognition"
/usr/bin/python3 -m venv --system-site-packages .venv
PIP_CONFIG_FILE=/dev/null .venv/bin/python -m pip install \
  --prefer-binary --only-binary=:all: -r requirements/raspberry-pi.txt
```

该设备已有 Picamera2/libcamera 和图形库。新安装的 Raspberry Pi OS 若缺少它们，可使用系统包管理器安装 `python3-picamera2`、`python3-venv`、`python3-pip` 和 `libgl1`，然后重建上述环境。

依赖文件明确使用 PyTorch 官方 CPU 包（版本包含 `+cpu`），避免默认 PyPI ARM64 包拉取 NVIDIA CUDA 依赖。CPU 包来自 [PyTorch 官方索引](https://download.pytorch.org/whl/cpu/torch/)。NumPy 固定为 1.26.4、OpenCV 为 4.11.0.86，以便与 Bookworm 的系统相机扩展共同使用。只在项目虚拟环境内安装，不升级系统 Python 包。

## 启动实时识别

在树莓派桌面的终端执行：

```bash
cd "$HOME/smart-mirror/face-recognition"
./scripts/run-pi.sh
```

脚本固定使用项目的 `.venv/bin/python`、CSI 相机、NCNN 检测模型和 CPU，并为 OpenCV/SFace 设置 4 个工作线程，即使终端激活了 Conda `(base)` 也不影响。按 `Q`、`Esc` 或关闭窗口退出。它等价于：

```bash
.venv/bin/python src/recognize.py --source picamera2 --device cpu \
  --detector models/yolo26n-face_ncnn_model --opencv-threads 4
```

通过 SSH 使用无窗口模式，先读取 30 帧：

```bash
./scripts/run-pi.sh --no-show --max-frames 30
```

持续无窗口识别：

```bash
./scripts/run-pi.sh --no-show
```

使用 `Ctrl+C` 停止。程序会释放相机，并在退出时报告帧数、运行时长和平均处理 FPS。采集配置为 640×480、15 FPS 上限；推理 FPS 在每次运行结束时单独统计。Picamera2 保留最近一张已完成的帧供识别读取，不在每次推理后额外等待新的相机帧，也不积压旧帧。相机由单个采集进程使用，运行识别前先退出其他相机程序。

## 注册、图片识别与向量

电脑上注册好的 `face_vectors/*.npz` 可直接复制到树莓派使用；无需因为 CPU 架构变化重新提取特征。复制后的 `sources` 仍记录原电脑路径，但推理只读取向量，不访问这些原图路径。

注册新人员：

```bash
.venv/bin/python src/register.py --input /path/to/person_photos \
  --name person_name --device cpu
```

按目录名批量注册：

```bash
.venv/bin/python src/register.py --input /path/to/faces --device cpu
```

原照片从电脑迁移到树莓派后绝对路径会改变；若再次注册，程序会将它们视为新样本。仅运行识别不需要重新注册。需要重新构建人员样本时可选择一个新的 `--vectors-dir`，注册与识别使用同一目录。

测试已有照片：

```bash
.venv/bin/python src/recognize.py --input faces --device cpu
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```

## 相机格式和性能

Picamera2 的 `RGB888` 在 NumPy 中提供 B、G、R 字节顺序，直接满足 OpenCV/SFace 的 BGR 输入要求，不额外交换通道。参见官方手册的图像格式附录。

树莓派启动脚本默认使用 NCNN 检测，SFace 仍使用 OpenCV ONNX CPU 推理，原向量库继续使用。NCNN 模型位于 `models/yolo26n-face_ncnn_model/`，整个目录约 9.7 MB，必须包含 `model.ncnn.param`、`model.ncnn.bin`、`metadata.yaml`。适配器检查导出元数据中的 `task=pose`、`kpt_shape=[5,2]`，使用导出时的 640×640 输入，再还原为原图像素坐标进行五点对齐。

NCNN CPU 运行时在该 Pi 5 上启用了 4 线程和 FP16 存储/计算。原 `.pt` 权重保留，便于显式对照：

```bash
./scripts/run-pi.sh --detector models/yolo26n-face.pt --no-show --max-frames 60
```

主机上的注册/识别入口仍支持 `.pt`；在任一入口传入 `--detector models/yolo26n-face_ncnn_model --device cpu` 可显式选择 NCNN。当前封装仍依赖 PyTorch 完成 Ultralytics 预处理和后处理，但 YOLO 网络前向推理由 NCNN 执行。

在开发电脑上重新导出：

```bash
uv pip install --python .venv/bin/python ncnn==1.0.20261020 pnnx==20260526
.venv/bin/python -c \
  'from ultralytics import YOLO; YOLO("models/yolo26n-face.pt").export(format="ncnn", imgsz=640, device="cpu")'
```

采用当前 Ultralytics 要求的 PNNX 版本。将完整 `_ncnn_model` 目录同步到树莓派的 `models/` 下，树莓派安装 `requirements/raspberry-pi.txt` 即可推理，不需要在 Pi 上安装 PNNX 或重新转换。参见 [Ultralytics NCNN 指南](https://docs.ultralytics.com/integrations/ncnn)。

注册原照片用于部署回归检查；现场阈值使用独立采集的新姿态、光照和其他身份样本标定。

## 初版 PyTorch 实机验证（2026-11-13）

- 系统 Python 3.11.2；Picamera2 0.3.31；NumPy 1.26.4；OpenCV 4.11.0；PyTorch 2.15.0+cpu；Ultralytics 8.4.211。
- `torch.version.cuda is None`，确认使用 CPU 构建；Picamera2、simplejpeg 与推理依赖可在同一环境导入。
- 树莓派端 17 项测试通过；现有 5 张注册照片均完成检测、特征提取和姓名匹配。
- CSI 无窗口连续处理 30 帧，14.52 秒，平均 2.07 FPS；这是本次场景的整体处理速度。
- 桌面预览连续处理 10 帧并正常关闭，7.28 秒，平均 1.37 FPS，没有 Qt 初始化错误。两次运行间可重新打开相机。
- 现场实时分数多数低于当前 0.5 阈值，显示 Unknown；本次没有自动调低阈值或将摄像头中的人脸重新注册。后续应使用确认身份的现场样本评估。

以上短测包含首次推理及窗口开销；长期运行性能与身份识别效果分别使用持续运行记录和独立样本集评估。

## NCNN 更新验证（2026-11-13）

- 开发机上统一使用方形输入时，原 `.pt` 与导出 NCNN 的单张参考图关键点最大差约 0.00025 原图像素。原 `.pt` 默认矩形填充与 NCNN 固定方形填充会产生额外差异，转换精度对照使用一致的输入填充方式。
- 树莓派上 5 张注册原图均匹配原向量库，得分约 0.943–0.992；没有重建向量或降低 0.5 阈值。
- 同一张现场图预热后各重复 12 次，检测耗时从 PyTorch 约 290 ms 降至 NCNN 约 69 ms。SFace 单独测试：OpenCV 1/2/4 线程分别约 53/29/20 ms，启动脚本据此使用 4 线程。
- 只切换 NCNN 的 CSI 测试：60 帧 / 10.64 秒，5.64 FPS，60 帧均输出 huangqichao。
- 同时使用 OpenCV 4 线程和最近完成帧的 CSI 测试：60 帧 / 8.05 秒，7.45 FPS，60 帧均输出 huangqichao，分数约 0.55–0.62。
- 桌面预览完整流程：60 帧 / 9.98 秒，6.01 FPS，窗口正常关闭，相机正常释放。

上述记录对应所列现场输入，输入分辨率、采集分辨率和识别阈值保持原设置。其他光照、姿态与多人场景使用独立测试记录。

返回 [人脸识别说明](../README.md) · [项目中文入口](../../README_CN.md)
