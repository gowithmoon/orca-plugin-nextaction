# 技术验证：插件窗口顶到 Orca 标题栏时按钮点不中

2026-11-27 实测（Windows，显示缩放 200%，视口 1440×852），`.scratch/spikes/task-panel-header-hit.js`、`task-panel-click-shift.js`。状态：**已确认**，修复在 Windows 上验证通过。

## 现象

任务属性面板弹窗里任务标题很长、换成几行时，右上角"在笔记中打开""关闭"两个按钮要点得偏下才有反应。笔记本屏幕上、外接显示器不全屏时出现；外接显示器全屏时没有；标题只有一行时也没有。

## 结论

- **页面内的命中判断没有偏**：按钮画在 y=26–48，`elementFromPoint` 在 y=28–46 都落在按钮上。悬停提示在按钮下方（y=52 起），不挡按钮。点击过程中按钮和窗口都没有移动。
- **点按钮上半部分时页面收不到事件**：在 `document` 上以捕获阶段监听 `pointerdown`、`mousedown`、`click`，点上半部分什么也没记到；点下半部分（y=42）有完整的按下、松开、点击。鼠标在进页面之前就被拿走了。
- **原因**：Orca 是无边框窗口，顶部的标题栏是 Electron 的拖动区域（`-webkit-app-region: drag`）。实测拖动区域是一个无类名的元素，x=0–1223、y=0–42（右边留给窗口按钮）。按钮 y=26–48，上面 26–42 落在拖动区域里，与只有 y=42 那次点中相符。拖动区域里的鼠标由系统当作拖动窗口处理，不交给页面，`ModalOverlay` 盖在上面也一样，除非上面的元素声明 `no-drag`。
- **为什么和窗口大小、标题长短有关**：`.nextaction-window` 垂直居中，最高为视口高减去上下各 `--orca-spacing-lg`（16 px）。视口矮或标题换行使窗口顶到上限时，窗口的上边贴在 y=16，按钮的上半部分落进标题栏的拖动区域；窗口没顶到上限时居中靠下，碰不到标题栏。

## 做法

`.nextaction-window` 设 `-webkit-app-region: no-drag`（`ui/styles/window-style.ts`）。所有插件窗口共用这个类，快速捕获、提醒、回顾等窗口一并生效。

## 查拖动区域

控制台运行
`[...document.querySelectorAll("*")].filter(e => getComputedStyle(e).webkitAppRegion === "drag").map(e => [e.className, JSON.stringify(e.getBoundingClientRect())])`

## 验证

修复后，窗口顶到上限时两个按钮的上半部分也点得中；快速捕获、提醒窗口的关闭按钮正常；窗口没盖住的标题栏仍能拖动 Orca。
