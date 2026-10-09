# 插件面板藏一个块编辑器来写入，而不是直接调用后端

Orca 的 `invokeGroup` 和编辑器命令都通过**活动面板的编辑器**（`viewState.editor`）执行。插件面板本身没有编辑器：从插件面板写入时，`invokeGroup` 报错，编辑器命令不报错，但什么也不写（`docs/spikes/plugin-panel-writes.md`）。所以插件面板里藏一个 Orca 的块面板渲染器（`orca.state.panelRenderers.block`，`display: none`，显示任务标签块），插件面板因此有了自己的编辑器。写入仍走编辑器命令和 `invokeGroup`，撤销进入 Orca 的撤销历史，在插件面板里按 Ctrl+Z 就能撤回。活动面板没有编辑器时（例如插件面板之外的弹窗），`infra/orca/orca-calls.ts` 先切到一个有编辑器的面板，写完切回。所有编辑器命令和 `invokeGroup` 只经过 `orca-calls.ts` 调用，由架构测试检查。

## Considered Options

- 直接调用后端写入（`invokeBackend("set-properties", …)` 等，`orca-plugin-whiteboard` 的做法）：被否决。这样写入不进 Orca 的撤销历史，Ctrl+Z 撤不回来，而 #35 要求每次修改都能单独撤销。自己做撤销栈，等于和 Orca 的撤销争同一份笔记数据（ADR 0001）。命令后钩子也收不到这些写入（ADR 0007），还要自己更新 `orca.state.blocks` 并广播没有文档的 `orca.refresh-blocks`。白板的数据是插件自己的一块 JSON，有自己的撤销栈，所以这条路对它合适。
- 只在 `<orca.components.Block>` 里显示一个块：被否决。块能编辑，但面板不会因此获得编辑器（第二轮 E3）。
- 写入时切到一个笔记面板（本 ADR 之前的做法）：降级为退路。写入记在笔记面板的撤销历史里，在插件面板里按 Ctrl+Z 撤不回来（第三轮）。没有笔记面板打开时也写不了，只能请用户先打开一个。
- 直接调用另一个面板编辑器的 `invokeGroup`、不切换活动面板：不可行，组里的命令仍然找活动面板的编辑器（第二轮 w3）。

## Consequences

- 依赖两处没有文档的 Orca 内部行为：`panelRenderers.block` 渲染出编辑器，Orca 通过 `viewState.editor` 写入。Orca 升级后要复查；失效时最坏的结果是插件面板写不进去，`orca-calls` 的退路仍可用。
- 隐藏的编辑器显示的是任务标签块。它是否会连带渲染标签页上"带这个标签的块"、任务多时是否影响性能，没有实测。如果有影响，改为显示一个更轻的块。
- 插件面板外的弹窗（从 Orca 菜单打开的任务属性面板）没有自己的编辑器，写入记在当时的笔记面板里。
