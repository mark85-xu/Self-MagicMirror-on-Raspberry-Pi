# 启动与诊断脚本

以下命令从 `MagicMirror/` 目录执行。脚本通过自身位置定位工程目录；人脸相关入口读取现有配置与识别工程。

## 树莓派桌面启动

```bash
./scripts/run-face-pi.sh
```

脚本进入魔镜目录，设置当前用户的 `XDG_RUNTIME_DIR`，优先使用已有 `WAYLAND_DISPLAY`；否则查找 `wayland-0`、`wayland-1`。找到 Wayland 会话时运行 `start:wayland`，其他情况运行 `start:x11`。

运行前按 [部署指南](../docs/raspberry-pi-deployment.md) 准备依赖，在树莓派登录桌面，并在 `config/config.js` 中设置识别运行时、相机和工程路径。脚本使用 `/usr/bin/node`，该解释器应满足 Node ≥22.18.0。用户目录安装 Node 时使用 `npm run start:wayland` 或 `npm run start:x11`，从当前 `PATH` 选择版本。按 `Ctrl+C` 结束前台进程。

## 本地人脸联调

```bash
./scripts/run-face-local.sh
```

依次执行 `prepare-face-local.js`、设置 `MM_CONFIG_FILE`、启动 `node serveronly`，浏览器访问 `http://localhost:8082`。

`prepare-face-local.js` 加载 `config/config.face-local.js`，将配置序列化到 `config/config.face-local.generated.js`。Node 侧的文件系统、路径和环境变量处理在生成阶段完成，浏览器读取普通配置对象。

本地配置基于 `config/config.js`，切换 Python 摄像头识别、eSpeak NG 和默认天气提供器。输入源、TTS 程序及输出设备环境变量见 [人脸模块说明](../modules/MMM-FaceRecognition/README.md)。

## 系统异常记录

```bash
python3 scripts/pi-anomaly-recorder.py
```

前台按需启动，每 5 秒记录系统状态，按 `Ctrl+C` 或发送 `SIGTERM` 停止。输出目录为运行用户的 `~/.local/state/pi-anomaly-recorder/`，记录格式为 JSONL，默认保留 14 天。

采样内容包括温度、供电与降频当前/历史位、内存与交换空间、系统运行时间及相关进程；同时尝试跟随可访问的内核日志，筛选欠压、温度、OOM、看门狗和存储异常等消息。内核日志访问结果也写入记录。

记录带 UTC 时间、boot ID 和启动后时间，便于关联同一次启动内的事件。目录权限为 `700`，日志与锁文件权限为 `600`，文件锁保持单实例运行；下一次启动时会检查上次记录的结束状态。

返回 [MagicMirror 中文说明](../README_CN.md) · [模块索引](../modules/README.md)

开发、定向测试与 Pi 更新流程见 [开发指南](../docs/project-development.md)。
