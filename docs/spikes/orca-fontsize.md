# Orca 的字号变量

2026-10-13 在插件面板的「下一步行动」视图中实测（Console 脚本：列出声明 `--orca-fontsize-*` 的规则，取变量在根元素、`body`、插件面板上的值，以及卡片文字和筛选框的实际字号与命中的规则）。

## 结论

- `--orca-fontsize-*` 只在 `:root` 上声明：`xs` .8125rem、`sm` .875rem、`md` 1rem、`lg` 1.125rem、`xl` 1.25rem。`body` 和插件面板上取到的都是这组值。
- Orca 自己在局部改写这组变量来缩小一块区域的字：`.orca-inline-reference-preview`、`.orca-block-popup-preview`、`.orca-link-dialog-preview` 写成 11/12/14px，`.orca-block-preview .orca-block-editor` 写成 `calc(倍数 * var(--orca-fontsize-md))`。
- Orca 的组件通过变量取字号，没有写死像素：`.orca-button { font-size: var(--orca-fontsize-sm) }`。Select 的按钮、提示文字（`.orca-select-button-placeholder`）、选中的文字都是这个大小。
- 插件只缩自己的 `--nextaction-*` 变量时，Orca 组件不跟着缩：筛选框的提示文字 14px，比卡片上的任务名称（12.6px）和父任务（13px）还大。

## 对插件的影响

插件的字号缩放（`ui/styles/type-scale-style.ts`）采用 Orca 的做法：在插件面板、窗口和面板弹出层上改写 `--orca-fontsize-*`，插件的文字和其中的 Orca 组件一起等比缩小。改写的值从 `:root` 上保存的原值算出，嵌套的根不会缩两次。
