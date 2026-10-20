# 技术验证：任务全景图画布在插件面板中的输入

> 第十七步（#213、#221）开工前。2026-10-20 用户在 Orca 中运行（Windows，Orca 1.98.0，Chrome 148.0.7778.280，Electron 42.7.0，`devicePixelRatio` 2，窗口宽 1440），两轮。状态：**已完成**。脚本 `.scratch/spikes/step17-canvas.js`、`step17-canvas-2.js`（不纳入版本管理）。

## 问题

在插件面板的视图上放一块画布，接管滚轮、指针和键盘时：

- W：滚轮、Shift + 滚轮、Ctrl + 滚轮、触控板两指滑动与捏合的 `wheel` 事件长什么样；`preventDefault` 后面板会不会滚；Ctrl + 滚轮会不会让 Orca 整体缩放。
- P：左键、中键、右键的指针事件和指针捕获；拖出插件面板后是否还能收到移动和松开；中键是否触发 Chrome 的自动滚动；右键菜单能否拦下。
- K：画布获得焦点时，F、+、-、=、Delete、Backspace、Esc、空格、Tab、Shift+F10、菜单键能否到达画布；Orca 是否先处理了它们（`defaultPrevented`）；Tab 之后焦点去哪里。

脚本在 `.nextaction-panel-view` 上盖一块可聚焦的测试区（`tabIndex = 0`）：`wheel` 监听为非被动、一律 `preventDefault`，按修饰键平移或缩放一个色块；`pointerdown` 后 `setPointerCapture`，中键 `pointerdown`/`mousedown` 都 `preventDefault`；`contextmenu` `preventDefault`；上面列出的键 `preventDefault`。第一轮只保留最后 80 条滚轮、40 条按键，按住空格的自动重复把别的键挤掉了；第二轮按种类汇总滚轮、不记重复按键。

## 结论

### 滚轮

| 种类（第二轮） | 次数 | `deltaX` | `deltaY` | 说明 |
|---|---|---|---|---|
| 不带修饰键、纵向 | 54 | 0 | -100…100，整数 | 鼠标滚轮每格 100；触控板两指上下滑也在这一类 |
| Shift + 纵向 | 2 | 0 | ±100 | 鼠标滚轮加 Shift：Chrome 不把它换成 `deltaX`，要自己按 Shift 当横向 |
| Ctrl + 纵向 | 93 | 0 | -100…100，有小数 | 鼠标滚轮加 Ctrl（±100）和触控板捏合（第一轮看到 1–7 的小值成串） |
| 横向 | 57 | -30…42 | 0 | 触控板两指左右滑，带惯性衰减（第一轮 64 → 0） |

- 全部是 `deltaMode` 0（像素）。
- 两轮中 `innerWidth`（1440）和 `devicePixelRatio`（2）始终不变；用户确认 Ctrl + 鼠标滚轮时 Orca 没有整体缩放，只有测试区里的色块缩放。插件面板也没有跟着滚动。
- 所以一套操作就够：不带修饰键按 `deltaX`、`deltaY` 平移（Shift 时把 `deltaY` 当横向），Ctrl / ⌘ 时以光标为中心缩放；缩放倍数用指数换算（如 `exp(-deltaY * k)`），鼠标的 ±100 和捏合的小值都顺滑。

### 指针

- 左键、中键、右键的 `pointerdown` 都能 `setPointerCapture`，`hasPointerCapture` 为真；松开后收到 `pointerup` 和 `lostpointercapture`。
- 左键拖出测试区：56 次移动中 24 次在区外，仍持续收到，松开在区外也收到 `pointerup`。指针捕获撑得住拖出插件面板的拖动（拖线、拖卡片、平移）。
- 中键按下拖动：67 次移动都收到，松开后有 `auxclick`；`preventDefault` 后没有出现自动滚动。
- 右键单击：`pointerdown`、`pointerup`、`auxclick`、`contextmenu` 依次到达，`contextmenu` 拦得住。
- 按住空格时左键拖：90 次移动都收到。

### 键盘与焦点

- F、+（Shift + `Equal`）、-、=、Delete、Backspace、Esc、空格、Tab、Shift+F10 都到达了测试区；`window` 捕获阶段看到的 `defaultPrevented` 都是假，Orca 没有先处理。
- "+" 在这台键盘上是 Shift + `Equal`，"=" 是不带 Shift 的 `Equal`：放大要同时认 `+` 和 `=`。
- 用户按的"菜单键"两轮都记为 `Meta`（`MetaLeft`），即 Windows 键；这台键盘没有菜单键（`ContextMenu`）。Shift+F10 是可靠的键盘入口。
- Tab：测试区是视图里唯一可聚焦的元素，按 Tab 后焦点离开（`blur` 的 `relatedTarget` 为空），用户看不到焦点去了哪里，五次 Tab 都这样。也就是说插件面板里没有接住 Tab 的下一个可聚焦元素，焦点会落到用户看不见的地方。

## 对任务全景图的影响

- #213：滚轮监听挂在画布元素上，非被动、`preventDefault`；按上面的规则平移和缩放，不需要区分鼠标与触控板，也不需要设置。平移和后面的拖动都用 pointer 事件加 `setPointerCapture`；中键 `pointerdown` 时 `preventDefault`；右键只交给任务操作菜单。
- #221：
  - 放大同时认 `+` 和 `=`，缩小认 `-`；F、Delete、Esc 可以直接用。
  - 卡片用 roving tabindex：画布里只有当前卡片 `tabIndex = 0`，其余为 -1，Tab 进入画布落在当前卡片上；卡片之间的"按笔记中的顺序移动"由插件处理，到了最后一张（或第一张）不再拦截，让 Tab 自然离开画布到页头的控件。这样焦点不会消失在看不见的地方。
  - 键盘弹出任务操作菜单以 Shift+F10 为准；`ContextMenu` 键有就一并认，没有也不影响。
