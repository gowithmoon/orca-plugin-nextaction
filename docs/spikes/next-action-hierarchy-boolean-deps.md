# 技术验证：块层级与先后顺序、布尔属性、依赖的反向查找

> Issue #52（路线图第五步开工前）。2026-10-09 在测试笔记库中运行（Windows，UTC+8），共两轮。测试标签"NA验证第五步"（状态、依赖、顺序执行、顺序执行默认），不改动插件的任务标签。测试数据：1018 个任务（50 组 × 20 个层级任务，加上小样）。状态：**已完成**。

## 问题

- 为全部任务求出最近的任务祖先（隔着普通块也算，ADR 0003）和在笔记中的先后位置，怎么读，1000 个任务时多快
- 布尔属性：标签上的定义、`insertTag` 和 `setRefData` 写入、读回的形状、撤销、查询、界面显示
- 放弃任务时，能否从被放弃块的 `backRefs` 找到所有依赖它的任务和对应的引用 ID；在一个 `invokeGroup` 中清除依赖并移除标签后，撤销能否全部恢复

## 结论

### 块层级与先后顺序

- **读法**：查询全部任务 → `get-blocks` 取回任务块 → 对不在任务集合中的 `parent` 按层用 `get-blocks` 取回，直到根 → 在内存中计算。
  - 最近的任务祖先：沿 `parent` 向上，遇到的第一个任务。
  - 先后位置：从根到块的"在父块 `children` 中的序号"路径，按字典序比较，即文档先序。
- **耗时**（1018 个任务，三次）：总计 31–34 ms，其中查询 1.5–1.9 ms、取任务块 26–28 ms、取祖先 3–4 ms（2 层，105 个块）、计算 0.5 ms。插件真实的任务标签（8 个任务）2–6 ms。
- **正确性**：小样和 1000 个任务的父任务、先后顺序全部正确（`wrongParent: 0`、`wrongOrderGroups: 0`），包括隔着普通块的子任务、页面任务下隔着普通块的子任务（父任务为页面任务）、没有父任务的任务。`moveBlocks` 之后重新读取，父任务和顺序都按新位置。
- `get-blocks` 返回的块带 `parent`、`children`、`backRefs`。
- `get-block-tree` 只读一个 1000 任务的容器就要 36 ms，不采用。

### 布尔属性（`PropType.Boolean` = 4）

- 标签上的定义：`{ name, type: 4, pos }`，不需要 `typeArgs`。加上 `typeArgs: { defaultEnabled: true, default: false }` 后，打标签时 `data` 中写入 `false`，界面显示为未勾选的复选框（用户确认）。
- **`insertTag` 传布尔值时，值项必须带 `type: 4`。** 不带 `type` 的 `{ name, value: true }` 或 `{ value: false }`，标签整个打不上（块没有 `_tags`，`text` 不变），`invokeEditorCommand` 不抛异常，控制台打出 `SQLite3 can only bind numbers, strings, bigints, buffers, and null`（Orca 自己用 `console.error` 打的，异常没有传给调用方）。调用方能看到的唯一信号是返回值：成功时 `insertTag` 返回标签块 ID，这种失败时返回 `undefined`。和其他属性一起传也一样打不上（第二轮"状态加布尔true"）。带 `type: 4` 时 `true`、`false` 都正确写入。
- 不带 `type` 的非布尔值会被 Orca 换算：字符串 `"yes"`、`"true"`、`"false"` 和数字 `1` 都读作 `true`，数字 `0` 读作 `false`。插件不依赖这种换算。
- `setRefData` 写入 `{ name, type: 4, value }`：`true`、`false`、`null` 都原样读回。写 `null` 后，这一项留在 `data` 里，值为 `null`，不会消失。
- 界面上切换复选框，存的也是 `true` / `false`（第二段 `b1`）。
- 撤销：每次 `setRefData` 包在 `invokeGroup` 里时，`undo` 一次撤回一步：`false` → `true` → 缺项（第二轮 C2）。
- 查询：`op: 1, value: true` 命中了值为 `true` 的块，但漏掉了由字符串 `"yes"` 换算成 `true` 的那个；`op: 1, value: false` 一个都没命中。插件不按这个属性查询，只在内存中判断。

### 依赖的反向查找

- 被依赖块的 `backRefs` 中，依赖引用是 `type: 3`（`createRef(任务块, 目标块, 3)` 建的，在界面上添加依赖产生的也一样），普通的行内引用是 `type: 1`。`get-block` 和 `get-blocks` 返回的 `backRefs` 相同。
- 依赖方任务标签引用 `data` 中"依赖"的值，就是这些 `type: 3` 引用的 ID（D1 中两条 `inDependencyValue` 都为 `true`）。
- 放弃 Z：在一个 `invokeGroup` 中，对每个依赖方用 `setRefData` 写回去掉对应引用 ID 后的依赖列表，再 `removeTag(Z)`。结果：
  - 只依赖 Z 的 A：`data` 中"依赖"项整个消失，那条 `type: 3` 引用被删除。
  - 依赖 Z 和 Y 的 B：只剩 Y 的引用 ID，`text` 中不再出现 Z。
  - Z 的 `backRefs` 只剩那条行内引用；Y 不受影响。
