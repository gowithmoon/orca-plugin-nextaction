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
