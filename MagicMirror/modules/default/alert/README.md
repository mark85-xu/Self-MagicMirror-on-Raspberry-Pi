# alert：通知与弹窗

接收其他模块的通知，显示短暂提示或居中的弹窗。模块通过独立浮层展示，可以省略挂载区域。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `alert.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "alert",
  config: {
    display_time: 3500,
    position: "center",
    welcome_message: "欢迎使用智能魔镜"
  }
}
```

## 常用参数

| 参数              | 默认值   | 说明                                            |
| ----------------- | -------- | ----------------------------------------------- |
| `effect`          | `slide`  | 普通通知动画                                    |
| `alert_effect`    | `jelly`  | 弹窗动画                                        |
| `display_time`    | `3500`   | 普通通知持续时间，毫秒                          |
| `position`        | `center` | 通知位置：left、center 或 right                 |
| `welcome_message` | `false`  | false 关闭欢迎语，true 使用翻译，也可填写字符串 |

## 使用与维护

其他模块通过以下通知触发短提示：

```js
this.sendNotification("SHOW_ALERT", {
  type: "notification",
  title: "提示",
  message: "配置已加载",
  timer: 3500,
});
```

`SHOW_ALERT` 的其他类型进入弹窗流程，`HIDE_ALERT` 关闭发送模块的弹窗。模板、动画和翻译分别位于 `templates/`、`styles/`、`translations/`。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² alert 文档](https://docs.magicmirror.builders/modules/alert.html)。

返回 [模块索引](../../README.md)
