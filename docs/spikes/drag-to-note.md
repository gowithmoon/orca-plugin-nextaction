# 技术验证：把任务卡片拖到笔记，写入引用或镜像

> 第十三步（拖拽任务卡片到笔记）开工前。状态：已实测（2026-10-14，用户在测试笔记库中运行，Windows，六轮）。

## 问题

从插件面板拖一张任务卡片到笔记面板松开，在落点写入行内引用、只有引用的新块或镜像块。需要确认：

- 能否从松开的坐标得到落点：哪个笔记面板、哪个块、行内光标位置
- 三种写入各用什么命令，结果和 Orca 界面建的是否一致
- 写入和撤销记在哪个面板，松开后能否不点任何地方直接 Ctrl+Z 一次撤完
- 写完后光标停在哪里

## 结论

### 落点

- 插件面板里用指针事件拖（`setPointerCapture`，与第六、七步的拖拽相同），松开时用 `document.elementFromPoint` 取元素。块是最近的 `.orca-block`，ID 在 `data-id`；面板是最近的 `.orca-panel`，ID 在 `data-panel-id`。插件面板同样是 `.orca-panel`，靠它里面的 `.nextaction-panel` 区分（第一轮 ⑤）。
- `document.caretRangeFromPoint` 加 `orca.utils.getCursorDataFromRange` 直接得到 Orca 的 `CursorData`（`panelId`、`rootBlockId`、`anchor.blockId/index/offset`、`isInline: true`），可以原样传给 `insertLink`（第一轮 ①）。
- 块首尾相接，块之间没有缝隙：指针在两个块之间时落到下一个块的顶边上（第一轮 ③）。行末之后的空白给出行末的行内光标（第一轮 ②）。
- 笔记面板底部没有块的空白是 `.orca-block-editor-placeholder`，取不到块和光标（第一轮 ④）。
- 块自己那一行是 `.orca-block > .orca-repr > .orca-repr-main`；`.orca-block` 的矩形包含展开的子块。
- 拖动中 Orca 不显示任何高亮或插入线，没有辅助线时很难判断落点（用户反馈），插件要自己画。
- 在 Orca 里按住 Alt 拖块，与平常拖块没有区别（第一轮）。

### 写入

- 行内引用：`insertLink(cursor, true, 任务 ID)`，`cursor` 用落点的 `CursorData`。块内容变成 `[文字, { t: "r", v: 引用 ID }, 文字]`，引用 type 1；`v` 是引用记录的 ID，不是块 ID（第二轮）。
- 只有引用的新块：同一个 `invokeGroup` 里 `insertBlock(落点块, "before" | "after", [])`，再用新块的光标（`isInline: true, index: 0, offset: 0`）`insertLink`。
- 镜像块：同一个 `invokeGroup` 里 `batchInsertReprs(落点块, 位置, [{ type: "mirror", mirroredId }])`，再 `createRef(新块, 任务, 5)`。结果与界面"复制块 → 粘贴 → 镜像"建的一致：`text` 为 `null`，一条 type 5 引用，界面显示相同（第六轮）。`batchInsertReprs` 不返回新块 ID，要比较写入前后父块的子块找出它。
  - **不要用 `insertBlock` 传镜像 `_repr`**：`text` 存了源块全文（含标签值），Orca 全局搜索会多出一条结果（第五轮）；也没有 type 5 引用，Orca 之后不会补（第三、四轮）。
  - 先插文本块再用 `setProperties` 改 `_repr`：失败（第六轮），不用。
- 镜像放进任务自己的子树时，Orca 会提示"检测到循环镜像"（用户在 Orca 中确认），插件不用另做处理。

### 焦点与撤销

- 写入和撤销记在**写入时的活动面板**上。松开时活动面板是插件面板；先 `switchFocusTo` 落点所在的笔记面板再写，撤销就在笔记面板里（第二轮）。
- **松开后立即切焦点不行**：松开引起的 click 落在插件面板上，300 ms 内活动面板又回到插件面板，组里的命令分记在两个面板上，Shift 那次一次撤销只撤掉了引用，空块留下（第二、三轮）。先等约 100 ms 再切焦点就稳定（第四轮）。
- **切焦点后立即写也不行**：`switchFocusTo` 稍后把光标恢复成这个面板上次的位置，盖掉写入放的光标（第四轮）。切焦点后再等约 100 ms 再写（第五轮）。两个 100 ms 都是实测值，不是 Orca 的约定。
- 按这个顺序，松开后不点任何地方，Ctrl+Z 一次撤掉整次写入（引用、新块加引用、镜像块加引用），打的字另算一次（第五、六轮）。

### 光标

- 行内引用：`insertLink` 把光标放在引用之后（`index: 2, offset: 0`），接着打字落在引用后面（第五、六轮）。
- 只有引用的新块：显式 `setSelectionFromCursorData` 到新块 `index: 1, offset: 0`，打字落在引用后面（第六轮）。
- 镜像块：写入把光标放进了源块；设块级光标（`isInline: false`）想"选中镜像块"做不到，Orca 把光标放在镜像内容最前面，打字改的是源任务（第六轮）。插件没有选中块的公开接口（`blockHighlight` 是内部状态）。所以写完后把光标放到落点块的末尾。

## 验证代码

`.scratch/spikes/step13-drag-to-note.js`（不纳入版本管理，第六版）：在插件面板里放一个用指针事件拖的小块，拖动时给指针下的块画红框；松开时不按键写行内引用，Shift 写只有引用的新块，Alt 写镜像块；全部结果记在内存里，`copy(await NA13.report())` 一次导出。
