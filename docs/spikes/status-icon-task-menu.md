# 技术验证：状态图标与点击弹出任务操作菜单

> Issue #8。2026-10-06 在测试笔记库中运行（Windows）。状态：**已完成**。

## 问题

- 比较两种方式：样式注入加 document 点击监听（`vendor/orca-simple-task` 的做法），以及自定义渲染器或其他官方扩展点
- 在普通编辑、引用、查询结果、镜像块中显示是否一致
- 能否用 `orca.components` 的组件把菜单定位到图标处
- 标签 DOM 上如何暴露状态值（`data-` 属性与属性名、选项名的关系）
- 对编辑、光标、性能的影响

## 结论

### 方式选择

- **采用"样式注入 + 捕获阶段的点击监听"。** 这个方式完整满足需求（见下文），不改变块的类型，也不替换 Orca 的任何渲染器。
- 自定义块渲染器不适合：它按 `_repr.type` 注册，任务块是普通的 `text` 块，要用渲染器就得改掉块的类型，或者替换系统的 `text` 渲染器。前者会改动用户的数据，后者违反 `CLAUDE.md` "禁止覆盖系统渲染器"的规矩。这一点是根据 `plugin-docs/documents/Custom-Renderers.md` 分析得出的，没有实测。
- 代价是依赖 Orca 内部的 DOM 结构和类名（`orca-repr-main-content`、`orca-tags`、`orca-tag` 等），它们不是公开 API，Orca 升级后可能失效。所以这些选择器必须集中在一个模块中，并且每次 Orca 升级后都要在 Orca 中手动检查。

### 标签的 DOM 结构

- 任务标签渲染为：
  ```html
  <span class="orca-tag orca-tag-has-data" data-name="na验证标签改名" data-状态="收集箱" data-重要性="4">…NA验证标签改名</span>
  ```
  它位于 `.orca-block > .orca-repr > .orca-repr-main > .orca-repr-main-content > .orca-tags` 之下。
- `data-name` 是**小写**的标签名，选择器要用 `i` 标志做大小写不敏感匹配。
- 每个有值的标签属性，都对应一个 `data-<属性名>` 属性，值是选项名或数字原文。所以状态可以用 `[data-状态="进行中"]` 这样的选择器匹配。
- 属性名里有空格或大写字母时，`data-` 属性名会怎么变换，没有验证。`vendor/orca-simple-task` 的做法是把空格换成 `-` 并转小写。本项目写进笔记的英文属性名都是不带空格的单词（ADR 0009），但仍要在第三步用英文笔记库确认一次。

### 状态图标

- 用 `:has()` 选择器在 `.orca-repr-main-content::before` 上画 tabler 图标，每种状态一条规则。图标的位置、大小与文字都对齐（界面已确认）。
- 在日记的普通块、镜像块（类名多一个 `orca-mirror-bg`）、标签页面的列表（块的类名多一个 `orca-query-list-block-block`）中都能显示，也都能点击（界面已确认，`scan` 的 25 个结果全部有图标）。
- 同一个块在多个面板里出现时，会渲染多份 DOM，每一份都有图标。
- 图标颜色可以用 Orca 的颜色变量，`--orca-color-text-blue` 确实存在。

### 点击与菜单

- 在捕获阶段监听 `mousedown` 和 `click`，判断点中的位置是否落在 `.orca-repr-main-content` 的 `::before` 区域内。命中时调用 `preventDefault` 和 `stopPropagation`，光标就不会跳进块的文字里，正常的点击和文字输入也不受影响（界面已确认）。
- 菜单用 `orca.components` 的 `Popup`、`Menu`、`MenuTitle`、`MenuText`、`MenuSeparator` 组件，渲染到插件自己用 `createRoot` 建的根节点上，以图标的位置作为 `rect` 定位。菜单弹在图标旁边，按 Esc 可以关闭（界面已确认）。
- 用 `insertTag` 改状态后，500 ms 内 DOM 上的 `data-状态` 和图标就都更新了，原来的 DOM 元素仍在（`elStillConnected: true`）。
- **镜像块：** 点镜像块的图标时，通过 `_repr.mirroredId` 拿到源块 ID 再写入。源块和镜像块都显示新状态（界面已确认），与 #6 的结论一致。
- 放弃（`removeTag`）之后，图标随之消失。

### 清理

- 移除注入的样式、两个监听器，并卸载菜单的根节点，界面上就不会留下任何东西（`disposed`：`leftovers: 0`，图标全部消失）。

## 对后续步骤的影响

