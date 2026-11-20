# clock：时钟与日期

显示数字时钟、模拟时钟或两者组合，支持独立时区、日期、周数和日月升落信息。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `clock.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "clock",
  position: "top_left",
  config: {
    displayType: "digital",
    timeFormat: 24,
    timezone: "Asia/Shanghai",
    displaySeconds: true,
    showDate: true,
    dateFormat: "YYYY年MM月DD日 dddd"
  }
}
```

## 常用参数

| 参数                           | 默认值            | 说明                              |
| ------------------------------ | ----------------- | --------------------------------- |
| `displayType`                  | `digital`         | digital、analog 或 both           |
| `timeFormat`                   | `全局 timeFormat` | 12 或 24 小时制                   |
| `timezone`                     | `null`            | 使用系统时区，或指定 IANA 时区    |
| `displaySeconds`               | `true`            | 显示秒                            |
| `showDate / showTime`          | `true / true`     | 显示日期和时间                    |
| `dateFormat`                   | `dddd, LL`        | Moment 日期格式                   |
| `showWeek`                     | `false`           | 显示周数；也接受 short            |
| `analogSize`                   | `200px`           | 模拟时钟大小                      |
| `showSunTimes / showMoonTimes` | `false / false`   | 日出日落和月亮信息                |
| `sendNotifications`            | `false`           | 发送 CLOCK_SECOND 和 CLOCK_MINUTE |

## 使用与维护

时钟按秒或分钟边界安排刷新，并使用全局 `language` 格式化日期。时间有偏差时检查操作系统时间和 `timezone`；日月信息使用 `lat`、`lon` 配置。主实现为 `clock.js`，样式为 `clock_styles.css`。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² clock 文档](https://docs.magicmirror.builders/modules/clock.html)。

返回 [模块索引](../../README.md)
