# 技术验证：插件块属性中存储 JSON

> Issue #6。2026-10-06 在测试笔记库中运行（Windows，时区 UTC+8）。共两轮。状态：**已完成**。

## 问题

- 用 `core.editor.setProperties` 写入 JSON 类型（`PropType` 0）的值，读回后的结构
- 属性名 `nextaction.xxx`（含点）是否允许
- 复制块、移动块、镜像块时，块属性是否随之复制、移动、共享
- 用户在 Orca 界面中能否看到或修改这些属性
- 删除块属性的方式

## 结论

### 读写

- JSON 类型（type 0）可以存对象、数组、数字、字符串，读回的值与写入的完全一致，后端和 `orca.state.blocks` 中的结果也一致（J1）。
- 属性名可以带点：`nextaction.history` 这类名字能正常写入、读取和删除（J1、J7）。
- 写入后 `pos` 和 `typeArgs` 都是 `null`。读回的属性按名称排序，与写入顺序无关（J1）。
- 写入同名属性是整体覆盖，值的形状也可以改变，例如从数字变成对象（J2）。
- 写入 15 KB 的值（300 条完成历史）耗时 30 ms，读回完整（J3）。更大的数据量没有测：按每条约 50 字节估算，一个每日重复任务十年约 180 KB。是否给完成历史设上限，留到第九步再定。
- `setProperties` 没有返回值。

### 界面可见性

- 在 Orca 界面的任何地方都看不到这些属性（界面已确认）。所以用户无法手动查看、修改或清理它们，这些属性只能由插件管理。

### 与任务标签的关系

- 打标签、移除标签都不影响块属性（J4）。
- **放弃（`removeTag`）之后，`nextaction.*` 属性仍然留在块上。** 以后再给这个块打上任务标签，旧的完成历史和我的一天记录会重新生效。
- 用户在 Orca 界面中直接移除任务标签，应该也是同样的结果（推测：界面操作与 `removeTag` 应是同一个操作，没有单独验证）。

### 复制与移动

- `copyBlocks` 返回新块对象组成的数组，不是 ID 数组。副本带着全部 `nextaction.*` 属性，也带着任务标签和标签属性值（状态、重要性）。它是一个新任务，块 ID 和标签引用 ID 都是新的（J5）。所以复制一个任务时，它的完成历史和我的一天记录也会被一起复制。
- `moveBlocks` 之后，块 ID 不变，属性全部保留（J6）。

### 删除属性

- `deleteProperties` 按名字删除，带点的名字可以正常删除，其余属性不受影响（J7）。

### 镜像块

- 用户在界面上用"复制块 → 在新块中粘贴 → 选择镜像"建镜像块。这次复制的是副本 241，所以镜像的源块是 241，不是 240。第一轮代码去查 240 的 `backRefs`，所以没有找到镜像块（第二轮 M0）。
- 镜像块是一个独立的块（242），有自己的父块，`content` 为空，`text` 为 `"\n"`。它只有一个属性 `_repr: { type: "mirror", mirroredId: 241 }`，另有一条 `type` 为 5 的引用指向源块（第二轮 M1）。它没有自己的任务标签，也没有 `nextaction.*` 属性。界面上显示的内容与源块完全一致（界面已确认）。
- 按任务标签查询时，只返回源块，不返回镜像块（第二轮 M2）。
- **用镜像块的 ID 写入，数据会落在镜像块自己身上，不会写到源块。**
  - `setProperties` 写的属性只出现在镜像块上（M3）。
  - `insertTag` 会给镜像块本身打上一个任务标签，状态为"待开始"。之后镜像块也会出现在按标签查询的结果里。但界面上源块和镜像块都仍显示"收集箱"，也就是源块的值（M4，界面已确认）。结果是镜像块上多了一份界面看不到、与源块不一致的任务数据。
- 源块 241 的 `backRefs` 里有没有这条镜像引用，这次没有直接读取，未经验证。

## 待补测

| | 问题 | 状态 |
|---|---|---|
| M | 镜像块本身的结构；通过镜像块 ID 写入的属性落在哪个块上；按任务标签查询时，返回的是源块还是镜像块 | 已解决（第二轮） |

## 对后续步骤的影响