- **一次撤销全部恢复**：Z 的标签、A 和 B 的依赖值、引用 ID（仍是原来的 276、277）都回到放弃之前。
- 没有测：被依赖的是镜像块时的 `backRefs`。

## 对后续步骤的影响

**第五步：任务图快照（#53）**
- 仓储按上面的读法读取：在取回全部任务之后，按层补取祖先块。父任务和先后位置在 `infra` 中算好，交给领域层的是"父任务 ID + 先后位置"，不是 Orca 的块结构。
- 页面任务没有 `parent`，它的父任务为空；它下面的任务以它为父任务。

**第五步：顺序执行（#59）**
- 任务标签上的"顺序执行"定义为 `{ type: 4, typeArgs: { defaultEnabled: true, default: false } }`，与 #51 一致。
- **编码时布尔值一律带 `type: 4`**，`insertTag` 和 `setRefData` 都这样写。不带 `type` 时标签会静默打不上，这条写进编码测试。
- 解码：`true` 为开启；`false`、`null`、缺项和其他任何值都为关闭。

**第五步：依赖（#57）与放弃（#61）**
- 解码依赖时，"依赖"值中的引用 ID 经任务块 `refs` 中的 `type: 3` 引用解析成目标块 ID。
- 放弃任务时，依赖方从被放弃块 `backRefs` 中的 `type: 3` 引用找到，再用依赖方"依赖"值中是否含这个引用 ID 加以确认，与放弃写在同一个 `invokeGroup` 中。
- 依赖目标是镜像块的情况没有测；实现时依赖目标一律先解析成源块，与所有接收块 ID 的入口一致。

## 验证代码

`.scratch/spikes/52-step5.js`（第一段）、`52b-step5-ui.js`（第二段，界面操作之后读回）、`52c-boolean.js`（第二轮，布尔属性的 `insertTag` 与撤销），不纳入版本管理。

- 第一段：建测试标签；建小样 `P1{ a1, 普通块g{ a2, a3 }, a4 }`、没有父任务的 L、页面任务 PG 下隔着普通块的 c1；布尔属性的各种写入与查询；Z 被 A、B 依赖、被 C 行内引用，放弃 Z 并清除依赖后撤销；在容器下建 50 组 × 20 个层级任务（每组：普通块下的父任务，10 个直接子任务，加上隔着一个普通块的 9 个子任务），用 `batch-insert-tags` 打标签，再按上面的读法读取三次并核对。
- 界面操作：切换 b1 的"顺序执行"；在 D 的"依赖"中添加 X。
- 第二轮：九种 `insertTag` 写法；`setRefData` 写 `true`、`false` 后连续撤销两次。

## 实际返回（摘录）

- 标签定义读回：`顺序执行 { type: 4, typeArgs: null }`，`顺序执行默认 { type: 4, typeArgs: { defaultEnabled: true, default: false } }`。
- 打标签不传值：`data` 中只有 `状态`、`顺序执行默认 = false`，没有 `顺序执行`。
- `insertTag` 第二轮：

| 写法 | 结果 |
|---|---|
| `{ name: 状态, value: "已完成" }`（对照） | 打上，`状态 = 已完成` |
| `{ name: 顺序执行, value: true }` / `false` | 没打上（`tags: null`） |
| `{ name: 顺序执行, type: 4, value: true }` / `false` | 打上，值为 `true` / `false` |
| 状态 + `{ name: 顺序执行, value: true }` | 没打上 |
| `value: "true"` / `"false"` | 打上，都读作 `true` |
| `value: 0` | 打上，读作 `false` |

- 撤销：`afterTrue: true`、`afterFalse: false`、`undo1: true`、`undo2:` 缺项。
- 依赖：A 依赖 [276]，B 依赖 [277, 278]，C → Z 行内引用 279。Z 的 `backRefs`：276（A，type 3）、277（B，type 3）、279（C，type 1）。放弃后 A 无"依赖"项，B 为 [278]，Z 的 `backRefs` 只剩 279；撤销后全部恢复。界面添加的依赖：D 的"依赖"为 [1280]，1280 是 D → X 的 `type: 3` 引用。
- 层级耗时（ms）：`{ query: 1.9, getTasks: 28.2, ancestors: 3.7, compute: 0.5, total: 34.3 }`、`{ 1.5, 26.9, 3.4, 0.5, 32.3 }`、`{ 1.6, 26.3, 3.1, 0.5, 31.5 }`；`get-block-tree`（容器 B）36.1。
