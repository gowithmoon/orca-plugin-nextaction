# 技术验证：块变更信号

> Issue #11。2026-10-07 在测试笔记库中运行（Windows）。共两轮。状态：**已完成**（同步带来的修改未验证）。

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
- **`orca.refresh-blocks` 广播**每次修改都会出现，并带着被改块的 ID，撤销时也一样。但它不在官方文档里，而且 Orca 自己已经为它注册了处理器（第二轮 `isHandlerRegistered` 为 `true`）。`broadcasts.registerHandler` 是给一个类型注册处理器，插件再注册很可能会顶替 Orca 自己的处理器。所以**不使用它**，只作为事实记录。
- 用户的界面操作不会经过 `orca.commands.invokeEditorCommand` 或 `invokeTopEditorCommand` 这两个公开入口，Ctrl+Z 走的是 `invokeCommand("core.editor.undo")`。
- 没有验证：同步（S3 等）带来的修改会不会触发这些信号。

### 修改未加载的块（第二轮）

- `orca.state.blocks` 只是一个前端缓存，这次会话里只有 35 个块（第二轮 S0）。
- 插件用 `invokeEditorCommand` 修改一个没有加载的块时：
  - **命令后钩子照样触发**，所以插件自己的写操作也会经过同一套钩子；
  - **被修改的块会被加载进 `orca.state.blocks`**，订阅也随之触发（第二轮 S2：`inStateAfter: true`，缓存从 35 个变成 36 个）。
- 第一轮之所以没找到"未加载的任务"，是因为测试标签下的任务这次会话里都已经被加载过了。

## 对后续步骤的影响

**ADR 0007（按需查询）**
- 现有决策不需要推翻：视图仍然按需查询，不维护全量的实时索引。
- 可以在此基础上补充一个更及时的刷新信号（覆盖用户在界面上的编辑、撤销，以及插件自己的写操作）：用命令后钩子监听 `setBlocksContent`、`setRefData`、`insertTag`、`removeTag`、`deleteBlocks`、`moveBlocks`、`undo`、`redo` 等命令，钩子只负责让缓存失效、提示视图重新查询，不在钩子里维护数据。这与 ADR 中被否决的"拦截编辑器命令以维护全量索引"不同：钩子只是读命令的参数，不改变命令的行为，也不承担同步数据的职责。
- 用户已同意采用（2026-10-07），ADR 0007 已据此修订。监听哪些命令，在第四步实现时确定。

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

## 验证代码（第二轮）

脚本位于 `.scratch/spikes/11b-offscreen.js`（不纳入版本管理）：在 ID 1–400 中找一个没有加载的 `text` 块，用 `setProperties` 写入一个临时的 `nextaction.spike11` 属性，观察订阅和 `setProperties` 的命令后钩子，然后用 `deleteProperties` 删除。

## 实际返回（第二轮）

```json
{ "S0_facts": { "stateBlockCount": 35, "refreshHandlerRegistered": true },
  "S1_target": { "id": 4, "parent": 2, "textHead": "测试父任务 #任务" },
  "S2_write": { "valtioFired": true, "valtioIds": ["4"], "afterFired": true, "inStateAfter": true, "written": true },
  "S3_cleanup": { "removed": true, "afterFired": true, "stateBlockCountNow": 36 } }
```

控制台没有打印 `[NA11b] result copied to clipboard`，结果是用户手动复制的。原因可能是 `copy()` 在异步回调里失败后，代码走进了 `catch` 分支。以后的验证脚本统一把结果挂在 `window` 上，并直接 `console.log` 出来，不再依赖 `copy()`。

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