**第二步：仓储与编解码**
- ADR 0001 的存储方案可行：插件的内部数据存为带 `nextaction.` 前缀的 JSON 块属性。
- 每个属性的值都带上版本号（`{ v: 1, ... }`），与 `docs/ARCHITECTURE.md` 第 4 节"带版本号的编解码"的要求一致。
- 插件只读取带有任务标签的块上的 `nextaction.*` 属性。
- **所有接收块 ID 的入口，都要先把镜像块解析成源块，再做读写。** 这些入口包括命令、光标所在的块、点击的块、状态图标所在的块。解析方法是：`_repr.type === "mirror"` 时，改用 `mirroredId`（`vendor/orca-simple-task` 中的 `getMirrorId` 也是这样做的）。这一步放在 `infra` 的仓储入口中统一处理，上层只接触源块的 ID。否则数据会悄悄写到镜像块上（第二轮 M3、M4）。
- 按任务标签的查询不会返回镜像块，所以查询结果不需要去重。

**第三步：放弃**
- 插件执行放弃时，要在同一个 `invokeGroup` 中移除任务标签，并删除全部 `nextaction.*` 属性。这样才符合 `GLOSSARY.md` 对"放弃"的定义（丢弃任务数据），用户也能一次撤销。
- 用户绕过插件，直接在 Orca 里移除标签时，`nextaction.*` 属性会残留在块上。之后重新打上标签时，这些残留数据是保留还是清除，留到第三步讨论。

**第八、九步：复制出来的任务**
- 复制任务时，完成历史和我的一天记录会被一起复制。副本是一个新任务，这些数据该不该继承，分别在第八步（我的一天）和第九步（重复任务）讨论。

## 验证代码（第一轮）

第一段在控制台运行；然后在界面上建一个"NA属性测试P"的镜像块；再运行第二段。

```js
(async () => {
  const TAG = "NA验证标签改名";
  const R = { steps: {}, ids: {} }; window.__naSpike6 = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const props = (b) => b?.properties?.map((p) => ({ name: p.name, type: p.type, pos: p.pos, typeArgs: p.typeArgs, value: p.value }));
  const brief = (b) => b && ({ id: b.id, parent: b.parent, text: b.text, properties: props(b),
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type })) });
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };
  const blockObj = async (id) => orca.state.blocks[id] ?? await get(id);
  const child = async (parentId, text) =>
    ed("core.editor.insertBlock", await blockObj(parentId), "lastChild", [{ t: "t", v: text }]);

  const journal = await orca.invokeBackend("get-journal-block", new Date("2026-11-03T09:00:00"));
  const box = await child(journal.id, "NA验证容器（#6）");
  const box2 = await child(journal.id, "NA验证容器（#6 移动目标）");
  Object.assign(R.ids, { journal: journal.id, box, box2 });

  const history = { v: 1, items: [{ at: "2026-10-06T08:00:00.000Z", status: "done" }] };

  await step("J1_写入", async () => {
    const p = await child(box, "NA属性测试P"); R.ids.p = p;
    const ret = await ed("core.editor.setProperties", [p], [
      { name: "nextaction.history", type: 0, value: history },
      { name: "nextaction.myday", type: 0, value: { v: 1, day: "2026-10-06", slot: null } },
      { name: "nextaction.num", type: 0, value: 42 },
      { name: "nextaction.str", type: 0, value: "hello" },
      { name: "nextaction.arr", type: 0, value: [1, "a", null, { x: true }] },
    ]);
    const b = await get(p);
    return { ret, backend: props(b), state: props(orca.state.blocks[p]),
      roundTripEqual: JSON.stringify(b.properties.find((x) => x.name === "nextaction.history")?.value) === JSON.stringify(history) };
  });

  await step("J2_覆盖", async () => {
    await ed("core.editor.setProperties", [R.ids.p], [{ name: "nextaction.num", type: 0, value: { replaced: true } }]);
    return (await get(R.ids.p)).properties.find((x) => x.name === "nextaction.num");
  });

  await step("J3_大数据", async () => {
    const big = { v: 1, items: Array.from({ length: 300 }, (_, i) => ({ at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), status: "done" })) };
    const t0 = performance.now();
    await ed("core.editor.setProperties", [R.ids.p], [{ name: "nextaction.big", type: 0, value: big }]);
    const t1 = performance.now();
    const v = (await get(R.ids.p)).properties.find((x) => x.name === "nextaction.big")?.value;
    return { bytes: JSON.stringify(big).length, writeMs: Math.round(t1 - t0), readBackCount: v?.items?.length };
  });

  await step("J4_与任务标签共存", async () => {
    await ed("core.editor.insertTag", R.ids.p, TAG);
    const tagged = props(await get(R.ids.p)).map((x) => x.name);
    await ed("core.editor.removeTag", R.ids.p, TAG);
    const untagged = props(await get(R.ids.p)).map((x) => x.name);
    await ed("core.editor.insertTag", R.ids.p, TAG);
    return { tagged, untagged, text: (await get(R.ids.p)).text };
  });

  await step("J5_复制", async () => {
    const ret = await ed("core.editor.copyBlocks", [R.ids.p], R.ids.p, "after");
    await sleep(500);
    const boxB = await get(box);
    const copyId = boxB.children.find((id) => id !== R.ids.p);
    R.ids.copy = copyId;
    return { ret, copyId, copy: brief(await get(copyId)) };
  });

  await step("J6_移动", async () => {
    await ed("core.editor.moveBlocks", [R.ids.p], box2, "lastChild");
    await sleep(500);
    const b = await get(R.ids.p);
    return { id: b.id, parent: b.parent, names: props(b).map((x) => x.name) };
  });

  await step("J7_删除属性", async () => {
    await ed("core.editor.deleteProperties", [R.ids.copy], ["nextaction.num", "nextaction.big"]);
    return props(await get(R.ids.copy)).map((x) => x.name);
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 第一段完成，块 P 的 ID：" + R.ids.p); } catch { console.log(out); }
  console.log(R);
})();
```

