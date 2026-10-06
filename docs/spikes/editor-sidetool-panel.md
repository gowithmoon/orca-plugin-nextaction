# 技术验证：编辑器工具按钮打开插件面板并对半分

> Issue #7。2026-10-06 在测试笔记库中运行（Windows）。状态：**第四轮验证进行中**（覆盖相邻面板的恢复）。

## 问题

- `registerEditorSidetool` 注册的按钮显示在哪里
- 点击后，用 `registerPanel` 注册的面板能否通过 `nav.addTo` 打开在当前面板旁边，并用 `nav.changeSizes` 对半分
- 再次点击时，能否找到已经打开的插件面板并关闭它，而不是重复打开
- 面板组件收到的 props
- 停用插件时，已经打开的插件面板会怎样，应当如何清理

## 结论

### 编辑器工具按钮

- 按钮显示在编辑器右侧的工具栏里，排在 Orca 自带按钮（目录、引用、同标签、候选引用、AI 助手、块图谱、思维导图）的下面。日记和普通页面中都有（界面已确认）。
- `render(rootBlockId, panelId)` 拿到的是当前编辑器的根块 ID 和面板 ID。每个编辑器面板各渲染一个按钮，所以点击时知道是从哪个面板发起的。
- 按钮的样式沿用 Orca 的 `orca-block-editor-sidetools-btn` 类，加上 `orca.components.Tooltip` 和 `Button`（variant 为 `plain`），外观与自带按钮一致。

### 打开面板

- `orca.nav.addTo(panelId, "right", { view, viewArgs, viewState })` 会在发起面板的右侧插入插件面板，并返回新面板的 ID。新面板一打开就是活动面板（`active: true`）。
- **`addTo` 会把同一行里的所有面板重新均分。** 原来只有一个面板时，两个面板各占 0.5，正好是对半分。原来已有两个面板时，三个面板各占 1/3。
- 面板宽度是比例（0.5、0.333…），不是像素。文档示例里的 `[300, 700]` 与实际不符。

### 调整宽度（`changeSizes`）

- **只传一部分值会把其余面板压成 0。** 第一轮代码在三个面板时调用 `changeSizes(发起面板, [1/3, 1/3])`，结果没被传值的那个面板宽度变成了 0。三次都是这样。用户看到的"最右边的面板被压缩"就是这个原因，是测试代码造成的，不是 Orca 的默认行为。
- 传入这一行**所有**面板的完整宽度数组时，结果与传入的完全一致。`startPanelId` 传的是发起面板，无论它在这一行的第几个位置都成立（第二轮，五次全部 `ok`）。第一轮的"从第一个面板开始应用"是只传了部分值造成的误判。
- 宽度会先按 `addTo` 均分，再变成 `changeSizes` 的值，用户能看到一次跳变（第二轮，界面已确认）。
- 结论：调用 `changeSizes` 时，必须传入这一行所有面板的宽度。

### 面板组件

- 组件收到的 props 是 `{ panelId, active, ...viewArgs }`：`viewArgs` 会被展开成 props（这次的 `from` 就来自 `viewArgs`）。
- 面板里的文字默认不能用鼠标选中复制。给容器加上 `user-select: text` 后就可以了（第二轮，界面已确认）。

### 找到并关闭面板

- 遍历 `orca.state.panels`，找 `view` 等于插件面板类型的叶子面板，就能找到已打开的插件面板；`orca.nav.close(id)` 可以关闭它（第一轮的 `click-close`、`leftovers-closed`）。
- 从别的面板点按钮时，关闭的是在其他位置打开的那个插件面板。点按钮时插件面板已在别处打开，该关闭还是移过来，是第四步的交互设计问题。
- `orca.state.panels` 里块面板的 `viewState` 带有 DOM 元素，不能用 `JSON.stringify` 序列化，也不能深拷贝（第一轮多次报 `Converting circular structure to JSON`）。

### 覆盖相邻面板（第三轮）

