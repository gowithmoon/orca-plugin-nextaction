# 技术验证：Orca 弹出层的容器与插件窗口里被截断的日期选择器

> #45 界面打磨的后续修复。2026-10-09 阅读 Orca 1.97.0 安装包中的前端代码得出（`resources/app.asar` 的 `out/renderer/assets/index-*.js` 与 `index-*.css`），未在 Orca 中运行验证代码。状态：**结论来自源码，界面效果待在 Orca 中手动确认**。

## 问题

任务属性面板弹窗和快速捕获窗口里，日期选择器打开后被窗口截断，下半部分看不到也点不到。

## 结论

- **Orca 的弹出层（`Popup`）挂到哪里**：传了 `container` 就挂进它，否则挂进锚点元素的 `offsetParent`。`DatePicker` 把 `menuContainer` 作为 `container` 传给 `Popup`；`Select` 也一样。
- **为什么被截断**：插件窗口 `.nextaction-window` 是 `position: fixed`，又设了 `overflow: hidden`。窗口里锚点的 `offsetParent` 就是窗口本身，日期选择器挂进窗口后被它裁掉。`Popup` 还按容器的矩形决定向上还是向下展开、横向夹在容器之内，所以也只能在窗口这个小框里摆放。
- **弹出时的指针处理**：`Popup` 打开时给容器加 `no-pointer` 类（`.no-pointer { pointer-events: auto }`，其子元素 `pointer-events: none`），给 `body` 加 `orca-popup-pointer-logic`（`pointer-events: none`）；`DatePicker` 另外注入 `.orca-popup { pointer-events: none; }`，并给自己的弹出层内联 `pointer-events: auto`。点在弹出层之外的鼠标按下由 `document` 上的监听器关闭弹出层。
- **弹出层的层级**：`ModalOverlay` 内的 `Popup` 取 `z-index: 400 + 99`（`MODAL_ZINDEX` 加 `ZINDEX`），在遮罩之内高于窗口。

## 做法

窗口旁边放一个铺满遮罩的空层 `.nextaction-popup-layer`（`ui/components/popup-layer.tsx`），通过 React context 交给窗口内的 `DateField` 和 `ChoicesField`，作为 `DatePicker`、`Select` 的 `menuContainer`。平时它不接收指针（`:where()` 写法不占权重），弹出层打开时 Orca 的 `no-pointer` 让它接住指针，点在弹出层外只关闭弹出层，与 Orca 自己的行为一致。插件面板的侧栏里没有这个层，`menuContainer` 为空，沿用 Orca 的默认摆放。

后来又犯过一次：回顾弹窗（#97 验收）里选"每月"再选几号，日期下拉被窗口截断。原因是重复规则里的单选控件直接用了 Orca 的 `Select`，没传 `menuContainer`，每个调用处都得记着传层，容易漏。现在 `ui/components/popup-controls.tsx` 包装了 `Select`、`DatePicker`，默认用 `usePopupLayer()` 作 `menuContainer`（显式传入的仍然优先），`ui` 只用这两个包装；`tests/architecture.test.ts` 的规则"takes Select or DatePicker from orca.components"禁止在 `ui` 中直接从 `orca.components` 取它们。

## 第二轮：插件面板里的菜单与子菜单

2026-10-13 实测（Windows，视口 1440×852），`.scratch/spikes/menu-clip.js`。

问题：插件面板较窄时，右键任务卡片打开任务操作菜单，鼠标停在"状态"上，状态子菜单被面板左边界截断。插件面板里所有 `ContextMenu`、`Select`、`DatePicker` 都没有容器：卡片的右键菜单和状态菜单、回顾视图改截止日期的菜单和日期选择器、筛选和排序下拉、我的一天的搜索、宽档侧栏里任务属性面板的字段。我的一天的时间轴卡片把菜单放进了 `.nextaction-my-day-layout`，它仍在面板里，同样会被截。

- **面板的祖先**：`.nextaction-panel`（`overflow: hidden`）→ `.orca-hideable`（`position: absolute; z-index: 10; overflow: hidden`）→ `.orca-panel` → `.orca-panels-row`（`overflow: hidden`）→ `#main` → `#app` → `body`。一路上没有 `transform`、`filter`、`contain`，面板里一个 `position: fixed; inset: 0` 的层铺满视口。
- **子菜单跟着父菜单**：`MenuText` 的子菜单是父菜单 `.orca-menu` 里的一个 `.orca-popup`，父菜单进了哪个容器，子菜单就在哪里。
- **放在面板里的层**：菜单越过面板左边界（菜单 x=1057，面板 x=1100），子菜单完整。但插件面板在中间、右边还有笔记面板时，伸进右边面板的部分被那个面板盖住（看起来透明，仍能点）：每个面板的 `.orca-hideable` 都是 `z-index: 10`，DOM 中靠后的在上面，面板里的层逃不出自己面板的层叠上下文。
- **挂到 `body` 的层（`z-index: 99`）**：菜单和子菜单完整显示，不被任何面板盖住；能点选，点菜单外面关闭菜单。99 与 Orca 的 `Popup` 自己的 `z-index` 相同，低于 `ModalOverlay`（400 起），插件窗口仍在它上面。

做法：插件面板用 `PanelPopupLayer` 通过 portal 在 `document.body` 下放一层 `.nextaction-panel-popup-layer`（`position: fixed; inset: 0; z-index: 99`，平时不接收指针），通过同一个 context 交给面板里的控件。`popup-controls.tsx` 增加 `ContextMenu` 的包装，默认 `container` 为 `usePopupLayer()`；架构测试的规则扩展到 `ContextMenu`。时间轴卡片的 `menuContainer` 不再需要。

## 关闭弹出层后 body 留着 `orca-popup-pointer-logic`（Orca 的问题）

2026-10-13 实测，`.scratch/spikes/stuck-pointer.js`、`stuck-loop.js`，以及 Orca 1.97 前端代码（`index-*.js`）。已由用户报告给 Orca。

- 现象：拖动面板后，面板拖动手柄的提示"拖动以移动面板"一直显示；之后打开再关闭一个菜单，整个应用能单击，不能双击、右键。
- Orca 用全局数组 `window._orcaPopupIds` 记录打开着的弹出层（提示也在内）。拦截指针的弹出层打开时给 `body` 加 `orca-popup-pointer-logic`（`pointer-events: none`）；任一弹出层关闭时，**数组为空**才去掉这个类。
- 拖动面板时浏览器的原生拖动吞掉了手柄的 `mouseleave`，提示不关，留在数组里。之后任何拦截指针的菜单（插件卡片的右键菜单、Orca 自己的块右键菜单都一样）关闭时，数组不空，类留在 `body` 上。往数组里塞一个不会关的条目，Orca 自己的块右键菜单关闭后同样留下这个类（`stuck-loop.js` 的 `manual`）。
- 与插件无关：插件不碰 `_orcaPopupIds` 和 `body` 的类，等 Orca 修复。

## 待在 Orca 中确认

- 两个窗口中的开始日期、截止日期选择器完整显示、可点选；窗口靠下的字段向上展开
- 上下文、标记的下拉菜单完整显示
- 日期选择器打开时点窗口内别处：只关闭日期选择器，窗口不关；再点遮罩空白处：关闭窗口
- 日期选择器打开时按 Esc：只关闭日期选择器
