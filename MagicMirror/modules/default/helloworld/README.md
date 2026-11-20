# helloworld：静态文字

在指定区域显示一段固定文字，适合标题、提示和新布局调试。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `helloworld.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "helloworld",
  position: "bottom_bar",
  config: { text: "欢迎使用智能魔镜" }
}
```

## 常用参数

| 参数   | 默认值         | 说明       |
| ------ | -------------- | ---------- |
| `text` | `Hello World!` | 显示的文字 |

## 使用与维护

`helloworld.js` 将配置交给 `helloworld.njk` 模板渲染。修改 `text`、`position` 后重启服务，即可检查区域与样式。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² helloworld 文档](https://docs.magicmirror.builders/modules/helloworld.html)。

返回 [模块索引](../../README.md)