- `orca.nav.replace(插件面板类型, viewArgs, 相邻面板ID)` 能把相邻面板的内容换成插件面板，面板 ID 和宽度都不变，当前面板仍是发起面板，不产生后退历史（第三轮 `open-cover`）。
- **恢复时 Orca 崩溃了。** 第三轮把被覆盖面板的 `viewArgs` 用 `JSON` 深拷贝存起来。日记面板的 `viewArgs.date` 原本是 `Date`，拷贝后变成了 ISO 字符串。恢复时把这个字符串传给 `replace("journal", …)`，Orca 渲染日记标题时报 `RangeError: Invalid time value`（`getJournalViewText`），整个界面崩溃，需要重启（用户三次复现：两次点按钮恢复、一次 `dispose` 恢复）。重启后布局正常，没有留下损坏的面板。
- 所以**传给 Orca 导航 API 的 `viewArgs` 必须保持原有的值类型**。插件不认识的视图类型，它的 `viewArgs` 里有哪些字段、是什么类型都不知道，无法保证恢复正确。一旦传错，后果是整个 Orca 崩溃，而不只是插件出错。
- **Orca 的后退对被覆盖的面板无效。** `replace` 不产生历史，插件面板里的后退按钮是灰的，点了没有反应（界面已确认）。
- **用 Orca 自己的方式关闭插件面板（快捷键），会把整个面板关掉。** 被覆盖的日记也随之消失，这一行只剩下发起面板（界面已确认，`panel-gone`）。插件管不到这个操作，被覆盖的内容就这样丢了。

### 停用插件时

- `unregisterPanel` 和 `unregisterEditorSidetool` 之后，按钮消失，面板渲染器也被移除。**但已打开的插件面板仍然留在 `orca.state.panels` 里，界面上没有任何变化**（界面已确认）。
- 所以插件卸载时必须自己关闭所有打开着的插件面板，然后再注销面板类型。按这个顺序执行后，没有残留（第二轮 `disposed`：`remaining: []`）。

### 未验证

- 插件面板开着时重启 Orca，面板布局会不会被保存下来；插件被停用的状态下重启，那个面板会显示成什么。这需要真正安装的插件才能测，移交 #12（会用到临时插件）。

## 待补测

| | 问题 | 状态 |
|---|---|---|
| S | `changeSizes` 传入完整宽度数组时的表现；只把发起面板对半分是否可行 | 已解决（第二轮）：可行，但用户改为选择"覆盖相邻面板" |
| C | 覆盖相邻面板：用 `nav.replace` 替换相邻面板的视图，关闭时恢复原视图；用户用 Orca 自己的方式关闭或后退时的表现 | 第三轮：覆盖可行；恢复时因 `Date` 被转成字符串而崩溃；后退无效；Orca 关闭会连同被覆盖的内容一起关掉 |
| C2 | 恢复时保留原值类型（不做 JSON 拷贝，字符串日期转回 `Date`）能否正常恢复；滚动位置是否保留；只覆盖 `block`、`journal` 两种视图 | 第四轮 |
| P | 插件面板开着时重启 Orca 的表现 | 移交 #12 |

## 对后续步骤的影响

**第一步 #3：注册表**
- 面板的便捷方法在释放时，要先关闭所有 `view` 为该面板类型的已打开面板，再调用 `unregisterPanel`。只注销不关闭，面板会一直留在界面上。如果插件面板是覆盖相邻面板打开的，释放时要恢复被覆盖面板的原内容，而不是直接关闭（第三轮确认写法）。

**第四步：插件面板入口（用户已决定）**
- 用 `registerEditorSidetool` 注册按钮，样式沿用 Orca 自带按钮的类。
- **全局最多只有一个插件面板。** 插件面板已经打开时，从任何面板点按钮都是关闭它（用户决定，2026-10-06）。查找已打开的插件面板，靠遍历 `orca.state.panels`。
- **打开位置（用户决定，2026-10-06）**：
  - 这一行只有发起面板时，用 `addTo(发起面板, "right", …)` 在右侧打开，自动对半分。
  - 这一行已经有两个及以上面板时，不新增面板，而是让插件面板覆盖与发起面板相邻的面板：在左边面板点击，就覆盖右边的；在最右边的面板点击，就覆盖左边的。理由是插件面板太窄会影响可用性。关闭插件面板时，被覆盖的面板恢复原来的内容。
  - 覆盖用 `nav.replace`。被覆盖面板的 `view` 和 `viewArgs` 存进插件面板的 `viewArgs`，恢复时原样传回。**存取时都要保持值的原始类型，不做 JSON 序列化**；日记的 `date` 如果已经变成字符串，要转回 `Date` 再传（第三轮崩溃，第四轮确认写法）。
  - 只覆盖 `block` 和 `journal` 两种视图。相邻面板是别的视图（例如其他插件的面板）时，改为用 `addTo` 在发起面板右侧新开，以免恢复时传错参数导致 Orca 崩溃（第四轮确认）。
  - 用户用 Orca 自己的方式关闭插件面板时，被覆盖的内容会一起关掉，插件无法阻止。这是选择"覆盖"方案要付出的代价。
