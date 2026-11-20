# calendar：日历聚合

通过 Node helper 获取 iCalendar 日程，合并多个日历，处理重复事件和时区，再按时间排序显示。项目将日历放在左下角。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `calendar.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "calendar",
  position: "bottom_left",
  header: "日程",
  config: {
    maximumEntries: 6,
    fetchInterval: 3600000,
    showLocation: true,
    calendars: [{ symbol: "calendar-days", url: "https://example.com/calendar.ics" }]
  }
}
```

## 常用参数

| 参数                  | 默认值         | 说明                                        |
| --------------------- | -------------- | ------------------------------------------- |
| `calendars`           | `内置节日日历` | 日历数组，每项包含 url 和可选 symbol 等配置 |
| `maximumEntries`      | `10`           | 列表最多显示条数                            |
| `maximumNumberOfDays` | `365`          | 未来查询天数                                |
| `fetchInterval`       | `3600000`      | 日历拉取间隔，毫秒                          |
| `showLocation`        | `false`        | 显示地点                                    |
| `hideDuplicates`      | `true`         | 合并重复事件                                |
| `timeFormat`          | `relative`     | 显示相对时间或 absolute 绝对时间            |
| `broadcastEvents`     | `true`         | 广播 CALENDAR_EVENTS                        |

## 使用与维护

将示例 URL 替换为自己的 `.ics` 订阅地址。日程为空时检查服务端访问该地址的结果、日历时区和事件日期。`calendar.js` 负责展示，`node_helper.js`、`calendarfetcher.js` 和工具文件负责拉取、重复规则和事件处理。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² calendar 文档](https://docs.magicmirror.builders/modules/calendar.html)。

返回 [模块索引](../../README.md)
