# 技术验证：用 Orca 官方菜单承载任务操作

> 第三步补测。起因：自绘状态图标的点击（捕获阶段监听 + `::before` 命中 + `data-id`）在 Orca 中点击无反应，而且整套依赖内部 DOM。改用官方的 `tagMenuCommands`、`blockMenuCommands` 之前，先确认它们的行为。状态：**待运行**。

## 问题

- T1 在任务块里点击任务标签，标签菜单是否出现插件登记的项；`render` 收到的 `tagBlock`、`tagRef`（尤其 `tagRef.from` 是不是任务块 ID）
- T2 在镜像块、页面标题、标签页面列表里点击任务标签时，`tagRef.from` 是什么（源块还是镜像块）
- T3 打开标签页面后，在标题处的标签菜单里 `tagRef` 是否为 `undefined`（不是"在标签实例上打开"）
- T4 一个 `render` 返回多个 `MenuText`（用 Fragment 包住）能否正常显示；`MenuText` 的 `children` 能否做子菜单
- B1 块手柄的右键菜单里，插件登记的项是否出现；`render` 收到的 `blockId`、`rootBlockId`；在镜像块上右键时 `blockId` 是镜像块还是源块
- B2 选中多个块再右键时，`worksOnMultipleBlocks: false` 的项是否隐藏

## 运行方法

在测试笔记库中操作（需要有几个带插件任务标签的块，含一个镜像块和一个页面任务）：

1. 在控制台运行下面的脚本。
2. 依次做这些操作，每次点到插件的菜单项（标着"NA验证"）后关闭菜单：
   - 在普通任务块里点击任务标签 → 点"NA验证：标签菜单"，再展开"NA验证：子菜单"看看
   - 在镜像块里点击任务标签 → 同上
   - 打开页面任务，在标题处点击任务标签 → 同上
   - 打开任务标签页面，在列表中点击某个任务的标签 → 同上
   - 打开任务标签页面，在页面标题（标签本身）上打开标签菜单 → 看有没有插件项
   - 在普通任务块的手柄上右键 → 点"NA验证：块菜单"
   - 在镜像块的手柄上右键 → 同上
   - 选中两个块再右键 → 看"NA验证：块菜单"是否出现
3. 运行 `__naSpikeM.report()`，结果复制到剪贴板，交回。
4. 运行 `__naSpikeM.dispose()` 注销菜单项。

## 验证代码

```js
(() => {
  const R = { events: [] }; window.__naSpikeM = R;
  const C = orca.components, h = React.createElement;
  const repr = (id) => orca.state.blocks[id]?.properties?.find((p) => p.name === "_repr")?.value?.type;
  const log = (where, data) => { R.events.push({ where, at: new Date().toLocaleTimeString(), ...data }); console.log(where, data); };

  orca.tagMenuCommands.registerTagMenuCommand("na-spike.tag", {
    render: (tagBlock, close, tagRef) => {
      log("tag-render", { tagBlock: tagBlock?.id, tagAliases: tagBlock?.aliases, tagRef: tagRef && { id: tagRef.id, from: tagRef.from, to: tagRef.to, type: tagRef.type, fromRepr: repr(tagRef.from) } });
      return h(React.Fragment, null,
        h(C.MenuText, { title: "NA验证：标签菜单", preIcon: "ti ti-flask", onClick: () => { log("tag-click", { from: tagRef?.from }); close(); } }),
        h(C.MenuText, { title: "NA验证：第二项", onClick: () => { log("tag-click-2", {}); close(); } }),
        h(C.MenuText, { title: "NA验证：子菜单", preIcon: "ti ti-chevron-right",
          children: h(C.Menu, null, h(C.MenuText, { title: "NA验证：子项", onClick: () => { log("tag-sub-click", {}); close(); } })) }),
      );
    },
  });

  for (const multi of [false, true]) {
    orca.blockMenuCommands.registerBlockMenuCommand(`na-spike.block.${multi ? "multi" : "single"}`, {
      worksOnMultipleBlocks: multi,
      render: (ids, rootBlockId, close) => {
        log(`block-render-${multi ? "multi" : "single"}`, { ids, rootBlockId, repr: Array.isArray(ids) ? ids.map(repr) : repr(ids) });
        return h(C.MenuText, { title: `NA验证：块菜单（${multi ? "多块" : "单块"}）`, onClick: () => { log("block-click", { ids }); close(); } });
      },
    });
  }

  R.report = () => {
    const out = JSON.stringify(R.events, null, 2);
    try { copy(out); console.log("✅ 已复制到剪贴板"); } catch { console.log(out); }
  };
  R.dispose = () => {
    orca.tagMenuCommands.unregisterTagMenuCommand("na-spike.tag");
    orca.blockMenuCommands.unregisterBlockMenuCommand("na-spike.block.single");
    orca.blockMenuCommands.unregisterBlockMenuCommand("na-spike.block.multi");
    console.log("disposed");
  };
  console.log("NA spike menus registered");
})();
```

## 结论

2026-10-08 在测试笔记库中运行。镜像块和标签页面的情况待补（见文末）。

### 标签菜单（`tagMenuCommands`）

- **右键点击任务标签才会弹出标签菜单**，插件登记的项出现在其中。左键点击任务标签会跳转到标签页面，这是 Orca 自身的行为（用户观察）。
- `render(tagBlock, close, tagRef)`：`tagBlock` 是任务标签块（26，别名"任务"）；`tagRef` 是这个块上的那条标签引用（`type: 2`，`to` 为任务标签块），**`tagRef.from` 就是带着标签的那个块的 ID**（37、38、40、42 都是如此）。
- 打开的页面任务，在标题处右键点击任务标签也能弹出，`tagRef.from` 为页面块 ID（38）。
- 一个 `render` 用 Fragment 返回多个 `MenuText`，都能显示、能点击；`MenuText` 的 `children` 放一个 `Menu` 可以做成子菜单，子项能点击。
- 每次打开菜单都会调用一次 `render`。

### 块右键菜单（`blockMenuCommands`）

- 在块手柄上右键，插件登记的项出现。`render(blockId, rootBlockId, close)` 的 `blockId` 是右键的块，`rootBlockId` 是面板的根块（日记 25；打开的页面时就是页面自己 38）。
- 只右键一个块时，`worksOnMultipleBlocks: false` 和 `true` 的项**都会**显示（后者收到只有一个元素的数组）。
- 选中多个块再右键时，**只**显示 `worksOnMultipleBlocks: true` 的项。

### 待补

- 镜像块：右键镜像块里的任务标签、镜像块的手柄时，拿到的是镜像块 ID 还是源块 ID（这次的 `repr` 全是 `text`，没法判断哪一次是镜像块）。
- 标签页面：在列表中右键任务标签、在标签页面标题上打开标签菜单时，插件项是否出现、`tagRef` 是什么。

## 对后续步骤的影响

- 任务操作菜单不再依赖 DOM：入口是右键任务标签（`tagRef.from`）和块手柄右键菜单（`blockId`），两者都先把镜像块解析成源块（仓储入口已经这样做）。
- 只登记 `worksOnMultipleBlocks: false` 的块菜单项：多选时自然不出现。
- 状态图标只负责显示，不再拦截点击。
