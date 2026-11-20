# compliments：文字问候

按早晨、下午、晚上、特定日期和天气选择问候文字，在指定区域定时轮换。文案直接配置在模块中，也可从 JSON 文件加载。

## 树莓派部署与开发

该模块随 MagicMirror 一起安装。按 [部署指南](../../../docs/raspberry-pi-deployment.md) 在 Pi 准备 Node 和依赖，将下文条目写入 Pi 的 `config/config.js`，执行 `npm run config:check` 后重启桌面魔镜。

界面逻辑位于 `compliments.js`；目录中的模板、样式和 helper 按职责配合修改。修改后运行对应的单元或界面检查，再在 Pi 上检查实际布局与数据刷新。开发环境和增量更新步骤见 [开发指南](../../../docs/project-development.md)。

## 配置示例

将条目加入 `config/config.js` 的 `modules` 数组：

```js
{
  module: "compliments",
  position: "lower_third",
  config: {
    updateInterval: 30000,
    compliments: {
      anytime: ["欢迎回来"],
      morning: ["早上好，开始新的一天"],
      afternoon: ["下午好，记得休息"],
      evening: ["晚上好，今天辛苦了"]
    }
  }
}
```

## 常用参数

| 参数                                    | 默认值         | 说明                                           |
| --------------------------------------- | -------------- | ---------------------------------------------- |
| `compliments`                           | `内置时段文案` | 按 anytime、morning、afternoon、evening 等分组 |
| `updateInterval`                        | `30000`        | 切换间隔，毫秒                                 |
| `fadeSpeed`                             | `4000`         | 切换动画时长，毫秒                             |
| `random`                                | `true`         | 随机选取文案                                   |
| `remoteFile`                            | `null`         | 外部 JSON 文案文件                             |
| `remoteFileRefreshInterval`             | `0`            | 外部文案刷新间隔；0 为仅加载一次               |
| `morningStartTime / morningEndTime`     | `3 / 12`       | 早晨时段                                       |
| `afternoonStartTime / afternoonEndTime` | `12 / 17`      | 下午时段                                       |

## 使用与维护

该模块负责文字展示；人脸触发的语音问候由 `MMM-FaceRecognition` 和 `MMM-AIChat` 配合完成。修改文案后重启服务。外部文件应为合法 JSON，其字段结构与 `compliments` 一致。

在 `MagicMirror/` 下执行 `npm run config:check` 检查配置，重启服务后查看显示与日志。

完整上游参数索引：[MagicMirror² compliments 文档](https://docs.magicmirror.builders/modules/compliments.html)。

返回 [模块索引](../../README.md)
