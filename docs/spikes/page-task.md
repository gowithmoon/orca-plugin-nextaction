# 技术验证：页面任务、根级块的查询条件与英文属性名的 `data-` 形态

> 第三步补测（ADR 0013）。2026-10-08 在测试笔记库中运行。状态：**已完成**（标题处图标的点击留到实现后手动检查）。

## 问题

- P1 页面和日记块是不是根级块（`parent` 为 `null`）；用户在界面上新建的页面是否也是
- P2 任务查询把 `{ kind: 9, hasParent: true }` 换成 OR 组"有父块或有别名"后：能命中页面任务和普通任务，排除日记块和没有别名的根级块
- P3 页面打开时，标题处的任务标签在 DOM 中的位置；#8 的图标选择器能否覆盖到，图标能否显示
- P4 英文属性名（`Status`，以及含空格和大写的 `My Prop`）在 `.orca-tag` 上变成什么 `data-` 属性名（#8 遗留）

## 运行方法

在测试笔记库中操作：

1. 先在界面上手动新建一个页面，标题（别名）填 `NA界面页面`。
2. 在控制台运行下面的脚本。脚本会打开测试页面，结果复制到剪贴板。
3. 看一下打开的页面：标题旁边、子块前面有没有红色圆点（测试图标）。把看到的情况连同结果一起交回。
4. 运行 `__naSpikeP.dispose()` 移除测试样式。测试块留在笔记库里，可手动删除。

## 验证代码

```js
(async () => {
  const ZH = "NA验证页面任务", EN = "NAVerifyEn";
  const R = { steps: {}, ids: {} }; window.__naSpikeP = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const aliasId = async (name) => (await orca.invokeBackend("get-blockid-by-alias", name))?.id;
  const reprOf = (b) => b?.properties?.find((p) => p.name === "_repr")?.value;
  const info = (b) => b && { id: b.id, parent: b.parent ?? null, aliases: b.aliases, repr: reprOf(b)?.type };
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };
  const ensureTag = async (name, props) => {
    let id = await aliasId(name);
    if (!id) {
      id = await ed("core.editor.insertBlock", null, null, [{ t: "t", v: name }]);
      await ed("core.editor.createAlias", name, id);
    }
    await ed("core.editor.setProperties", [id], props);
    return id;
  };
  const choices = (names) => ({ subType: "single", choices: names.map((n) => ({ n, c: "" })) });

  await step("P0_准备", async () => {
    R.ids.zhTag = await ensureTag(ZH, [{ name: "状态", type: 6, typeArgs: choices(["收集箱", "进行中"]), pos: 0 }]);
    R.ids.enTag = await ensureTag(EN, [
      { name: "Status", type: 6, typeArgs: choices(["Inbox", "Doing"]), pos: 0 },
      { name: "My Prop", type: 1, pos: 1 },
    ]);
    // 代码建的页面：根级块加别名
    const page = await ed("core.editor.insertBlock", null, null, [{ t: "t", v: "NA代码页面" }]);
    await ed("core.editor.createAlias", "NA代码页面" + Date.now(), page);
    R.ids.page = page;
    const pageBlock = await get(page);
    R.ids.child = await ed("core.editor.insertBlock", pageBlock, "lastChild", [{ t: "t", v: "NA页面下的任务" }]);
    R.ids.enChild = await ed("core.editor.insertBlock", pageBlock, "lastChild", [{ t: "t", v: "NA英文属性" }]);
    R.ids.root = await ed("core.editor.insertBlock", null, null, [{ t: "t", v: "NA无别名根级块" }]);
    R.ids.journal = (await orca.invokeBackend("get-journal-block", new Date(2027, 2, 15)))?.id;
    R.ids.uiPage = await aliasId("NA界面页面");
    for (const k of ["page", "child", "root", "journal", "uiPage"]) {
      if (R.ids[k]) await ed("core.editor.insertTag", R.ids[k], ZH, [{ name: "状态", value: "进行中" }]);
    }
    await ed("core.editor.insertTag", R.ids.enChild, EN, [{ name: "Status", value: "Doing" }, { name: "My Prop", value: "x" }]);
    return R.ids;
  });

  await step("P1_根级块", async () => {
    const out = {};
    for (const k of ["page", "child", "root", "journal", "uiPage"]) out[k] = R.ids[k] ? info(await get(R.ids[k])) : "不存在";
    return out;
  });

  await step("P2_查询", async () => {
    const tag = { kind: 4, name: ZH };
    const run = async (extra) => {
      const r = await orca.invokeBackend("query", { q: { kind: 100, conditions: [tag, ...extra] }, pageSize: 1000 });
      return Array.isArray(r) ? r : { notArray: r };
    };
    const named = (ids) => Array.isArray(ids)
      ? ids.map((id) => Object.entries(R.ids).find(([, v]) => v === id)?.[0] ?? id) : ids;
    return {
      onlyTag: named(await run([])),
      hasParent: named(await run([{ kind: 9, hasParent: true }])),
      parentOrAlias: named(await run([{ kind: 101, conditions: [{ kind: 9, hasParent: true }, { kind: 9, hasAliases: true }] }])),
    };
  });

  await step("P3_打开页面", async () => {
    orca.nav.goTo("block", { blockId: R.ids.page });
    await sleep(1500);
    const chain = (el) => {
      const out = [];
      for (let e = el; e && out.length < 10; e = e.parentElement) {
        out.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : ""));
      }
      return out;
    };
    return [...document.querySelectorAll(`.orca-tag[data-name="${ZH}" i]`)].map((el) => ({
      attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
      chain: chain(el),
    }));
  });

  await step("P4_英文属性名", async () => {
    return [...document.querySelectorAll(`.orca-tag[data-name="${EN}" i]`)].map((el) =>
      Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])));
  });

  // 测试图标：#8 的三条选择器，红色圆点
  const T = `.orca-tag[data-name="${ZH}" i]`;
  const style = document.createElement("style");
  style.textContent = [
    `.orca-repr-main-content:has(>.orca-tags>${T})::before`,
    `.orca-repr:has(>.orca-repr-card-title>.orca-tags>${T})>.orca-repr-main>.orca-repr-main-content::before`,
    `.orca-query-card-title:has(>.orca-tags>${T}) ~ .orca-block>.orca-repr>.orca-repr-main>.orca-repr-main-content::before`,
  ].join(",\n") + ` { content: "●"; color: red; margin-right: 4px; }`;
  document.head.appendChild(style);
  R.dispose = () => style.remove();

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 结果已复制到剪贴板"); } catch { console.log(out); }
  console.log(R);
})();
```

