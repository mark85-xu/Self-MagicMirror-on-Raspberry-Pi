# MMM-QuoteDisplay

离线名言卡片，依次显示原文、译文和出处。内容直接来自配置，使用 `blockquote`、`p` 和 `cite` 展示文本。

## 部署到树莓派与开发

将模块代码和 CSS 放入 Pi 的 `MagicMirror/modules/MMM-QuoteDisplay/`，在 Pi 配置中填写 `quotes` 与区域。名言内容随配置保存，启动后离线轮播。

修改条目时编辑 Pi 配置，修改过滤、轮播与 DOM 时编辑 `MMM-QuoteDisplay.js`，排版修改 CSS。先运行下文定向测试，再在 Pi 屏幕检查原文、译文、出处和轮播间隔。整体安装见 [部署指南](../../docs/raspberry-pi-deployment.md)，本地调试和 Pi 更新见 [开发指南](../../docs/project-development.md)。

## 配置

```js
{
  module: "MMM-QuoteDisplay",
  position: "lower_third",
  config: {
    updateInterval: 300000,
    quotes: [
      {
        text: "保持好奇，持续学习。",
        translation: "Stay curious and keep learning.",
        source: "每日提醒"
      },
      { text: "把想法变成作品。", source: "项目笔记" }
    ]
  }
}
```

现有 `config/config.js` 将此模块放在 `top_right`；示例使用 `lower_third`，可按页面布局选择。

| 参数                   | 默认值       | 说明                 |
| ---------------------- | ------------ | -------------------- |
| `updateInterval`       | `300000`     | 轮播间隔，毫秒       |
| `quotes`               | 三条内置名言 | 名言对象数组         |
| `quotes[].text`        | 必填         | 非空字符串，作为原文 |
| `quotes[].translation` | 可选         | 译文                 |
| `quotes[].source`      | 可选         | 作者、作品或来源     |

默认内容为 Shakespeare《Hamlet》、Plato《Apology》和 John Donne《Meditation XVII》的摘句及中文译文。自定义 `quotes` 会替换默认列表。

## 轮播行为

启动时显示第一条；有两条及以上有效内容时按顺序循环，切换动画为 300 毫秒。只有一条时固定显示；空列表显示空容器。条目中的空白原文和无效项会被过滤，译文与出处按填写情况显示。

模块直接使用 `textContent` 写入内容，文本中的标签按普通字符显示。停止时清理轮播定时器。

## 验证

在 `MagicMirror/` 下运行：

```bash
npm run config:check
npm run test:unit -- --runInBand --runTestsByPath tests/unit/modules/MMM-QuoteDisplay.spec.js
```

源码：`MMM-QuoteDisplay.js` 负责过滤、轮播和 DOM，`MMM-QuoteDisplay.css` 负责排版。

返回 [模块索引](../README.md)
