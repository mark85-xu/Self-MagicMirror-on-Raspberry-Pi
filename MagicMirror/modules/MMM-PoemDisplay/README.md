# MMM-PoemDisplay

从模块内的 `poems.json` 读取诗词，显示标题、作者和正文，支持自动轮播与手动切换。内容加载后在本地显示，适合离线诗词展示。

## 部署到树莓派与开发

将本模块目录连同 UTF-8 `poems.json` 一并迁移到 Pi，在 `config/config.js` 中启用模块并选择显示区域。内容由 Node helper 读取，依赖随魔镜安装。修改 JSON 后检查语法并重启，再在 Pi 查看上一首、下一首和自动轮播。

内容维护修改 `poems.json`，分句和切换交互修改 `MMM-PoemDisplay.js`，视觉排版修改 CSS。文件读取变化位于 `node_helper.js`。下文给出 JSON 检查命令，通用环境和更新流程见 [部署指南](../../docs/raspberry-pi-deployment.md) 与 [开发指南](../../docs/project-development.md)。

## 配置

现有项目配置中该模块设置了 `disabled: true`。启用时将其改为 `false`，并选择适合的区域：

```js
{
  module: "MMM-PoemDisplay",
  disabled: false,
  position: "middle_center",
  config: {
    updateInterval: 60000,
    fadeSpeed: 1200,
    randomizeCiLayout: true
  }
}
```

| 参数                | 默认值  | 说明                               |
| ------------------- | ------- | ---------------------------------- |
| `updateInterval`    | `60000` | 自动切换间隔，毫秒                 |
| `fadeSpeed`         | `1200`  | 切换动画时长，毫秒                 |
| `randomizeCiLayout` | `true`  | 对 `form: "ci"` 的词重新组合显示行 |

AI 助手固定在屏幕中央，同时启用诗词时可将诗词放在 `lower_third` 等区域。

## 内容格式

`poems.json` 是 UTF-8 编码的数组，每一项包含 `title`、`author`、`form` 和字符串数组 `lines`：

```json
[
  {
    "title": "静夜思",
    "author": "李白",
    "form": "verse",
    "lines": ["床前明月光，疑是地上霜。", "举头望明月，低头思故乡。"]
  }
]
```

`form: "verse"` 保留原行；`form: "ci"` 且开启 `randomizeCiLayout` 时，按句号、问号和感叹号切句，交替以一句或两句组成显示行。关闭该选项即可保持 `lines` 原排版。修改文件后重启服务加载新内容。

## 操作与数据流

点击“上一首”“下一首”立即切换，并重新计算自动切换时间；到达列表末尾后循环显示。前端发送 `POEMS_REQUEST`，Node helper 读取 JSON 后返回 `POEMS_RESPONSE`。文件读取或 JSON 解析失败时返回空列表，界面显示“暂无诗词”。

## 检查内容

在 `MagicMirror/` 下检查 JSON 语法：

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("modules/MMM-PoemDisplay/poems.json", "utf8")); console.log("poems.json OK")'
npm run config:check
```

检查每项的 `lines` 为字符串数组，再通过界面的两个切换按钮确认内容和排版。

返回 [模块索引](../README.md)
