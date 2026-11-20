# MMM-WeatherCard

实时天气与七天预报卡片。折叠时显示当前天气，悬停、键盘聚焦或点击后展开预报；点击可固定展开状态。支持默认 `weather` 通知和服务端聚合两种数据接入方式。

## 部署到树莓派与开发

在 Pi 上安装魔镜依赖后，按下文将示例 JSON 复制到运行用户的 `~/.config/magicmirror/weather.json`，填写本机可读取的私钥路径、位置与账户标识。在 `config/config.js` 启用 `useWeatherService: true`，停用用于供数的默认 `weather` 实例，然后重启魔镜。

检查当前天气、展开预报、来源和网络恢复后的刷新。开发时，卡片交互修改在 `MMM-WeatherCard.js`，请求、JWT、缓存与超时回退修改在 `weather-service.js`，配置读取修改在 `node_helper.js`。运行下文两组定向测试，再在 Pi 检查实际网络取数。完整步骤见 [部署指南](../../docs/raspberry-pi-deployment.md) 和 [开发指南](../../docs/project-development.md)。

## 卡片配置

```js
{
  module: "MMM-WeatherCard",
  position: "top_left",
  config: {
    maxForecastDays: 7,
    roundTemp: false,
    useWeatherService: true,
    updateInterval: 600000,
    retryDelay: 60000
  }
}
```

| 参数                | 默认值   | 说明                                      |
| ------------------- | -------- | ----------------------------------------- |
| `maxForecastDays`   | `7`      | 展示的预报天数上限                        |
| `roundTemp`         | `false`  | `false` 保留一位小数，`true` 显示整数温度 |
| `useWeatherService` | `false`  | 启用 Node helper 天气聚合                 |
| `updateInterval`    | `600000` | 服务端模式的成功刷新间隔，毫秒            |
| `retryDelay`        | `60000`  | 服务端模式的失败/响应丢失重试间隔，毫秒   |

## 服务端天气聚合

设置 `useWeatherService: true`，并将原有两个隐藏的默认 `weather` 条目设为 `disabled: true`，统一从服务端聚合取数。

在 `MagicMirror/` 下准备配置：

```bash
mkdir -p ~/.config/magicmirror
cp modules/MMM-WeatherCard/weather.config.example.json ~/.config/magicmirror/weather.json
chmod 600 ~/.config/magicmirror/weather.json
```

按实际位置修改经纬度、城市、时区；按自己的和风账户填写凭据与私钥路径。配置字段如下：

| 服务端字段                            | 示例/默认值                     | 说明                       |
| ------------------------------------- | ------------------------------- | -------------------------- |
| `latitude` / `longitude`              | `30.2741` / `120.1551`          | 查询位置                   |
| `locationName` / `timezone`           | `杭州市` / `Asia/Shanghai`      | 城市名与时区               |
| `primaryTimeoutMs`                    | `8000`                          | Open-Meteo 超时            |
| `fallbackTimeoutMs`                   | `10000`                         | 和风请求超时               |
| `cacheMs`                             | `600000`                        | 成功结果缓存时长           |
| `apiHost`                             | `YOUR_API_HOST.qweatherapi.com` | 和风 API Host              |
| `keyId` / `developerId` / `projectId` | 账户凭据                        | JWT 的 `kid`、`iss`、`sub` |
| `privateKeyPath`                      | Ed25519 私钥绝对路径            | 服务端签名密钥             |

Node helper 默认读取运行用户的 `~/.config/magicmirror/weather.json`。通过 `MM_WEATHER_CONFIG=/path/to/weather.json` 可切换配置文件。配置与私钥保存在服务端，修改后重启服务。

每轮刷新首先请求 Open-Meteo；超时后转向和风实时天气和七天预报。HTTP 错误与数据解析错误走失败重试流程。成功结果缓存 10 分钟，并合并并发请求；失败时卡片保留上次天气，默认 1 分钟后重试。下一次取数从 Open-Meteo 开始。

当前代码调用的和风路径为 `/weather/v1/current/{latitude}/{longitude}` 和 `/weather/v1/daily/{latitude}/{longitude}?days=7`。JWT 使用 Ed25519 服务端签名，有效期 15 分钟，距离过期 1 分钟内重签；卡片显示数据来源与和风返回的归因。

## 使用默认 weather 模块供数

设置卡片 `useWeatherService: false`，同时启用两个默认 `weather` 实例，分别使用 `type: "current"`、`type: "forecast"`。完整示例见 [weather 说明](../default/weather/README.md)。

卡片接收 `WEATHER_UPDATED` 的 `currentWeather`、`forecastArray`、`locationName`，并按有数据的字段更新；`providerName` 和 `attributions` 用于来源展示。默认模块可以通过其 `classes` 配合自定义 CSS 隐藏显示区域并保留供数。

## 排查与验证

| 现象                 | 处理                                                     |
| -------------------- | -------------------------------------------------------- |
| 服务端配置读取失败   | 核对文件路径、JSON 格式及运行用户的读取权限              |
| 和风回退失败         | 核对 API Host、三个 JWT 标识、Ed25519 私钥路径和系统时间 |
| 卡片等待天气         | 核对所选模式对应的 helper 配置或默认 `weather` 实例      |
| 显示旧天气和重试提示 | 检查 Node 服务日志中的请求错误，恢复网络后等待下一轮     |

在 `MagicMirror/` 下运行：

```bash
npm run test:unit -- --runInBand --runTestsByPath tests/unit/modules/MMM-WeatherCard.spec.js tests/unit/modules/MMM-WeatherCard-service.spec.js
```

`MMM-WeatherCard.js` 负责交互与展示，`node_helper.js` 读取本机配置，`weather-service.js` 负责请求、回退、JWT 和缓存。

返回 [模块索引](../README.md)
