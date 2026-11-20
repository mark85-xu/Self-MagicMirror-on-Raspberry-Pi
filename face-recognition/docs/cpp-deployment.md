# 树莓派 C++ NCNN 人脸识别

C++ 版部署目录为 `~/smart-mirror/face-recognition/`。完整安装顺序见 [树莓派部署指南](../../MagicMirror/docs/raspberry-pi-deployment.md)，增量更新见 [开发指南](../../MagicMirror/docs/project-development.md)。注册照片继续使用现有 Python 工具；实时识别程序直接调用 libcamera、NCNN 和 OpenCV SFace，读取原有 `face_vectors/*.npz`，运行时不启动 Python 或 PyTorch。

各阶段耗时、稳定/峰值内存与优化优先级见 [运行时性能剖析](performance-profile.md)。

## 启动

在树莓派桌面终端执行：

```bash
cd "$HOME/smart-mirror/face-recognition"
./scripts/run-cpp-pi.sh
```

默认使用 CSI 相机 0、640×480 / 15 FPS 采集上限、640×640 NCNN 输入、4 个 CPU 线程、检测置信度 0.5、身份匹配阈值 0.5。采集线程只发布最新完成的一帧；推理不积压旧帧。相机 DMA 缓冲区同步后复制为独立图像，避免请求复用时覆盖正在推理的图像。

按 `Q`、`Esc`、关闭窗口或 `Ctrl+C` 结束。窗口显示人脸框、五点、姓名、分数和本次运行的平均处理帧率。通过 SSH 运行时：

```bash
./scripts/run-cpp-pi.sh --no-show
./scripts/run-cpp-pi.sh --no-show --max-frames 60
```

完整参数：

```bash
./scripts/run-cpp-pi.sh --help
```

也可用 `--source csi:1` 指定另一台 CSI 相机，`--source 0` 指定 USB 摄像头，`--source /path/to/video.avi` 读取视频。脚本会定位项目根目录，因此不依赖终端是否激活 Conda。相对路径参数按项目根目录解释。

原 Python 版本仍使用 `./scripts/run-pi.sh`，两版不要同时占用同一相机。

## 图片、目录和向量

识别单张照片：

```bash
./scripts/run-cpp-pi.sh --input faces/huangqichao/h-1.jpg
```

递归识别目录，并保存标注图片：

```bash
./scripts/run-cpp-pi.sh --input faces --output outputs/cpp-images
```

照片默认不弹窗；加 `--show` 可以逐张查看。输出保留目录层级，文件名追加 `.recognized.jpg`。嵌套输出目录会被排除，坏图会报告并跳过，任一图片失败则返回非零退出码。

注册仍使用已有工具，无需转换向量：

```bash
.venv/bin/python src/register.py --input /path/to/new_person \
  --name person_name --device cpu
```

注册完成后重启 C++ 程序即可读取更新。C++ 通过 libzip 读取压缩 NPZ/NPY，校验姓名、模型标识、float32 类型及 N×128 形状，再进行归一化和余弦比对。支持 UTF-32 NumPy 姓名元数据及中文文件名；窗口绘字仍建议使用英文或拼音。

调节线程数或阈值：

```bash
./scripts/run-cpp-pi.sh --threads 4 --threshold 0.5
```

阈值对应余弦相似度，调整时结合本人独立样本与其他身份样本，记录误认和漏认变化。

## 源码结构

```text
src/cpp/
├── CMakeLists.txt
├── .clang-format              # Google 风格
├── include/face/              # 各模块接口
├── camera.cpp                 # libcamera 最新帧采集、USB/视频读取、资源释放
├── detector.cpp               # NCNN、letterbox、输出解码、NMS、坐标还原
├── recognizer.cpp             # 五点对齐和 SFace 特征提取
├── gallery.cpp                # 现有压缩 NPZ 读取、校验、余弦比对
├── pipeline.cpp               # 组合检测/识别并绘制结果
├── options.cpp                # 参数、默认路径、数值检查
└── main.cpp                   # 单图/递归目录/实时入口、信号处理、统计
```