- 调用 `changeSizes` 时，必须传入这一行所有面板的宽度。
- 面板组件通过 `viewArgs` 传参，参数会以 props 的形式出现。
- 视图中需要让用户复制的文字（例如任务标题），要显式允许文字选择。

**所有步骤**
- 不要序列化或深拷贝 `orca.state.panels`。

## 验证代码（第一轮）

在控制台运行，然后在界面上点击按钮；最后依次运行 `__naSpike7.unregister()` 和 `__naSpike7.closeLeftovers()`。

```js
(() => {
  const React = window.React;
  const VIEW = "orca-plugin-nextaction.spikePanel";
  const TOOL = "orca-plugin-nextaction.spikeSidetool";
  const S = window.__naSpike7 = { events: [] };
  const log = (type, data) => { S.events.push({ t: new Date().toISOString(), type, data }); console.log("[NA7]", type, data); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = (x) => { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return String(e); } };
  const safe = (props) => {
    try { return JSON.parse(JSON.stringify(props, (k, v) => typeof v === "function" ? "[function]" : v)); }
    catch { return { keys: Object.keys(props ?? {}) }; }
  };
  const findMine = () => {
    const out = [];
    const walk = (p) => { if (!p) return; if (Array.isArray(p.children)) p.children.forEach(walk); else if (p.view === VIEW) out.push(p); };
    walk(orca.state.panels);
    return out.map((p) => snap(p));
  };
  const locate = (id) => {
    let found = null;
    const walk = (p, parent) => { if (!p) return; if (p.id === id) found = { panel: snap(p), parent: parent && { id: parent.id, direction: parent.direction, childIds: parent.children.map((c) => c.id), childSizes: parent.children.map((c) => ({ id: c.id, width: c.width, height: c.height })) } };
      if (Array.isArray(p.children)) p.children.forEach((c) => walk(c, p)); };
    walk(orca.state.panels, null);
    return found;
  };

  try { orca.editorSidetools.unregisterEditorSidetool(TOOL); } catch {}
  try { orca.panels.unregisterPanel(VIEW); } catch {}

  function SpikePanel(props) {
    React.useEffect(() => { log("panel-mounted", safe(props)); return () => log("panel-unmounted", {}); }, []);
    return React.createElement("div", { style: { padding: 16, overflow: "auto", height: "100%" } },
      React.createElement("h3", null, "NA 验证面板"),
      React.createElement("p", null, "这是 #7 的测试面板。"),
      React.createElement("pre", { style: { whiteSpace: "pre-wrap", fontSize: 12 } }, JSON.stringify(safe(props), null, 2)));
  }
  orca.panels.registerPanel(VIEW, SpikePanel);

  let busy = false, renderLogged = false;
  async function toggle(panelId) {
    if (busy) return; busy = true;
    try {
      const mine = findMine();
      if (mine.length) {
        log("click-close", { from: panelId, closing: mine.map((p) => p.id) });
        orca.nav.close(mine[0].id);
        await sleep(300);
        log("after-close", { remaining: findMine().map((p) => p.id), panels: snap(orca.state.panels) });
        return;
      }
      const before = snap(orca.state.panels);
      const newId = orca.nav.addTo(panelId, "right", { view: VIEW, viewArgs: { from: panelId }, viewState: {} });
      await sleep(400);
      const src = locate(panelId), mineLoc = locate(newId);
      log("click-open", { from: panelId, newId, before, after: snap(orca.state.panels), src, mine: mineLoc });
      const sizes = src?.parent?.childSizes ?? [];
      const w1 = sizes.find((c) => c.id === panelId)?.width, w2 = sizes.find((c) => c.id === newId)?.width;
      if (typeof w1 === "number" && typeof w2 === "number") {
        const half = (w1 + w2) / 2;
        try { orca.nav.changeSizes(panelId, [half, half]); log("changeSizes", { values: [half, half] }); }
        catch (e) { log("changeSizes-error", String(e)); }
        await sleep(400);
        log("after-changeSizes", { src: locate(panelId), mine: locate(newId) });
      } else {
        log("changeSizes-skipped", { reason: "宽度不是数字", w1, w2 });
      }
    } catch (e) { log("toggle-error", String(e?.stack ?? e)); }
    finally { busy = false; }
  }

  orca.editorSidetools.registerEditorSidetool(TOOL, {
    render: (rootBlockId, panelId) => {
      if (!renderLogged) { renderLogged = true; log("sidetool-render", { rootBlockId, panelId }); }
      return React.createElement(orca.components.Tooltip, { text: "NA 验证：打开/关闭面板", placement: "horizontal" },
        React.createElement(orca.components.Button, {
          className: "orca-block-editor-sidetools-btn", variant: "plain",
          onClick: () => toggle(panelId),
        }, React.createElement("i", { className: "ti ti-checklist" })));
    },
  });

  S.unregister = async () => {
    const openBefore = findMine().map((p) => p.id);
    orca.editorSidetools.unregisterEditorSidetool(TOOL);
    orca.panels.unregisterPanel(VIEW);
    await sleep(500);
    log("unregistered-while-open", { openBefore, stillInPanels: findMine().map((p) => p.id),
      toolStillInState: !!orca.state.editorSidetools?.[TOOL], panelRendererStill: !!orca.state.panelRenderers?.[VIEW] });
  };
  S.closeLeftovers = async () => {
    for (const p of findMine()) orca.nav.close(p.id);
    await sleep(300);
    log("leftovers-closed", { remaining: findMine().map((p) => p.id) });
    const out = JSON.stringify(S, (k, v) => typeof v === "function" ? undefined : v, 2);
    try { copy(out); console.log("✅ 完整结果已复制到剪贴板"); } catch { console.log(out); }
  };

  log("registered", { toolInState: !!orca.state.editorSidetools?.[TOOL], panelRenderer: !!orca.state.panelRenderers?.[VIEW] });
  console.log("✅ 已注册。请到编辑器里找一个清单图标（ti-checklist）的按钮");
})();
```