```js
(async () => {
  const R = window.__naSpike6;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const props = (b) => b?.properties?.map((p) => ({ name: p.name, type: p.type, value: p.value }));
  const p = await get(R.ids.p);
  const mirrorIds = (p.backRefs ?? []).filter((r) => r.type === 5).map((r) => r.from);
  const res = { mirrorIds, sourceBackRefs: p.backRefs?.map((r) => ({ id: r.id, from: r.from, type: r.type })) };
  if (mirrorIds.length) {
    const m = await get(mirrorIds[0]);
    res.mirror = { id: m.id, parent: m.parent, text: m.text, properties: props(m) };
    await ed("core.editor.setProperties", [m.id], [{ name: "nextaction.viaMirror", type: 0, value: { ok: 1 } }]);
    await sleep(500);
    res.afterWriteViaMirror = {
      mirror: props(await get(m.id)).map((x) => x.name),
      source: props(await get(R.ids.p)).map((x) => x.name),
    };
  }
  R.steps.镜像 = res;
  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 完整结果已复制到剪贴板"); } catch { console.log(out); }
})();
```

## 实际返回（第一轮摘录）

生成的块：日记 219 下的容器 238（#6）和 239（移动目标）；P 240；P 的副本 241。

- J1：五个 `nextaction.*` 属性的 `type` 都是 0，`pos` 和 `typeArgs` 都是 `null`，值与写入的一致。后端和 state 的结果相同，`roundTripEqual: true`。返回顺序为 arr、history、myday、num、str（按名称排序；写入顺序是 history、myday、num、str、arr）。
- J2：`nextaction.num` 的值从 `42` 变为 `{ "replaced": true }`。
- J3：`bytes: 15017`，`writeMs: 30`，`readBackCount: 300`。
- J4：
  - 打标签后：`_tags`、`_repr` 加上全部 `nextaction.*`
  - 移除标签后：`_repr` 加上全部 `nextaction.*`，只少了 `_tags`
  - 重新打标签后：`text` 为 `NA属性测试P #NA验证标签改名,收集箱,4`
- J5：`copyBlocks` 返回 `[ { id: 241, parent: 238, … } ]`，是完整的块对象。副本带有全部 `nextaction.*`（包括 300 条的 `nextaction.big`），标签引用为 `{ id: 228, to: 211, type: 2 }`，`data` 为 `状态 = 收集箱`、`重要性 = 4`。
- J6：`{ id: 240, parent: 239 }`，属性名列表不变。
- J7：副本删除 `nextaction.num` 和 `nextaction.big` 后，剩下 `_tags`、`_repr`、`nextaction.arr`、`nextaction.history`、`nextaction.myday`、`nextaction.str`。
- 镜像：`mirrorIds: []`，`sourceBackRefs: []`。

界面观察：
- 在任何地方都看不到 `nextaction.*` 属性。
- 镜像块的建法：复制 P，新建一个块并粘贴，在弹出的选项中选择"镜像"。


## 验证代码（第二轮）