采用 C++20、Release 构建。NCNN 从官方 `20261020` 标签源码编译，并用 SHA-256 固定源码归档；安装在项目 `build/deps/ncnn-install`，不覆盖系统库。CPU 开启 ARM82 FP16，关闭 Vulkan、INT8、BF16 和当前 Pi 5 不支持的更高指令集变体。系统 OpenCV 开发库为 4.6.0，与 Python 环境的 OpenCV 4.11.0 分开使用。

## 重新构建

在 Raspberry Pi OS 上安装开发库：

```bash
sudo apt update
sudo apt install -y --no-install-recommends \
  build-essential cmake ninja-build pkg-config curl \
  libopencv-dev libcamera-dev libyaml-cpp-dev libzip-dev zlib1g-dev
```

然后在项目目录执行：

```bash
./scripts/build-cpp-pi.sh
```

默认并行编译数为 2，适合当前 4GB 内存的 Pi 5。后续只修改应用代码时：

```bash
cmake --build build/cpp --parallel 2
```

可执行文件为 `build/cpp/face_recognizer`。运行仍需 `models/` 和 `face_vectors/`；部署时将可执行文件、模型目录与向量目录一并准备。

## 验证与测速（2026-11-13）

使用同一段固定人脸画面的 60 帧 MJPEG 视频，两个版本均设置 4 线程、不显示窗口，每帧完整执行检测、对齐、提取与比对，没有隔帧识别或复用识别结果：

| 指标                      |       C++ | Python NCNN |
| ------------------------- | --------: | ----------: |
| 完整处理帧率              | 8.526 FPS |    7.08 FPS |
| 60 帧循环耗时             |   7.037 s |      8.47 s |
| 含启动的进程总耗时        |   7.672 s |    11.159 s |
| 峰值 RSS                  | 236.9 MiB |   518.4 MiB |
| 匹配到 huangqichao 的帧数 |     60/60 |       60/60 |

C++ 在该测试中帧率约提高 20%，峰值内存约减少 54%。表中 FPS 为检测、对齐、特征提取和比对的完整处理帧率。两版都在同一台 Pi 5 上使用同一份 NCNN 模型和向量，但使用的 OpenCV 库版本不同；测试期间没有发生降频。

额外验证：

- 树莓派端 27 项测试全部通过，其中 6 项为新增 C++ 原生集成测试。
- 5 张注册原照片均可匹配，C++ 与 Python NCNN 提取特征的余弦相似度约为 0.981–0.998。FP16 计算、预处理和 OpenCV 库版本带来小幅数值差异，数值对照采用余弦相似度。
- CSI 采集、SIGINT 正常退出、退出后重新打开相机均通过。
- 带人脸视频的桌面预览 30 帧正常结束，包含初次窗口开销的短测为 4.93 FPS。GUI 性能受系统 OpenCV/Qt 和显示环境影响。
- 现场验证项目包括真人动态画面、光照、姿态变化与直播帧率。历史 CSI 功能检查采用无人脸画面，完成相机和窗口的短时启动/关闭；上表采用固定人脸视频作同输入比较。

查看/复跑本次同输入对照：

```bash
./scripts/run-cpp-pi.sh --source outputs/benchmark-face.avi --no-show --max-frames 60
./scripts/run-pi.sh --source "$HOME/smart-mirror/face-recognition/outputs/benchmark-face.avi" \
  --no-show --max-frames 60
```

基准日志与内存统计保存在树莓派的 `build/benchmark-cpp.log`、`build/benchmark-python.log`、`build/cpp-benchmark.json`。

测试命令：

```bash
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```

其中 `tests/test_cpp_runtime.py` 在本机有 C++ 可执行文件和参考照片时运行；未构建本机可执行文件的开发电脑会跳过这 6 项原生集成测试。覆盖 Python/C++ 对照、Unicode 压缩向量、Unknown 拒识、错误模型/类型/坏归档、递归和坏图处理、无显示环境参数等。

需要查看数值对照时可输出仅用于本机验证的 JSON 报告：

```bash
./scripts/run-cpp-pi.sh --input faces --report outputs/cpp-validation.json
```

报告包含检测框、五点、姓名、分数与特征向量。

返回 [人脸识别说明](../README.md) · [魔镜人脸卡片](../../MagicMirror/modules/MMM-FaceRecognition/README.md)
