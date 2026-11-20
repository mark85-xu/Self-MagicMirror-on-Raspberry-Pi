# updatenotification：更新提示

检查 MagicMirror 核心及模块的 Git 仓库状态，在有可用更新时显示提示，并提供更新状态通知。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `updatenotification.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "updatenotification",
  position: "top_bar",
  config: {
    updateInterval: 600000,
    ignoreModules: [],
    sendUpdatesNotifications: false,
    useModulesFromConfig: true
  }
}
```

## 常用参数

| 参数                       | 默认值     | 说明                                   |
| -------------------------- | ---------- | -------------------------------------- |
| `updateInterval`           | `600000`   | 更新检查间隔，毫秒                     |
| `refreshInterval`          | `86400000` | 界面状态刷新周期，毫秒                 |
| `ignoreModules`            | `[]`       | 忽略的模块名                           |
| `sendUpdatesNotifications` | `false`    | 广播更新通知                           |
| `useModulesFromConfig`     | `true`     | 按已配置模块扫描，false 时遍历模块目录 |
| `updates`                  | `[]`       | 配置更新任务                           |
| `updateTimeout`            | `120000`   | 更新任务超时，毫秒                     |
| `updateAutorestart`        | `false`    | 更新完成后的自动重启选项               |

## 使用与维护

检查依赖 Git、远端地址和服务端网络。其他模块可广播 `SCAN_UPDATES` 发起检查。核心逻辑分布在 `node_helper.js`、`git_helper.js` 和 `update_helper.js`；本地有修改时先整理工作区，再按项目维护流程更新。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² updatenotification 文档](https://docs.magicmirror.builders/modules/updatenotification.html)。

返回 [模块索引](../../README.md)