## 结论

2026-10-08 在测试笔记库中运行。

### 根级块（P1）

- **页面和日记块都没有父块。** 界面新建的页面（29）、代码建的页面（32）、日记（36）、没有别名的根级块（35）的 `parent` 都是 `null`；页面下的子块（33）`parent` 为页面 ID。所以"一切块都有父块"不成立，根级块需要按别名区分。
- 界面新建的页面和代码建的页面在数据上一样：根级、有别名、`_repr.type` 为 `text`。
- **给日记块 `insertTag` 会报错**：`TypeError: Cannot read properties of undefined (reading 'id')`，日记块没有被打上标签（不在 P2 的任何结果里）。日记块是否能在界面上被打标签没有验证；无论如何，按 ADR 0013 它不是任务。

### 查询（P2）

- 只按标签：页面 29、32，子块 33，无别名根级块 35。
- 加 `{ kind: 9, hasParent: true }`：只有子块 33（第二步的规则，页面被排除）。
- **加 OR 组 `{ kind: 101, conditions: [{ kind: 9, hasParent: true }, { kind: 9, hasAliases: true }] }`：页面 29、32 和子块 33，无别名根级块 35 被排除。** ADR 0013 的规则可以直接写进查询。

### 页面标题（P3）

- 打开页面时，标题本身就是页面块的 `.orca-block`，任务标签在 `.orca-repr-main-content.orca-repr-as-alias > .orca-tags` 下，结构与普通块相同，只多一个类名 `orca-repr-as-alias`。
- **#8 的第一条选择器能覆盖标题**：标题旁和页面下任务子块前都显示了测试图标（界面已确认）。`dispose` 后图标消失。
- 标题块渲染了两份，其中一份在 `.orca-hideable-hidden` 中（隐藏的面板），与"同一个块在多处渲染多份 DOM"一致。
- 标题处图标的点击命中没有验证，第三步实现后在 Orca 中手动检查。

### 英文属性名（P4）

- `Status` → `data-status`，`My Prop` → `data-my_prop`：**转小写，空格换成下划线**（不是 `vendor/orca-simple-task` 假设的 `-`）。值保持原样（`Doing`）。
- 本项目写进笔记的英文属性名都是不带空格的单词（ADR 0009），状态属性就是 `data-status`；选择器按"小写、空格换 `_`"生成即可同时覆盖两种语言。

## 对后续步骤的影响

**第三步**
- 编解码：`parent == null && aliases.length === 0` 的块不是任务（ADR 0013）；任务查询把 `{ kind: 9, hasParent: true }` 换成上面的 OR 组。两处同时改，测试一起改。
- 转为任务：拒绝没有父块且没有别名的块（日记块、孤立块）和任务标签块自身，在调用 `insertTag` 之前判断，不依赖 Orca 报错。
- 状态图标：选择器中的状态属性名按"小写、空格换 `_`"生成。页面标题无需额外选择器。
