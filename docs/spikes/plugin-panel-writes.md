# 技术验证：从插件面板写入、日期值的类型、页面任务的文字、插件面板的宽度

> 第四步验收（#36、#37、#39、#40）中补测。2026-10-09 在测试笔记库中运行（Windows，UTC+8，窗口宽 1440）。状态：**已完成**。

## 问题

验收时发现的四个现象，各自的原因：

- 从插件面板（卡片的状态菜单、右键菜单、插件面板里打开的任务属性面板）写入时报错 `invokeGroup failed: Cannot read properties of undefined (reading 'invokeGroup')`；从笔记里打开的任务属性面板写入正常
- 在 Orca 里设置的截止日期，在卡片和任务属性面板里都读作空
- 页面任务在收集箱里显示"（无文字）"
- 插件面板在半屏、全屏时都只占一小部分宽度，始终是窄档

## 结论

### 写入必须经过笔记面板

- **`orca.commands.invokeGroup` 通过活动面板的编辑器执行**。它的源码是：

  ```js
  async function invokeGroup(mr, ur) {
    const pr = orca.nav.findViewPanel(orca.state.activePanel, orca.state.panels);
    !pr || !pr.viewState?.editor.invokeGroup || await pr.viewState.editor.invokeGroup(mr, ur)
  }
  ```

  活动面板是插件面板时，`viewState.editor` 不存在，于是抛出上面的错误（a、c、d）。活动面板没有 `viewState` 时，它**什么都不做就返回，回调不会执行**。
- **活动面板是插件面板时，`invokeEditorCommand("core.editor.setRefData", null, …)` 不报错，但什么也没写**（b：返回成功，重要性仍是 4）。`invokeTopEditorCommand` 同样报错（e：`reading 'invokeTopCommand'`）。
- **先 `orca.nav.switchFocusTo(笔记面板)` 再写，就能写入**（f：活动面板变成 `block`，重要性写成 3）。
- 从笔记里打开的任务属性面板能写入，是因为当时的活动面板是笔记面板。
- 没有实测：焦点在插件面板或任务属性面板弹窗里时按 Ctrl+Z 撤销什么；`switchFocusTo` 是否在后退历史里留下记录。留给 #43 的手动验证。
- 撤销：在日记里按两次 Ctrl+Z，先后撤回了截止日期（g）和重要性（f）两次写入。每次读取都紧跟在按键之后，按 `tag-operations` 的结论，撤销要约 2 秒才完全生效，所以第一次读到的还是撤销前的值，第二次读到的两项都已撤回。两组写入是两个撤销单元，记在切换过去的那个笔记面板里。

### 日期值是 `Date`

- **`get-blocks` 返回的日期属性值是 `Date` 对象，不是 ISO 字符串**：页面任务的截止日期读回 `Date`，值为 `2026-10-22T16:00:00.000Z`（本地 2026-10-23 零点）；代码写入本地 2026-10-20 零点，读回同样是 `Date`（g）。
- `tag-operations` 和 `date-subtype` 记成"ISO 字符串"，是因为它们的脚本用 `JSON.stringify` 打印结果，`Date` 打印出来就是 ISO 字符串。`created` 的情况相同（`multi-choices-created` 已经单独确认过它是 `Date`）。
- 插件把非字符串的日期一律读作空，所以 Orca 里设置的日期显示为空，任务属性面板里选的日期写进去了，却读不出来，看起来像"无法写入"。

### 页面任务的文字

- 页面块的 `content` 为空，标题就是它的别名：`NA诊断页面` 的 `aliases` 为 `["NA诊断页面"]`，`text` 为 `"NA诊断页面 #任务,…"`，返回结果里没有 `content`。普通块的 `content` 是它的文字（`[{ t: "t", v: "NA诊断任务" }]`）。

### 插件面板的宽度

- 插件面板所在的 `div.orca-panel` 宽 592 px，它下面的 `div.orca-hideable` 是横向的 flex 容器，宽同样是 592 px。插件面板的根元素 `div.nextaction-panel` 是这个容器的子元素，`flex: 0 1 auto`，只有内容的宽度 139 px，所以始终是窄档。
- 面板窄到 139 px 时，卡片宽 107 px，"重要性 一般""工作量 一般"都被截断（`scrollWidth > clientWidth`），显示成省略号。