**第三步：状态图标与任务操作菜单**
- 采用样式注入加捕获阶段监听。依赖 Orca DOM 结构的选择器和命中判断，全部集中在 `ui/task-menu` 的一个文件中。
- 图标选择器按**任务标签名**（小写，`i` 匹配）和**状态属性在笔记中的名称**（ADR 0009）生成。标签改名或启动对齐后，要重新生成样式。
- 点击时先把镜像块解析成源块（#6 的规矩），再交给用例处理。
- 菜单项通过登记的方式添加（`docs/ROADMAP.md` 第三步），菜单本身用 Orca 的菜单组件，外观与 Orca 一致。
- 样式、监听器、菜单根节点都通过注册表登记，卸载时释放。

**第一步 #3：注册表**
- 便捷方法除了已有的那些，还需要"渲染一个独立的 React 根节点"：释放时调用 `unmount` 并移除宿主元素。

**发布前**
- 每次 Orca 升级后，手动检查图标的显示和点击是否仍然正常。

## 验证代码

先打开含测试任务的日记，再在控制台运行；然后在界面上点击图标操作；最后运行 `__naSpike8.dispose()`。

完整代码见 Issue #8 的讨论记录。关键部分如下：

```js
// 状态值所在的 data- 属性：在标签元素上找值等于某个选项名的属性
const T = `.orca-tag[data-name="${TAG}" i]`;
const statusAttr = [...first.attributes].find((a) => a.name.startsWith("data-") && values.includes(a.value))?.name;

// 图标：:has() 匹配带任务标签的块，按状态值换图标和颜色
const sel = (extra) => [
  `.orca-repr-main-content:has(>.orca-tags>${T}${extra})::before`,
  `.orca-repr:has(>.orca-repr-card-title>.orca-tags>${T}${extra})>.orca-repr-main>.orca-repr-main-content::before`,
  `.orca-query-card-title:has(>.orca-tags>${T}${extra}) ~ .orca-block>.orca-repr>.orca-repr-main>.orca-repr-main-content::before`,
].join(",\n");

// 命中判断：点中的位置在 ::before 的宽度和第一行高度之内
const ps = getComputedStyle(el, "::before");
const w = (parseFloat(ps.width) || parseFloat(ps.fontSize) || 16) + (parseFloat(ps.marginRight) || 0);
const x = e.clientX - rect.left - padL, y = e.clientY - rect.top;
if (x < -2 || x > w + 2 || y < -2 || y > lineH + 4) return null;

// 镜像块解析为源块
const repr = orca.state.blocks[blockId]?.properties?.find((p) => p.name === "_repr")?.value;
const srcId = repr?.type === "mirror" ? repr.mirroredId : blockId;

// 捕获阶段监听，命中时阻止默认行为
document.addEventListener("mousedown", onDown, true);
document.addEventListener("click", onClick, true);

// 菜单：Popup + Menu，渲染到独立根节点，以图标的 rect 定位
React.createElement(C.Popup, { visible, rect, container: hostRef, boundary: bodyRef, allowBeyondContainer: true,
  defaultPlacement: "bottom", alignment: "left", escapeToClose: true, onClose, onClosed }, menu);
```

## 实际返回（摘录）

- `tag`：标签 211，状态选项为收集箱、待开始、已完成、进行中。
- `dom`：
  ```json
  { "count": 7,
    "attrs": { "class": "orca-tag orca-tag-has-data", "data-name": "na验证标签改名", "data-状态": "收集箱", "data-重要性": "4" },
    "chain": [ "span.orca-tag", "span.orca-tags", "div.orca-repr-main-content", "div.orca-repr-main", "div.orca-repr.orca-repr-text", "div.orca-block#233" ],
    "statusAttr": "data-状态" }
  ```
- 第一次 `scan`：7 个，全部有图标。
- `click-hit`：图标宽 29 px，行高 25.6 px，命中坐标都在 x 5–17、y 5–21 之间。
- `action`（改状态）：
  - 233：待开始 → 已完成 → 进行中 → 待开始 → 进行中，每次 `statusAttrNow` 与所选值一致。图标颜色依次为蓝 `rgb(7,113,173)`、绿 `rgb(70,140,102)`、黄 `rgb(203,145,47)`。
- 镜像：点击 242 时，`srcId: 241`，`isMirror: true`，改成"收集箱"后 `statusAttrNow: "收集箱"`。
- `action`（放弃）：235 之后 `statusAttrNow: null`，`icon.content: "none"`。
- 第二次 `scan`（打开标签页面后）：25 个，全部有图标。同一个块出现多次（日记和标签页面各一份）。标签页面中块的类名为 `orca-block orca-query-list-block-block`，点击和改状态正常。
- `disposed`：`leftovers: 0`。

界面观察：
- 图标的位置、大小、文字对齐正常。
- 菜单弹在图标旁边，光标没有跳进文字。改状态后图标和标签值同步变化。
- 镜像块的源块和镜像块都显示新状态。
- 文字输入不受影响。打开任务属性面板的占位会弹出通知，Esc 能关闭菜单。
- 放弃后图标和任务标签都消失了。
- 在标签页面中，图标正常显示，点击正常。
- `dispose` 之后图标全部消失。
