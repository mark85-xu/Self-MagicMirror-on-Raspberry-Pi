# newsfeed：RSS 新闻

在服务端拉取 RSS 订阅，将标题、来源、发布时间和摘要发送到前端，按间隔轮播或以列表显示。项目通过 `css/custom.css` 调整新闻卡片外观。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `newsfeed.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "newsfeed",
  position: "top_right",
  config: {
    feeds: [{ title: "我的订阅", url: "https://example.com/feed.xml" }],
    showSourceTitle: true,
    showPublishDate: true,
    showDescription: false,
    reloadInterval: 300000,
    updateInterval: 10000
  }
}
```

## 常用参数

| 参数                                | 默认值                    | 说明                                      |
| ----------------------------------- | ------------------------- | ----------------------------------------- |
| `feeds`                             | `内置 New York Times RSS` | 订阅数组，填写 title、url 和可选 encoding |
| `showAsList`                        | `false`                   | 列表显示                                  |
| `showSourceTitle / showPublishDate` | `true / true`             | 显示来源和发布时间                        |
| `showDescription`                   | `false`                   | 显示摘要                                  |
| `reloadInterval`                    | `300000`                  | 重新获取订阅的间隔，毫秒                  |
| `updateInterval`                    | `10000`                   | 切换当前新闻的间隔，毫秒                  |
| `maxNewsItems`                      | `0`                       | 新闻条数上限，0 表示全部                  |
| `ignoreOldItems`                    | `false`                   | 按 ignoreOlderThan 过滤旧新闻             |

## 使用与维护

将示例 URL 替换为实际 RSS 地址。`reloadInterval` 控制网络取数，`updateInterval` 控制界面轮播。加载异常时检查服务端网络、RSS XML 和订阅编码。`newsfeedfetcher.js` 解析订阅，`newsfeed.js` 组织列表与轮播。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² newsfeed 文档](https://docs.magicmirror.builders/modules/newsfeed.html)。

返回 [模块索引](../../README.md)