## 对第四步的影响

- 插件的所有编辑器命令和 `invokeGroup`，都在笔记面板是活动面板时执行：活动面板不是日记或块视图时，先切换到最近活动过的笔记面板，写完再切回来，并把键盘焦点还给原来的元素（`infra/orca/orca-calls.ts`）。一个笔记面板都没有打开时，写入失败，并提示用户先打开日记或页面。多次写入重叠时（例如失去焦点保存备注的同时点了状态），等最后一次写完才切回去，否则后面的写入什么也不写。
- `invokeGroup` 的回调没有执行时，按写入失败处理，不能当作成功。
- 读取日期时接受 `Date`，也接受 ISO 字符串。
- 页面任务的文字取它的别名（`content` 为空时）。
- 插件面板的根元素设置 `flex: 1 1 0` 和 `width: 100%`，撑满 Orca 给的宽度。

## 验证代码

`.scratch/spikes/step4-diagnose.js`（不纳入版本管理）：在今天的日记末尾建任务"NA诊断任务"；`inspect()` 读取任务和页面 `NA诊断页面` 的块数据（日期值标出是不是 `Date`），以及插件面板向上 8 层元素的宽度和 flex 设置、卡片上实际显示的文字；`groupTest()` 在插件面板是活动面板时，用 a–g 七种写法写重要性或截止日期，每次写完 600 ms 后读回；`undoCheck()` 在用户按 Ctrl+Z 之后读回。

## 实际返回（摘要）

| 步骤 | 写法 | 结果 | 重要性 |
|---|---|---|---|
| a | 空的 `invokeGroup` | `Cannot read properties of undefined (reading 'invokeGroup')` | 4 |
| b | 只用 `invokeEditorCommand` 写 6 | 返回成功 | 4（没有写入） |
| c | `invokeGroup` 包住，写 5 | 同 a | 4 |
| d | `invokeGroup(…, { topGroup: true })`，写 2 | 同 a | 4 |
| e | `invokeTopEditorCommand`，写 1 | `reading 'invokeTopCommand'` | 4 |
| f | `switchFocusTo(笔记面板)` 后 `invokeGroup`，写 3 | 成功，活动面板为 `block` | 3 |
| g | 同 f 的状态下写截止日期（本地 2026-10-20 零点） | 成功，读回 `Date` `2026-10-19T16:00:00.000Z` | 3 |

撤销：第一次 Ctrl+Z 后紧接着读到重要性 3、截止日期仍在；第二次 Ctrl+Z 后读到重要性 4、截止日期已清空。

## 第二轮：插件面板自己带编辑器

2026-10-09，`.scratch/spikes/step4-embedded-editor.js`。临时面板类型 `spikeEditor`，从日记右侧打开，活动面板始终是这个临时面板。

- **编辑器命令也通过活动面板的编辑器执行。** `orca.commands.invokeEditorCommand` 的源码：

  ```js
  async function invokeEditorCommand(mr, ur, ...pr) {
    const Ji = orca.nav.findViewPanel(orca.state.activePanel, orca.state.panels);
    if (!(!Ji || !Ji.viewState?.editor?.invokeCommand)) return await Ji.viewState.editor.invokeCommand(mr, ur, ...pr)
  }
  ```

  活动面板没有编辑器时，它直接返回 `undefined`，什么都不做，这就是第一轮 b 的原因。`invokeTopEditorCommand` 同理。所以不用 `invokeGroup` 也绕不开编辑器。
