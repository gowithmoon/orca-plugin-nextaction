# 技术验证：点笔记中的状态图标弹出菜单

> #192（体验打磨 #189）。2026-10-17 用户在测试笔记库中运行（Windows，Orca 1.98.0，Electron 42），两轮。状态：**已完成**。

## 问题

第三步做过一次"点状态图标弹出任务操作菜单"（捕获阶段拦截 `mousedown`、`click`，`::before` 命中判断，从 DOM 读块 ID），控制台实测能用（`status-icon-task-menu`），做成插件后验收时"点击无反应"，没有查原因就改用了 Orca 的官方菜单（`official-task-menus`）。这次查清：

- 命中判断在插件里是否准确
- 在哪个阶段拦截，光标才不跳进被点的块
- 菜单为什么看不见，放在哪里才看得见、停得住、能点选

## 结论

### 命中判断

- 点图标时事件目标就是 `.orca-repr-main-content`，坐标落在 `::before` 的范围内：图标宽 20.2 px、右边距 8.8 px、行高 25.6 px（`status-icon-task-menu` 的判断照用：宽度加右边距、第一行高度，各留几像素）。普通块、镜像块（`.orca-repr` 多一个 `orca-mirror-bg`）、页面标题都一样。
- 点块的文字时目标是 `span.orca-inline` 或标签，不命中；右键（`button: 2`）不处理。
- 块 ID 从最近的 `.orca-block` 的 `data-id` 读；镜像块读到的是镜像块自己的 ID（1517），要先解析成源块。

### 拦截

- 在 `window` 或 `document` 的**捕获阶段**拦截 `pointerdown`、`mousedown`、`pointerup`、`mouseup`、`click`（`preventDefault`、`stopPropagation`），点图标后光标不跳进被点的块，Orca 什么都不做。
- 只在 `body` 的冒泡阶段监听（`vendor/orca-simple-task` 的做法）时，光标会跳进被点的块。它点完就切换状态，不弹菜单，所以不在意；我们要弹菜单，不用这种做法。

### 菜单放在哪里

- **第三步那次看不见的原因：菜单的容器。** 那次和第一轮都把 `Popup` 渲染进 `body` 末尾一个没有定位、没有层级的 div，作为它的 `container`。第一轮中 18 次点击命中、都调用了打开，用户一次都没看到菜单，大多数时候 300 ms 后页面上也没有 `.orca-popup`。
- **放进挂在 `body` 下、铺满视口的层就正常**（第二轮）：`position: fixed; inset: 0; z-index: 99`，平时 `pointer-events: none`（`:where()` 写法），与插件面板的弹出层 `.nextaction-panel-popup-layer` 相同（`orca-popup-container` 第二轮）。普通块、镜像块、页面标题三处，下面四种做法都看得见、停得住、能点选，点菜单外或按 Esc 关闭：
  - Orca 的 `Popup`，`rect` 取图标的矩形，`container`、`boundary` 都是这一层；
  - 先以 `visible: false` 挂载、下一帧再打开的 `Popup`（与直接打开没有区别，不需要）；
  - Orca 的 `ContextMenu`，`container` 是这一层，带 `rect`，挂载后用 `openMenu` 打开（插件面板里卡片的状态菜单就是它）；
  - 自己画的普通框（`position: fixed`，`z-index: 99`）。
- 菜单打开时 Orca 给这一层加 `no-pointer`、给 `body` 加 `orca-popup-pointer-logic`，与插件面板里的菜单相同；菜单中心点最上层的元素是菜单自己（`div.orca-menu-text-text`）。打开动画约 300 ms（50 ms 时透明度约 0.5）。

## 对后续步骤的影响

**#193 点笔记中的状态图标改状态**
- 在 `window` 的捕获阶段登记五个监听（`pointerdown`、`mousedown`、`pointerup`、`mouseup`、`click`），只处理左键；命中时拦截这五个事件，在 `click` 时打开菜单。监听经过注册表登记，卸载时释放。
- 命中判断和从 DOM 读块 ID 放在 `ui/task-menu/orca-dom.ts`，与图标选择器在一起；`docs/ARCHITECTURE.md` 的界面注入一节写明这条例外。
- 菜单用插件面板卡片上的状态菜单（`ContextMenu` 的 `menu`），`container` 是插件自己挂在 `body` 下的层（与插件面板的弹出层同一套样式），`rect` 是图标的矩形。不要用没有定位的根节点作容器。
- 镜像块的 ID 交给仓储解析成源块（读取任务时已经这样做）。

**发布前**
- 每次 Orca 升级后，与状态图标的显示一起手动检查点击。

## 验证代码

第一轮 `.scratch/spikes/polish-icon-click.js`：在 `window` 捕获、`document` 捕获、`body` 冒泡三处同时监听五种事件，按模式决定在哪里拦截，记录命中判断、拦截后光标所在的块，以及菜单 300 ms、1000 ms 后是否还在。

第二轮 `.scratch/spikes/polish-icon-click-2.js`（脚本贴在 #192 的评论里），关键部分：

```js
// 挂在 body 下的层，与插件面板的弹出层相同
.na-spike-layer { position: fixed; inset: 0; z-index: 99; }
:where(.na-spike-layer) { pointer-events: none; }

// window 捕获阶段拦截命中的五种事件，click 时打开
for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
  window.addEventListener(type, onEvent, true);

// Popup：rect 为图标矩形，container、boundary 都是这一层
R.createElement(C.Popup, { visible, rect: hit.rect, container: layerRef, boundary: layerRef,
  allowBeyondContainer: true, defaultPlacement: "bottom", alignment: "left", escapeToClose: true, … }, menu)
```

## 实际返回（摘录）

- 第一轮：18 次命中、打开，用户都没看到菜单；捕获阶段拦截后 `after-click` 的 `caretBlock` 仍是之前所在的块，冒泡阶段时变成被点的块。
- 第二轮：14 次，三处 × 四种做法全部可见。`popup` 模式 300 ms 时：`parent: "div.na-spike-layer.no-pointer"`，`rect: [439, 142, 180, 38]`，`opacity: "1"`，`zIndex: "99"`，`topAtCenter: "div.orca-menu-text-text"`，`bodyPointerLogic: true`；点选后 `chose: true`，点菜单外关闭时 `closedBy: "onClose@…"`。`contextmenu` 模式同样，`closedBy: "onClosed@…"`。
