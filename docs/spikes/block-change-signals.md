# 技术验证：块变更信号

> Issue #11。2026-10-07 在测试笔记库中运行（Windows）。状态：**第二轮验证进行中**（修改未加载的块）。

## 问题

- 订阅 `orca.state.blocks` 能覆盖哪些修改：当前面板内、其他面板、未加载的块、同步带来的修改
- `registerAfterCommand` 能否监听到属性和标签的修改（仅了解事实，不代表采用）
- `broadcasts` 中有没有相关的事件

## 结论（第一轮）

### 三类信号的覆盖情况

| 用户操作 | `orca.state.blocks` 订阅 | 命令后钩子 | 广播 `orca.refresh-blocks` |
|---|---|---|---|
| 空闲 10 秒 | 无 | 无 | 无 |
| 在编辑器中改文字 | 触发 | `core.editor.setBlocksContent` | 触发，参数为 `[[块ID]]` |
| 在 Orca 界面中改任务属性 | 触发 | `core.editor.setRefData`（参数含标签引用） | 触发，参数含标签块和任务块 |
| 在另一个面板中改同一个块 | 触发 | `core.editor.setBlocksContent` | 触发 |
| Ctrl+Z 撤销 | 触发 | `core.editor.undo`（没有参数） | 撤销编辑时触发 |

- **空闲时没有噪音。** 三类信号都只在真正修改时出现。
- **`registerAfterCommand` 能收到用户在界面上的编辑。** 钩子的参数就是命令的参数（不含光标），所以 `setRefData` 能直接拿到被改的任务块（`ref.from`）和标签块（`ref.to`）。
- **撤销的钩子没有参数**，从钩子本身看不出撤销了哪个块。
- **`orca.state.blocks` 订阅触发得很频繁**：一次打字有 12–25 次变更，涉及的块除了被改的块，还有日记块和相邻的块。它适合"有东西变了"的提示，不适合精确判断改了什么。
- **`orca.refresh-blocks` 广播**每次修改都会出现，并带着被改块的 ID，撤销时也一样。但它不在官方文档里，而 `broadcasts.registerHandler` 的语义是给一个类型注册处理器，插件去注册可能会顶替 Orca 自己的处理器。所以**不使用它**，只作为事实记录。
- 用户的界面操作不会经过 `orca.commands.invokeEditorCommand` 或 `invokeTopEditorCommand` 这两个公开入口，Ctrl+Z 走的是 `invokeCommand("core.editor.undo")`。
- 没有验证：同步带来的修改、插件自己用 `invokeEditorCommand` 修改时钩子是否触发（第二轮验证）。

### 第一轮未完成

- "修改一个未加载的块"没有执行成功，因为测试标签下的所有任务这次会话里都已经加载过了。第二轮改为在整个笔记库中找一个未加载的普通块来测。

## 对后续步骤的影响（待第二轮结束后定稿）

**ADR 0007（按需查询）**
- 现有决策不需要推翻：视图仍然按需查询，不维护全量的实时索引。
- 可以在此基础上补充一个更及时的刷新信号：用命令后钩子监听 `setBlocksContent`、`setRefData`、`insertTag`、`removeTag`、`deleteBlocks`、`moveBlocks`、`undo`、`redo` 等命令，钩子只负责让缓存失效、提示视图重新查询，不在钩子里维护数据。这与 ADR 中被否决的"拦截编辑器命令以维护全量索引"不同：钩子只是读命令的参数，不改变命令的行为，也不承担同步数据的职责。
- 是否采用、监听哪些命令，在第四步开始时与用户确认，并在 ADR 0007 中补充说明。

## 验证代码（第一轮）

脚本位于 `.scratch/spikes/11-block-change.js`（不纳入版本管理）。要点：

```js
// 1. 订阅 orca.state.blocks
subscribe(orca.state.blocks, (ops) => log("valtio", ...));
// 2. 命令后钩子
orca.commands.registerAfterCommand("core.editor.setRefData", fn);  // 以及其他编辑命令
// 3. 只为验证临时包装 invokeEditorCommand / invokeTopEditorCommand / invokeCommand / broadcasts.broadcast，结束时还原
```

操作流程：每一步先运行 `__naSpike11.mark("阶段名")`，再在界面上操作；最后运行 `__naSpike11.report()`。

## 实际返回（第一轮摘录）

| 阶段 | 订阅次数 | 涉及的块 | 命令后钩子 | 广播 |
|---|---|---|---|---|
| idle | 0 | — | — | — |
| edit-text | 25 | 207、208、248、210 | `setBlocksContent` ×2 | `orca.refresh-blocks [[248]]` ×2 |
| ui-status | 19 | 207、208、248、211 | `setRefData`（ref 231，248 → 211） | `[[211, 248]]`、`[[248]]` |
| other-panel | 14 | 207、208、248 | `setBlocksContent` ×2 | `[[248]]` ×2 |
| undo | 12 | 207、208、248 | `undo` ×5 | `[[248, 248]]` ×2 |
| offscreen | 0 | — | — | —（没有找到未加载的任务） |

`invokeEditor` 和 `invokeTopEditor` 在所有阶段都是空的；`invokeCommand` 只在撤销阶段出现 `core.editor.undo`。