- **在面板里渲染 `orca.components.Block`，面板不会因此获得编辑器**（E3）：`viewState` 为空；块能显示、能点进去编辑，但 `invokeEditorCommand` 不写，`invokeGroup` 报错。
- **在面板里渲染 Orca 的块面板渲染器 `orca.state.panelRenderers.block`（传入面板自己的 props 和 `blockId`），面板就有了编辑器**（E4）：`viewState` 出现 `editor` 和以块 ID 为键的一项，`invokeEditorCommand`、`invokeGroup`、`viewState.editor.invokeGroup` 都写入成功。块能点进去编辑，界面正常，没有报错（界面已确认）。
- **直接调用另一个面板编辑器的 `invokeGroup`，不切换活动面板，写不进去**（E3 的 w3：返回成功，值没变）：组里的编辑器命令仍然找活动面板的编辑器。
- E2（空面板）的结果与 E4 完全相同，而面板此时本应什么都不渲染。脚本的模式变量跨 `run()` 保留，多次运行时新面板一开始就是上一次的渲染器模式，原因没有确认，不作为结论。空面板没有编辑器，第一轮已经测过（插件面板）。

## 第三轮：把编辑器藏起来

2026-10-09，`.scratch/spikes/step4-hidden-editor.js`。临时面板里放一个按钮、一个输入框，以及一个隐藏的块面板渲染器（显示日记里的宿主块）。

- **藏起来照样能写**：`display: none`（H1）和尺寸为 0（H2）两种方式，面板的 `viewState` 都有 `editor`，活动面板是这个面板时 `invokeGroup` 写入成功。宿主块没有露出来，界面上看不到（界面已确认）。
- **撤销按面板分开记**：
  - 在面板里点"写入"后，焦点留在按钮上按 Ctrl+Z，撤回了这次写入（重要性 1 → 5）。按钮不在编辑器里，Orca 仍把 Ctrl+Z 交给活动面板的编辑器。
  - 在面板里写入后，点进日记按 Ctrl+Z，**没有**撤回这次写入（重要性仍是 3），撤回的是日记面板自己最近的一次修改：脚本早先在日记面板里建的宿主块被撤销掉了。
  - 推论：写入记在执行它的那个面板的撤销历史里，只有在那个面板里按 Ctrl+Z 才撤回。当前分支"切到笔记面板写入"的做法，写入记在笔记面板里，在插件面板里按 Ctrl+Z 撤不回来。
- **输入框不受影响**：在面板的输入框里打字正常，文字没有跑到宿主块里；在输入框里按 Ctrl+Z 撤销的是输入框的文字（浏览器自己的撤销），任务的值不变。键盘焦点始终不在隐藏的编辑器里。
- **`switchFocusTo` 不产生后退历史**：打开面板、切到笔记面板、再切回来，`panelBackHistory` 的长度都是 0。
- 没有红色报错。

## 对第四步的影响（第三轮后修订，决策见 ADR 0014）

- 插件面板藏一个块面板渲染器（`display: none`），显示任务标签块，插件面板因此有了自己的编辑器。从插件面板（卡片、右键菜单、侧栏、从插件面板打开的弹窗）写入时，活动面板就是插件面板，写入和撤销都在插件面板里，不切换焦点，也不需要笔记面板。
- `orca-calls` 保留"活动面板没有编辑器时切到一个有编辑器的面板"的退路，判断条件从"是日记或块视图"改为"`viewState.editor` 存在"。
- 没有实测：隐藏的块面板渲染器显示任务标签块时，会不会把标签页上"带这个标签的块"一并渲染出来（任务多时影响性能）；焦点在插件面板之外的弹窗里按 Ctrl+Z 撤销什么。留给 #43 的手动验证。

## 补充：插件块属性中的时间也读回为 `Date`

2026-10-10，第六步验收（PR #72），`.scratch/spikes/72a-completions.js`（只读，脚本贴在 PR #72 的评论中）。

- `nextaction.completions` 的 `entries[].at` 以 ISO 字符串写入，`get-blocks` 读回时是 `Date`；同一项中的 `day`（`YYYY-MM-DD`）仍是字符串。7 个带完成历史的任务都如此。
- 完成历史的解码只接受字符串，于是把这些记录读作"无法读取"：已完成区找不到最后一次完成的时间，刚完成的任务只在"显示更早的"之后出现；再次设为已完成时，为了不覆盖无法读取的数据，写入被拒绝，提示"任务的完成历史无法读取，已原样保留"。
- 修正：解码时接受 `Date` 和 ISO 字符串（`docs/ARCHITECTURE.md` §4）。笔记中的数据没有损坏，不需要迁移。