## 实际返回（第一轮摘录）

- `registered`：`toolInState: true`，`panelRenderer: true`。
- `sidetool-render`：`{ rootBlockId: 211, panelId: "G7w4jtrtJJ" }`。
- `panel-mounted` 的 props：`{ panelId: "DIvzkAT9fA", from: "G7w4jtrtJJ", active: true }`。
- 只有一个面板时打开：
  - 之前：一行里只有 `G7w4jtrtJJ`，没有 `width`
  - 之后：`G7w4jtrtJJ` 0.5、`DIvzkAT9fA` 0.5
  - `changeSizes([0.5, 0.5])` 之后不变
- 已有两个面板时打开（三次）：`addTo` 之后三个面板各为 0.333…，新面板插在发起面板的右边。`changeSizes(发起面板, [1/3, 1/3])` 之后：
  - 从第一个面板 `G7w4jtrtJJ` 发起：`[G7w4 1/3, 新 1/3, 5eKk 0]`
  - 从第二个面板 `5eKk0bhiPC` 发起：`[G7w4 1/3, 5eKk 1/3, 新 0]`
  - 从第二个面板 `K6lWEyZnqh` 发起：`[G7w4 1/3, K6lW 1/3, 新 0]`
- `click-close` 之后 `remaining: []`。
- `unregistered-while-open`：`openBefore: ["REDSO9ARfD"]`，`stillInPanels: ["REDSO9ARfD"]`，`toolStillInState: false`，`panelRendererStill: false`。
- `leftovers-closed`：`remaining: []`。
- 从第二次打开起，`before`、`after` 快照都报 `Converting circular structure to JSON`，来源是 `HTMLDivElement`。

界面观察：
- 按钮位于编辑器右侧，在 Orca 自带按钮的下面，日记和页面中都有。
- 只有一个面板时，插件面板在右侧打开，占一半。已有两个面板时，插件面板是第三个，最右边的面板被压得很窄（原因见"调整宽度"）。
- 面板中显示 `panelId`、`from`、`active` 三个值，文字无法选中复制。
- 注销之后，打开着的面板在界面上没有变化。
