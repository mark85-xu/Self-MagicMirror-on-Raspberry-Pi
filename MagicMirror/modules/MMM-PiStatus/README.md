# MMM-PiStatus

树莓派系统状态卡片，定时显示 CPU 温度、供电状态、降频状态、CPU 频率、内存占用、根分区使用率和 IP 地址。数据由运行 MagicMirror 的主机采集。

## 部署到树莓派与开发

该模块使用 Pi 系统的 `vcgencmd`、`/proc`、`/sys` 与常用系统命令；JavaScript 依赖随魔镜 `npm ci` 安装。将模块加入 Pi 的 `config/config.js`，启动后逐项与终端命令输出对照。

新增采样指标时，在 `node_helper.js` 定义数据来源、解析和显示字段，再在 `MMM-PiStatus.js` 更新行与数值刷新逻辑，样式放在模块 CSS。运行下文定向测试后，在 Pi 检查真实温度、频率与采样刷新。环境准备见 [部署指南](../../docs/raspberry-pi-deployment.md)，增量更新见 [开发指南](../../docs/project-development.md)。

## 配置

```js
{
  module: "MMM-PiStatus",
  position: "bottom_right",
  header: "系统状态",
  config: {
    updateInterval: 5000,
    animationSpeed: 500,
    showIp: true
  }
}
```

| 参数             | 默认值 | 说明                                |
| ---------------- | ------ | ----------------------------------- |
| `updateInterval` | `5000` | 采样间隔，毫秒                      |
| `animationSpeed` | `500`  | 首次创建卡片时的更新动画时长，毫秒  |
| `showIp`         | `true` | 显示 `hostname -I` 返回的第一个地址 |

## 数据来源

| 指标     | 采集方式                                                            | 显示规则                                      |
| -------- | ------------------------------------------------------------------- | --------------------------------------------- |
| CPU 温度 | `vcgencmd measure_temp`，备用路径为 `thermal_zone0`                 | 摄氏度，达到 70°C 时高亮                      |
| 供电     | `vcgencmd get_throttled` 的 bit 0                                   | “当前欠压”或“正常”                            |
| 降频     | 同一状态字的 bit 1、bit 2                                           | “正在降频”或“正常”                            |
| CPU 频率 | `vcgencmd measure_clock arm`，备用路径为 CPU0 的 `scaling_cur_freq` | MHz                                           |
| 内存     | `/proc/meminfo`                                                     | `(MemTotal - MemAvailable) / MemTotal × 100%` |
| 磁盘     | `df -h /`                                                           | 根分区使用百分比及容量                        |
| 网络     | `hostname -I`                                                       | 第一个地址                                    |

供电和降频显示当前标志位。运行历史中的欠压和降频位由独立的 [异常记录脚本](../../scripts/README.md) 保存。普通 Linux 电脑缺少 `vcgencmd` 时，helper 使用 `0x0` 作为供电与降频的回退值，界面显示“正常”。

首次响应建立卡片后，后续采样直接更新数值节点，保持布局稳定。外部采集命令的超时时间为 5 秒。

## 排查与验证

显示 `--` 时检查对应命令或 `/proc`、`/sys` 路径；显示“状态读取失败”时检查服务进程的读取权限和 `df`、`hostname` 等命令。在树莓派终端可执行：

```bash
vcgencmd measure_temp
vcgencmd get_throttled
vcgencmd measure_clock arm
df -h /
hostname -I
```

在 `MagicMirror/` 下运行模块测试：

```bash
npm run test:unit -- --runInBand --runTestsByPath tests/unit/modules/MMM-PiStatus.spec.js
```

源码：`node_helper.js` 并行采集状态，前端通过 `PI_STATUS_REQUEST` / `PI_STATUS_RESPONSE` 请求和刷新数据。

返回 [模块索引](../README.md)
