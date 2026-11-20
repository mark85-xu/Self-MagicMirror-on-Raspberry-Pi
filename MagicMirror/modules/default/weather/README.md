# weather：天气数据与展示

通过可切换的天气提供器显示当前天气或预报，并广播 `WEATHER_UPDATED`。本项目可用两个实例分别向 `MMM-WeatherCard` 提供实时天气与预报。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `weather.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "weather",
  position: "top_right",
  config: {
    weatherProvider: "openmeteo",
    type: "current",
    lat: 30.2741,
    lon: 120.1551,
    updateInterval: 600000
  }
},
{
  module: "weather",
  position: "top_right",
  config: {
    weatherProvider: "openmeteo",
    type: "forecast",
    lat: 30.2741,
    lon: 120.1551,
    maxNumberOfDays: 7
  }
}
```

## 常用参数

| 参数                            | 默认值           | 说明                                          |
| ------------------------------- | ---------------- | --------------------------------------------- |
| `weatherProvider`               | `openweathermap` | 提供器名；示例使用 openmeteo                  |
| `type`                          | `current`        | current、forecast/daily 或提供器支持的 hourly |
| `updateInterval`                | `600000`         | 刷新间隔，毫秒                                |
| `units / tempUnits / windUnits` | `全局 units`     | 单位设置                                      |
| `roundTemp`                     | `false`          | 将温度显示为整数                              |
| `maxNumberOfDays / maxEntries`  | `5 / 5`          | 预报天数与显示条数                            |
| `showFeelsLike`                 | `true`           | 显示体感温度                                  |
| `lat / lon`                     | `由提供器定义`   | openmeteo 查询经纬度                          |

## 使用与维护

上述两个对象分别加入 `modules` 数组。`MMM-WeatherCard.useWeatherService` 设为 `false` 时接收它们的通知；设为 `true` 时将这两个实例停用，位置和凭据改在卡片服务端 JSON 中配置。隐藏默认模块的显示区域可通过 `classes` 配合自定义 CSS 完成，保持实例启用以继续供数。提供器实现位于 `providers/`，其 README 介绍扩展接口。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² weather 文档](https://docs.magicmirror.builders/modules/weather.html)。

返回 [模块索引](../../README.md)