```js
(async () => {
  const TAG = "NA验证标签改名";
  const R = { steps: {} }; window.__naSpike6b = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const full = (b) => b && ({
    id: b.id, parent: b.parent, children: b.children, content: b.content, text: b.text,
    properties: b.properties?.map((p) => ({ name: p.name, type: p.type, value: p.value })),
    refs: b.refs?.map((r) => ({ id: r.id, from: r.from, to: r.to, type: r.type, alias: r.alias,
      data: r.data?.map((d) => ({ name: d.name, value: d.value })) })),
    backRefs: b.backRefs?.map((r) => ({ id: r.id, from: r.from, to: r.to, type: r.type })),
  });
  const names = (b) => b?.properties?.map((p) => p.name);
  const reprOf = (b) => b?.properties?.find((p) => p.name === "_repr")?.value;
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };
  const ids = window.__naSpike6?.ids ?? { box: 238, box2: 239, p: 240 };
  const tagId = (await orca.invokeBackend("get-blockid-by-alias", TAG))?.id;
  const byTag = () => orca.invokeBackend("query", { q: { kind: 100, conditions: [{ kind: 4, name: TAG }] } });

  let mirrorId;
  await step("M0_容器子块", async () => {
    const list = [];
    for (const c of [ids.box, ids.box2]) {
      for (const id of (await get(c))?.children ?? []) {
        const x = await get(id);
        list.push({ container: c, id, repr: reprOf(x), text: x?.text });
      }
    }
    mirrorId = list.find((x) => x.repr?.type === "mirror")?.id;
    return list;
  });
  if (!mirrorId) { console.warn("没有找到镜像块"); try { copy(JSON.stringify(R, null, 2)); } catch {} return; }
  R.ids = { ...ids, mirror: mirrorId };

  await step("M1_结构", async () => ({
    mirror: full(await get(mirrorId)),
    mirrorInState: full(orca.state.blocks[mirrorId]),
    source: full(await get(ids.p)),
  }));

  await step("M2_按标签查询", async () => {
    const r = await byTag();
    return { hasSource: r.includes(ids.p), hasMirror: r.includes(mirrorId) };
  });

  await step("M3_经镜像写块属性", async () => {
    await ed("core.editor.setProperties", [mirrorId], [{ name: "nextaction.viaMirror", type: 0, value: { ok: 1 } }]);
    await sleep(500);
    return { mirror: names(await get(mirrorId)), source: names(await get(ids.p)) };
  });

  await step("M4_经镜像改状态", async () => {
    await ed("core.editor.insertTag", mirrorId, TAG, [{ name: "状态", value: "待开始" }]);
    await sleep(500);
    const st = (b) => b?.refs?.find((r) => r.type === 2 && r.to === tagId)?.data?.find((d) => d.name === "状态")?.value ?? "（无任务标签）";
    const r = await byTag();
    return { sourceStatus: st(await get(ids.p)), mirrorStatus: st(await get(mirrorId)),
      mirrorText: (await get(mirrorId))?.text, hasMirrorInQuery: r.includes(mirrorId) };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 结果已复制到剪贴板"); } catch { console.log(out); }
  console.log(R);
})();
```

## 实际返回（第二轮摘录）

注意：本轮代码把 `ids.p`（240）当作源块，但镜像块的源块其实是 241。所以 M1 中的 `source`，以及 M3、M4 中的 `source*` 字段，读的都是 240，不是镜像块真正的源块。

- M0，容器子块：
  - 238 下：241（text，副本）、242（`{ type: "mirror", mirroredId: 241 }`，`text: "\n"`）
  - 239 下：240（text）
- M1，镜像块 242：
  ```json
  { "id": 242, "parent": 238, "children": [], "text": "\n",
    "properties": [ { "name": "_repr", "value": { "type": "mirror", "mirroredId": 241 } } ],
    "refs": [ { "id": 229, "from": 242, "to": 241, "type": 5, "alias": null, "data": [] } ],
    "backRefs": [] }
  ```
  后端和 state 的结果相同。
- M2：`hasSource`（240）为 `true`，`hasMirror` 为 `false`。
- M3：经镜像写入后，242 的属性为 `["_repr", "nextaction.viaMirror"]`，240 不受影响。
- M4：经镜像 `insertTag` 后，`mirrorStatus: "待开始"`，`hasMirrorInQuery: true`，`mirrorText: "NA属性测试P #NA验证标签改名,收集箱,4\n"`。

界面观察：运行后，源块和镜像块的状态都显示为"收集箱"。
