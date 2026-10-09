# 技术验证记录

路线图第一步的技术验证（Issue #5–#13），2026-10-06 至 10-07 在测试笔记库中实测（Windows，UTC+8）。Orca 文档没写清楚的行为，以这里的结论为准；写代码时要遵守的部分已汇总到 `docs/ARCHITECTURE.md` 第 4 节"Orca 行为约束"。

| 文件 | Issue | 主题 | 影响的步骤 |
|---|---|---|---|
| [tag-operations.md](./tag-operations.md) | #5 | 打标签、改值、改名、移除标签、撤销、删除块与孤立块 | 第二、三、六步 |
| [block-properties-json.md](./block-properties-json.md) | #6 | 插件块属性中的 JSON，复制、移动、镜像块 | 第二、三、八、九步 |
| [editor-sidetool-panel.md](./editor-sidetool-panel.md) | #7 | 编辑器工具按钮、插件面板的打开、覆盖与恢复（ADR 0011） | 第一、四步 |
| [status-icon-task-menu.md](./status-icon-task-menu.md) | #8 | 状态图标与任务操作菜单 | 第三步 |
| [journal-capture.md](./journal-capture.md) | #9 | 向日记追加任务，日期与时区 | 第三步及所有涉及日期的步骤 |
| [native-reminder.md](./native-reminder.md) | #10 | Orca 原生提醒（`Reminder` 标签） | 第十一步 |
| [block-change-signals.md](./block-change-signals.md) | #11 | 块变更信号与命令后钩子（ADR 0007） | 第四步起的所有视图 |
| [plugin-lifecycle-settings.md](./plugin-lifecycle-settings.md) | #12、#17 | `pluginName`、设置（含保存范围与插件写入）、`load`/`unload`、重启后的面板 | 第一、二、三步 |
| [tag-property-query.md](./tag-property-query.md) | #13 | 按标签属性查询的能力与性能，排除孤立块 | 第二步起的所有查询 |
| [date-subtype.md](./date-subtype.md) | — | 日期属性的 `date` 与 `datetime` 子类型（第二步补测） | 第二步起所有涉及开始日期、截止日期的步骤 |
| [official-task-menus.md](./official-task-menus.md) | — | 用 `tagMenuCommands`、`blockMenuCommands` 承载任务操作（第三步补测，取代自绘图标的点击） | 第三步起的任务操作菜单 |
| [page-task.md](./page-task.md) | — | 页面任务、"有父块或有别名"的查询条件、英文属性名的 `data-` 形态（第三步补测，ADR 0013） | 第三步起的任务识别、查询和状态图标 |
| [multi-choices-created.md](./multi-choices-created.md) | — | 多选属性写入不在选项里的值；块的创建时间（第四步补测） | 第四步起的上下文、标记和收集箱排序 |
| [inbox-anomalous-status.md](./inbox-anomalous-status.md) | #37 | 状态为空或无法识别的任务与"状态为收集箱"的查询（第四步补测） | 第四步起按状态筛选的视图 |
| [plugin-panel-writes.md](./plugin-panel-writes.md) | #39、#40 | 从插件面板写入、日期值的类型、页面任务的文字、插件面板的宽度（第四步验收补测） | 第四步起所有写入和日期读取 |
| [capture-initial-properties.md](./capture-initial-properties.md) | #49 | 快速捕获带初始属性一次写入与撤销；`--orca-radius-md`、`--orca-shadow-popup` | 快速捕获；插件的圆角与弹窗阴影 |
| [orca-popup-container.md](./orca-popup-container.md) | #45 | Orca 弹出层的容器、截断与指针处理（读源码，待实测） | 插件窗口中的日期选择器和下拉菜单 |

验证脚本放在 `.scratch/spikes/`，不纳入版本管理；每份文档里记录了脚本的要点和实际返回。需要新的实测时，按 `CLAUDE.md` 的要求，把验证代码交给用户运行，结论补进这里。
