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

## 待在 Orca 中确认

- 两个窗口中的开始日期、截止日期选择器完整显示、可点选；窗口靠下的字段向上展开
- 上下文、标记的下拉菜单完整显示
- 日期选择器打开时点窗口内别处：只关闭日期选择器，窗口不关；再点遮罩空白处：关闭窗口
- 日期选择器打开时按 Esc：只关闭日期选择器
