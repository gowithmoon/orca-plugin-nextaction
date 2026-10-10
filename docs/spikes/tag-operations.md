# 技术验证：打标签、改属性值、改标签名、移除标签

> Issue #5。2026-10-06 在测试笔记库中运行（Windows，时区 UTC+8），共五轮。状态：**已完成**。

## 问题

- `core.editor.insertTag` 带属性值打标签；对已经有该标签的块再次调用时，是覆盖还是追加
- `core.editor.setRefData` 修改单个属性值
- 在标签块上用 `core.editor.setProperties` 补齐属性时，`pos`、已有的选项和默认值如何变化
- `core.editor.renameAlias` 之后，已有任务块的 `refs`、`text`，以及按新名字查询能否命中
- 移除任务标签（放弃）该用哪个命令，移除后属性值去了哪里
- 以上操作能否被撤销，`invokeGroup` 能否把多步操作合成一次撤销

## 结论

### 标签属性的定义（标签块上的 `setProperties`）

- `setProperties` 按属性名合并：只传一部分属性时，没传的属性原样保留（第一轮 08）。
- **`typeArgs` 整体替换，不合并。** 只传 `name` 和 `type` 时，`typeArgs` 被清空；只传 `{ choices }` 时，`subType` 丢失（第二轮 C）。
- `pos` 为 `null` 时，Orca 按属性名的 Unicode 编码排序显示。显式写入 `pos`（0、1、2……）后，界面顺序与 `pos` 一致（第二轮 B，界面已确认）。系统属性（`_repr`、`_show`）的 `pos` 保持为 `null`。
- 选项写成字符串数组（`["@home"]`）或对象数组（`[{ n, c }]`）都会原样保存。在 Orca 界面里手动创建的标签属性使用的是对象格式。本项目统一使用对象格式。
- 给已有属性追加选项（"进行中"）后，已有任务的值不受影响，新选项的颜色也正常显示（第一轮 08，界面已确认）。任务块 `ref.data` 中的 `typeArgs` 副本会随标签定义同步更新（第二轮 C2）。
- 第二轮时，标签块上多了一个系统属性 `_show`（type 0），来源不明，可能是界面操作产生的。
- `createAlias` 成功时返回空字符串；`setProperties` 返回 `undefined`。

### 打标签（`insertTag`）

- 返回值是标签块的 ID，不是引用的 ID。
- 属性值存在任务块的标签引用里，也就是 `refs` 中 `type` 为 2 的那一条的 `data` 字段。任务块自己的 `properties` 里只有 `_tags` 和 `_repr`。
- 不传值时，开启了 `defaultEnabled` 的属性会自动填入默认值（状态为"收集箱"，重要性为 4）。没有默认值的属性在 `data` 中根本不存在（步骤 03）。
- 对已经有该标签的块再次调用 `insertTag`、只传一部分值时，传入的值被更新，其余值保留，引用 ID 不变，效果是 upsert（步骤 04）。
- 值的格式：
  - 单选：字符串
  - 多选：字符串数组
  - 数字：number
  - 日期时间：存为 UTC 时刻，本地 10:00 存为 `02:00:00.000Z`。~~读回来仍是字符串，不是 `Date`~~：更正，`get-blocks` 读回的是 `Date`，这里的结论是 JSON 打印造成的（`plugin-panel-writes`）。
- `ref.data` 的每一项都带着一份 `typeArgs`，是打标签那一刻的属性定义副本。
- 设置日期值时，会额外生成一条 `type` 为 3（RefData）的引用，指向该日期的日记块；那天的日记还不存在时会被自动创建（块 213 就是这样创建出来的 2026-10-20 日记）。清空日期后，这条引用随之删除（第一轮 06，第三轮 E）。
- 日记块是根级块，`text` 为 `null`，`_repr` 为 `{ type: "journal", date }`。`date` 是该本地日期对应的 UTC 零点：本地 2026-11-03 09:00（UTC+8）对应的日记，`date` 为 `2026-11-03T00:00:00.000Z`（第三轮 E）。
- 块的 `text` 字段会把标签值以纯文本拼进去，例如：`NA验证任务A #NA验证标签,@home,2026-10-20 10:00,待开始,6`。
- `insertBlock` 的参考块传 `null` 时，新块是一个没有父块的根级块。

### 改值（`setRefData`）

- 改值和清空都能用，只需要传 `name` 和 `value`。
- 清空后，该项仍留在 `data` 里，值为 `null`。所以"没有值"有两种形态：缺项，或者值为 `null`。
- **块引用属性（BlockRefs，即依赖）的值是引用 ID 列表。** 正确写法：先 `createRef(任务块, 目标块, 3)` 得到引用 ID，再把引用 ID 写进属性值（第二轮 A2）。写好后，界面显示为目标块的胶囊，点胶囊右侧的按钮可以删除；任务块的 `text` 里也会拼入目标块的文本。
- 直接写块 ID，无论用 `setRefData` 还是 `insertTag`，都只是把这个数字原样存下来，不会建立引用，界面上显示为空（第一轮 07，第二轮 A1，界面已确认）。
- **移除依赖。** 用 `setRefData` 把依赖值写成 `[]` 后，`data` 中的"依赖"项整个消失（不是变成 `null`），对应的 RefData 引用也被删除，`text` 中不再出现目标块（第三轮 A4）。在界面上点胶囊的删除按钮效果相同：值中去掉该引用 ID，对应的引用被删除（第三轮 A4m）。用代码只移除其中一个依赖也一样：值中只留下另一个引用 ID，被移除的那条引用随之删除，`text` 中只剩留下的目标（第四轮 A5）。
- **Orca 不会清理失效依赖。** 被依赖的块被移除任务标签后，依赖值和引用都保持不变，界面上仍显示该块（第三轮，界面已确认）。按 `GLOSSARY.md` 中"依赖"的定义，清除失效依赖必须由插件自己完成。
- **引用 ID 会被回收再用。** ID 202 在第一轮步骤 06 中被删除，到步骤 12 又被分配给另一条引用。所以错写进去的块 ID，以后可能恰好等于某条新引用的 ID，悄悄地指向别的块。

### 改标签名（`renameAlias`）

- 成功，返回空字符串。旧名字不再能解析，新名字解析到同一个标签块，ID 不变。
- 已有任务块的 `text` 和 `ref.alias` 都同步更新了，后端和 `orca.state.blocks` 中都是如此。
- 按新名字查询能命中全部任务，按旧名字查询结果为空。
- **标签块自身的文本不变。** 改名后，标签块的 `content` 仍是旧名字"NA验证标签"，只有 `aliases` 是新名字（第二轮 D）。但界面上标签页面的标题已经显示新名字，说明标题显示的是别名（第三轮，界面已确认）。用 `setBlocksContent` 可以把文本也改成新名字，别名不受影响（第三轮 D2）。
- **Orca 自己在界面上改名，也只改别名。** 用户在标签页面直接编辑标题，把"NA界面改名测试"改成"NA界面改名测试2"之后，标题显示新名字，`aliases` 变为新名字，`content` 和 `text` 仍是旧名字（第四轮 T，界面已确认）。所以 `renameAlias` 的效果与 Orca 界面改名一致，插件不需要另外同步标签块的文本。
- 结论：ADR 0002 的改名方案可行。

### 移除标签（`removeTag`）

- 移除后，标签引用、`_tags` 和 `text` 中的标签文本全部消失，属性值也随之丢失。
- 重新打上标签后，所有值都回到默认值（重要性从 7 变回 4）。这与 `GLOSSARY.md` 中"放弃"的定义一致：放弃就是丢弃这个任务的数据。

### 删除块

- **决定能否删除的是"有没有被引用"，不是"是不是根级块"**（第四轮）：
  - 没有被引用的子块（X1）：`deleteBlocks` 后块消失。
  - 没有被引用的根级块（X3）：`deleteBlocks` 后块同样消失。
  - 被其他任务依赖的子块（X2）：`deleteBlocks` 之后块仍然存在，从原父块的子块列表中消失，`parent` 变为 `null`。也就是说，Orca 把它从所在位置摘下来，因为还有引用指向它，就把它作为**孤立块**保留下来（第四轮 X2，第五轮 Y1）。
- 依赖方（X2 的依赖方）的依赖值和引用都保持不变，`text` 里仍然显示被依赖块的文本（第四轮 X2）。
- 第二、三轮中删不掉的 X、W 也都是被依赖的块，与此一致。
- 用户在界面上手动删除这类孤立块同样失败（界面已确认）。
- **块 ID 也会被回收再用。** X1 删除后，232 被分配给 X2；X3 删除后，234 被分配给 Q1b（第四轮）。插件不能在一次删除之后还长期保留块 ID，并假设它指向原来那个块。
- **孤立的任务仍然是任务。** 被删除后成为孤立块的任务，`_tags` 和任务标签引用都保留着，而且仍然出现在按任务标签查询的结果里（第五轮 Y1、Y2）。不做处理的话，用户已经删除的任务会继续出现在各个视图中。
- 孤立块的特征：`parent` 为 `null`，没有别名，`_repr` 不是 `journal`。前几轮用 `insertBlock(null, null)` 建的测试块也有同样的特征，从数据上无法和"被删除后保留下来的块"区分开。
- **引用解除后，Orca 不会自动清理孤立块。** 解除唯一的依赖、等待 2 秒后，孤立块仍然存在，`backRefs` 已经为空，仍然出现在查询结果中（第五轮 Y3）。
- 此时再执行一次 `deleteBlocks`，块就被真正删除了，查询结果里也不再出现（第五轮 Y4，界面已确认）。

### 查询（顺带验证）

- `query` 返回的是块 ID 数组，不是块对象，需要再取一次块。
- 按单选属性"等于"（op 1）筛选可用。

### 撤销

- **`invokeGroup` 中的多步操作是一个撤销单元。** 代码调用一次 `core.editor.undo`，或用户按一次 Ctrl+Z，整组操作（打标签加改值）都会一起被撤销，块恢复成普通文本块（第二轮 F1、F2，界面已确认）。再撤销一次，撤销的是更早的建块操作。
- **`core.editor.undo` 的 Promise 返回时，撤销还没有完全生效。** 第一轮在 500 ms 后读取，读到的是中间状态：`data` 已经回退，`text` 和标签还没有；等 2 秒后才是最终状态。第一轮的"不一致"就是这个原因，任务 C 最后也确实失去了标签，导致第二轮 E 失败。
- 插件自己的普通写命令，在 `await` 返回后立即读取，结果都是一致的。
- **注册为编辑器命令、内部再用 `invokeGroup` 写入时，用户按一次 Ctrl+Z 仍然撤回整组写入**（第三步"转为任务"实测，2026-10-08，用户确认：转为任务、清除残留 `nextaction.*` 后一次撤销都恢复原样；快速捕获、改状态与完成历史、放弃同样一次撤销）。

## 待补测

| | 问题 | 状态 |
|---|---|---|
| A | 块引用属性的正确写法 | 已解决（第二轮）：`createRef` 后写入引用 ID |
| A3 | 被依赖的块删除后，依赖值怎么变 | 已解决（第四轮 X2）：块被摘下但保留，依赖值和引用都不变 |
| A4 | 全部移除依赖、界面删除胶囊 | 已解决（第三轮）：值和引用一起删除 |
| A5 | 用代码只移除其中一个依赖 | 已解决（第四轮）：只删除被移除的那条引用 |
| B | 写 `pos` 能否控制显示顺序 | 已解决（第二轮）：可以 |
| C | `typeArgs` 是替换还是合并 | 已解决（第二轮）：整体替换 |
| D | 改名后，标签块自己的文本 | 已解决（第二、三轮）：不变；`setBlocksContent` 可以更新 |
| E | 日期引用指向的是不是日记块 | 已解决（第三轮）：是，日记不存在时自动创建 |
| F | `invokeGroup` 的撤销效果 | 已解决（第二轮）：一次撤销整组 |
| G | 字符串格式的选项在界面上的表现 | 不再验证：统一使用对象格式 |
| T | Orca 自己在界面上给标签改名时，会不会同步标签块文本 | 已解决（第四轮）：不会，只改别名 |
| X | 根级块删不掉，是因为根级还是因为被引用 | 已解决（第四轮）：因为被引用 |
| Y | 被删除后成为孤立块的任务：`parent`、任务标签、是否出现在查询结果中；依赖解除后会不会被清理 | 已解决（第五轮）：仍是任务，仍被查询命中，不会被自动清理 |
| Q | 查询能否用 `hasParent` / `hasAliases` 条件直接排除孤立块 | 已解决（#13）：`{ kind: 9, hasParent: true }` 可以排除 |

全部问题已有结论，#5 完成。

## 对后续步骤的影响

**第二步：任务标签结构对齐**
- `setProperties` 按属性名合并，所以对齐时只写插件自己的属性，不碰 `_` 开头的系统属性。
- 修改已有属性时，必须传入完整的 `typeArgs`：先读出现有值，在本地合并好，再整体写回。因为 Orca 是整体替换，漏掉任何一个字段（比如 `subType`、用户自己加的选项）都会丢失。
- 选项统一使用 `{ n, c }` 对象格式，与 Orca 界面保持一致。
- 每个属性都显式写入 `pos`，以固定显示顺序。

**第二步：改名**
- 只用 `renameAlias` 改名，不修改标签块的文本，与 Orca 界面改名的行为保持一致。

**第二步：编解码**
- 从任务块标签引用的 `data` 中读取属性值。缺项和 `null` 都视为空。日期从 ISO 字符串解析。单选是字符串，多选是数组。
- 选项列表以标签块上的定义为准，不读 `ref.data` 里的 `typeArgs` 副本。
- 块引用属性的值是引用 ID，要通过块的 `refs` 解析成目标块 ID。
- 写入依赖：在同一个 `invokeGroup` 中，先 `createRef(任务块, 目标块, 3)`，再把引用 ID 写进属性值。**任何时候都不能写入原始块 ID**，因为引用 ID 会被回收。
- 移除依赖：从值中去掉对应的引用 ID 后写回，Orca 会删除对应的引用。全部移除和只移除一部分都已确认。

**第五步：依赖**
- Orca 不清理失效依赖。插件要自己识别"被依赖的块已不是任务"的情况，并把这条依赖清除掉。
- 被依赖的块被用户删除后，并不会真的消失，而是作为孤立块保留下来，并且仍然带着任务标签。所以插件判断"被依赖的块已不是任务"时，除了"块不存在"和"没有任务标签"，还要把"孤立块"也算进去：`parent` 为 `null`，没有别名，并且不是日记。
- 插件清除失效依赖后，孤立块就不再被引用了，但它仍然留在笔记里。要不要由插件再删除一次，替用户完成当初的删除操作，留到第五步讨论。这涉及删除用户数据，判断孤立块的规则一旦误判，就会删掉用户的块，必须由用户决定。

**第二步起：所有任务查询都要排除孤立块**
- 孤立的任务会被按标签的查询命中（第五轮 Y2）。仓储层的"查询任务"必须排除孤立块，排除规则与上面相同。#13 已确认可以在查询条件里直接排除：加上 `{ kind: 9, hasParent: true }`（`tag-property-query.md`）。第三步起改为"有父块或有别名"，页面可以是任务（ADR 0013、`page-task.md`）。
- 用户在 Orca 界面中只能在日记或页面下面写块。界面上的"新页面"会创建一个根级块，但必须先填写别名，所以页面不会被误判为孤立块（用户确认）。这条规则只会排除被删除后保留下来的块，以及用代码建出来的无主根级块。

**第三步：捕获**
- 用 `insertTag` 不带值打标签，就能得到默认状态"收集箱"。
- 改值用 `insertTag`（upsert）或 `setRefData` 都可以。
- 放弃用 `removeTag`。

**第三、四步**
- 设置开始时间或截止时间时，会在对应日期的日记上留下反向链接，那天的日记不存在时还会被自动创建（第三轮 E 已确认）。这是 Orca 日期属性的原生行为，也是用户看得见的副作用：那一天的日记里会出现这个任务的引用。

**所有步骤：不创建孤立的根级块**
- `insertBlock(null, null)` 会创建一个没有父块、没有别名的根级块，用户在笔记里几乎找不到它。除任务标签块（有别名，相当于一个页面）外，插件不创建根级块：快速捕获按 ADR 0005 写进日记，把已有块变成任务时不移动块的位置。根级块本身可以被删除，删不掉的原因是被引用（第四轮 X）。

**所有步骤：不长期持有块 ID**
- 块 ID 和引用 ID 都会被回收再用。插件缓存块 ID 时，必须遵循 ADR 0007 的失效规则，不能跨越删除操作继续使用。

**与 `docs/ARCHITECTURE.md` 的关系**
- 第 4 节"涉及多个步骤的写操作包在 `invokeGroup` 里，让用户能一次撤销"已经在第二轮得到验证，不需要修订。
- 撤销是异步完成的。用户撤销后，视图要靠 ADR 0007 的刷新机制（获得焦点时重新查询）来更新，不能假设撤销命令一返回数据就已经变好。

## 验证代码（第一轮）

在开发者工具的控制台中运行。

```js
(async () => {
  const TAG = "NA验证标签", TAG2 = "NA验证标签改名";
  const R = { steps: {} }, ids = {};
  R.ids = ids; window.__naSpike5 = R;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const aliasId = (name) => orca.invokeBackend("get-blockid-by-alias", name);
  const tagRef = (b) => b?.refs?.find((r) => r.type === 2 && r.to === ids.tag);
  const brief = (b) => b && ({
    id: b.id, text: b.text,
    properties: b.properties?.map((p) => ({ name: p.name, type: p.type, pos: p.pos, value: p.value })),
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type, alias: r.alias,
      data: r.data?.map((d) => ({ name: d.name, type: d.type, value: d.value })) })),
  });
  const tagProps = (b) => b?.properties?.map((p) => ({ name: p.name, type: p.type, pos: p.pos, typeArgs: p.typeArgs }));
  const q = (name, properties) => orca.invokeBackend("query", { q: { kind: 100, conditions: [{ kind: 4, name, properties }] } });
  const idsOf = (res) => Array.isArray(res) ? res.map((b) => b?.id ?? b) : res;
  const newBlock = (text) => ed("core.editor.insertBlock", null, null, [{ t: "t", v: text }]);
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(300);
  };

  if ((await aliasId(TAG))?.id || (await aliasId(TAG2))?.id) {
    console.warn("测试标签已存在，请先删除名为 NA验证标签 / NA验证标签改名 的块再运行"); return;
  }

  await step("01_创建标签", async () => {
    ids.tag = await newBlock(TAG);
    const aliasErr = await ed("core.editor.createAlias", TAG, ids.tag);
    const ret = await ed("core.editor.setProperties", [ids.tag], [
      { name: "状态", type: 6, typeArgs: { subType: "single", defaultEnabled: true, default: "收集箱",
        choices: [{ n: "收集箱", c: "#9e9e9e" }, { n: "待开始", c: "#2196f3" }, { n: "已完成", c: "#4caf50" }] } },
      { name: "重要性", type: 3, typeArgs: { defaultEnabled: true, default: 4 } },
      { name: "工作量", type: 3 },
      { name: "截止时间", type: 5, typeArgs: { subType: "datetime" } },
      { name: "上下文", type: 6, typeArgs: { subType: "multi", choices: ["@home", "@company"] } },
      { name: "依赖", type: 2 },
    ]);
    return { tagId: ids.tag, aliasErr, ret, tagProps: tagProps(await get(ids.tag)) };
  });

  await step("02_带值打标签", async () => {
    ids.a = await newBlock("NA验证任务A");
    const ret = await ed("core.editor.insertTag", ids.a, TAG, [
      { name: "状态", value: "待开始" },
      { name: "重要性", value: 6 },
      { name: "截止时间", type: 5, value: new Date("2026-10-20T10:00:00") },
      { name: "上下文", value: ["@home"] },
    ]);
    const raw = await get(ids.a);
    return { ret, a: brief(raw), raw };
  });

  await step("03_不带值打标签", async () => {
    ids.b = await newBlock("NA验证任务B");
    const ret = await ed("core.editor.insertTag", ids.b, TAG);
    return { ret, b: brief(await get(ids.b)) };
  });

  await step("04_再次insertTag只传状态", async () => {
    await ed("core.editor.insertTag", ids.a, TAG, [{ name: "状态", value: "已完成" }]);
    return brief(await get(ids.a));
  });

  await step("05_setRefData改重要性", async () => {
    await ed("core.editor.setRefData", tagRef(await get(ids.a)), [{ name: "重要性", value: 2 }]);
    return brief(await get(ids.a));
  });
  await step("06_setRefData清空截止时间", async () => {
    await ed("core.editor.setRefData", tagRef(await get(ids.a)), [{ name: "截止时间", value: null }]);
    return brief(await get(ids.a));
  });
  await step("07_setRefData依赖设为块B", async () => {
    await ed("core.editor.setRefData", tagRef(await get(ids.a)), [{ name: "依赖", type: 2, value: [ids.b] }]);
    return brief(await get(ids.a));
  });

  await step("08_标签补齐属性和选项", async () => {
    const pos = (await get(ids.tag)).properties.find((p) => p.name === "状态")?.pos;
    await ed("core.editor.setProperties", [ids.tag], [
      { name: "状态", type: 6, pos, typeArgs: { subType: "single", defaultEnabled: true, default: "收集箱",
        choices: [{ n: "收集箱", c: "#9e9e9e" }, { n: "待开始", c: "#2196f3" }, { n: "已完成", c: "#4caf50" }, { n: "进行中", c: "#ff9800" }] } },
      { name: "备注", type: 1 },
    ]);
    return { tagProps: tagProps(await get(ids.tag)), a: brief(await get(ids.a)) };
  });

  await step("09_改名前查询", async () => {
    const all = await q(TAG);
    return { all: idsOf(all), resultKeys: Object.keys(all?.[0] ?? {}),
      done: idsOf(await q(TAG, [{ name: "状态", op: 1, value: "已完成" }])) };
  });

  await step("10_renameAlias", async () => {
    const ret = await ed("core.editor.renameAlias", TAG, TAG2);
    await sleep(500);
    return { ret, newAlias: await aliasId(TAG2), oldAlias: await aliasId(TAG),
      a: brief(await get(ids.a)), stateText: orca.state.blocks[ids.a]?.text,
      queryNew: idsOf(await q(TAG2)), queryOld: idsOf(await q(TAG)) };
  });

  await step("11_removeTag", async () => {
    await ed("core.editor.setRefData", tagRef(await get(ids.b)), [{ name: "重要性", value: 7 }]);
    const before = brief(await get(ids.b));
    await ed("core.editor.removeTag", ids.b, TAG2);
    return { before, after: brief(await get(ids.b)) };
  });
  await step("12_放弃后重新打标签", async () => {
    await ed("core.editor.insertTag", ids.b, TAG2);
    return brief(await get(ids.b));
  });

  await step("13_invokeGroup与撤销", async () => {
    ids.c = await newBlock("NA验证任务C");
    await sleep(300);
    await orca.commands.invokeGroup(async () => {
      await ed("core.editor.insertTag", ids.c, TAG2, [{ name: "状态", value: "待开始" }]);
      await ed("core.editor.setRefData", tagRef(await get(ids.c)), [{ name: "重要性", value: 7 }]);
    });
    await sleep(300);
    const afterGroup = brief(await get(ids.c));
    const undoRet = await orca.commands.invokeCommand("core.editor.undo");
    await sleep(500);
    return { afterGroup, undoRet, afterUndo: brief(await get(ids.c)) };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 结果已复制到剪贴板"); } catch { console.log(out); }
  console.log(R);
})();
```

## 实际返回（第一轮摘录）

生成的块：标签块 211，任务 A 212，日期引用指向的块 213，任务 B 214，任务 C 215。

步骤 02，任务 A 的标签引用（带值打标签）：

```json
{ "id": 201, "to": 211, "type": 2, "alias": "NA验证标签",
  "data": [
    { "name": "上下文", "type": 6, "value": ["@home"] },
    { "name": "截止时间", "type": 5, "value": "2026-10-20T02:00:00.000Z" },
    { "name": "状态", "type": 6, "value": "待开始" },
    { "name": "重要性", "type": 3, "value": 6 } ] }
```

同一个块上还有一条 `{ "id": 202, "to": 213, "type": 3, "alias": null }`。

步骤 03，任务 B（不带值打标签）：`data` 只有 `状态 = "收集箱"`、`重要性 = 4`。

步骤 06 之后，`截止时间` 的值为 `null`，引用 202 消失。

步骤 07 之后，`{ "name": "依赖", "type": 2, "value": [214] }`，`refs` 中没有指向 214 的引用。

步骤 09：`all = [212, 214]`，`resultKeys = []`（说明结果是数字），`done = [212]`。

步骤 10：`ret = ""`，`newAlias = { id: 211 }`，`oldAlias` 为 `undefined`，A 的 `text` 变为 `NA验证任务A #NA验证标签改名,@home,已完成,2`，`queryNew = [212, 214]`，`queryOld = []`。

步骤 11、12：移除后 B 的 `text` 为 `NA验证任务B`，`refs` 为空。重新打标签后，值为 `收集箱, 4`，引用 ID 为 202（被回收再用）。

步骤 13：

```json
"afterGroup": { "text": "NA验证任务C #NA验证标签改名,待开始,7",
                "data": { "状态": "待开始", "重要性": 7 } },
"afterUndo":  { "text": "NA验证任务C #NA验证标签改名,待开始,4",
                "data": { "状态": "收集箱", "重要性": 4 } }
```

界面观察：
- 任务 A 显示为普通的文本块，带着新的标签名，没有父块。
- 标签属性的顺序为：上下文、依赖、备注、工作量、截止时间、状态、重要性。
- "状态"的选项中有"进行中"，颜色正常。

## 验证代码（第二轮）

第一段在控制台运行；然后在编辑器中按一次 Ctrl+Z；再运行第二段。

```js
(async () => {
  const TAG = "NA验证标签改名";
  const R = { steps: {}, ids: {} }; window.__naSpike5b = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const brief = (b) => b && ({
    id: b.id, text: b.text,
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type, alias: r.alias,
      data: r.data?.map((d) => ({ name: d.name, type: d.type, value: d.value })) })),
  });
  const tagProps = (b) => b?.properties?.map((p) => ({ name: p.name, type: p.type, pos: p.pos, typeArgs: p.typeArgs }));
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };

  const tagId = (await orca.invokeBackend("get-blockid-by-alias", TAG))?.id;
  if (!tagId) { console.warn("找不到标签 " + TAG + "，请确认第一轮的块还在"); return; }
  R.ids.tag = tagId;
  const tagRef = (b) => b?.refs?.find((r) => r.type === 2 && r.to === tagId);
  const newBlock = (text) => ed("core.editor.insertBlock", null, null, [{ t: "t", v: text }]);
  const findTask = async (prefix) => {
    const ids = await orca.invokeBackend("query", { q: { kind: 100, conditions: [{ kind: 4, name: TAG }] } });
    for (const id of ids) { const b = await get(id); if (b?.text?.startsWith(prefix)) return id; }
  };

  await step("A1_insertTag直接传块ID", async () => {
    const x = await newBlock("NA依赖目标X"); await ed("core.editor.insertTag", x, TAG);
    const y = await newBlock("NA依赖Y_insertTag");
    await ed("core.editor.insertTag", y, TAG, [{ name: "依赖", type: 2, value: [x] }]);
    R.ids.x = x; R.ids.y = y;
    return { x, y: brief(await get(y)) };
  });
  await step("A2_先createRef再写引用ID", async () => {
    const z = await newBlock("NA依赖Z_createRef"); await ed("core.editor.insertTag", z, TAG);
    const refId = await ed("core.editor.createRef", z, R.ids.x, 3);
    await ed("core.editor.setRefData", tagRef(await get(z)), [{ name: "依赖", type: 2, value: [refId] }]);
    R.ids.z = z;
    return { refId, z: brief(await get(z)) };
  });
  await step("A3_删除被依赖块X之后", async () => {
    await ed("core.editor.deleteBlocks", [R.ids.x]);
    await sleep(800);
    return { x: await get(R.ids.x), y: brief(await get(R.ids.y)), z: brief(await get(R.ids.z)) };
  });

  await step("B_写pos", async () => {
    const order = ["状态", "重要性", "工作量", "截止时间", "上下文", "依赖", "备注"];
    const cur = (await get(tagId)).properties;
    await ed("core.editor.setProperties", [tagId], order.map((name, i) => {
      const p = cur.find((p) => p.name === name);
      return { name, type: p.type, typeArgs: p.typeArgs, pos: i };
    }));
    return tagProps(await get(tagId));
  });

  await step("C_typeArgs替换还是合并", async () => {
    const ta = async () => (await get(tagId)).properties.find((p) => p.name === "NA测试选项")?.typeArgs ?? "（属性不存在）";
    await ed("core.editor.setProperties", [tagId], [{ name: "NA测试选项", type: 6,
      typeArgs: { subType: "single", choices: [{ n: "甲", c: "#f44336" }, { n: "乙", c: "#2196f3" }] } }]);
    const c0 = await ta();
    await ed("core.editor.setProperties", [tagId], [{ name: "NA测试选项", type: 6 }]);
    const c1_只传name和type = await ta();
    await ed("core.editor.setProperties", [tagId], [{ name: "NA测试选项", type: 6, typeArgs: { choices: [{ n: "丙", c: "#4caf50" }] } }]);
    const c2_只传choices = await ta();
    await ed("core.editor.deleteProperties", [tagId], ["NA测试选项"]);
    const c3_删除后 = await ta();
    return { c0, c1_只传name和type, c2_只传choices, c3_删除后 };
  });
  await step("C2_任务上的typeArgs副本是否跟着更新", async () => {
    const a = await findTask("NA验证任务A");
    const ref = tagRef(await get(a));
    return { a, 状态typeArgs: ref?.data?.find((d) => d.name === "状态")?.typeArgs };
  });

  await step("D_标签块文本", async () => {
    const t = await get(tagId);
    return { text: t.text, content: t.content, aliases: t.aliases };
  });

  await step("E_日期引用的目标", async () => {
    const c = await findTask("NA验证任务C");
    const date = new Date("2026-11-03T09:00:00");
    await ed("core.editor.setRefData", tagRef(await get(c)), [{ name: "截止时间", type: 5, value: date }]);
    await sleep(500);
    const cb = await get(c);
    const dref = cb.refs.find((r) => r.type === 3);
    const target = dref && await get(dref.to);
    const journal = await orca.invokeBackend("get-journal-block", date);
    return { c, dref, target: target && { id: target.id, text: target.text, parent: target.parent,
      properties: target.properties?.map((p) => ({ name: p.name, type: p.type, value: p.value })) },
      journalIdForDate: journal?.id };
  });

  await step("F1_代码撤销_延长等待", async () => {
    const d = await newBlock("NA撤销测试D"); R.ids.d = d;
    await sleep(1000);
    await orca.commands.invokeGroup(async () => {
      await ed("core.editor.insertTag", d, TAG, [{ name: "状态", value: "待开始" }]);
      await ed("core.editor.setRefData", tagRef(await get(d)), [{ name: "重要性", value: 7 }]);
    });
    await sleep(1000);
    const afterGroup = brief(await get(d));
    await orca.commands.invokeCommand("core.editor.undo");
    await sleep(2000);
    const undo1 = { backend: brief(await get(d)), state: brief(orca.state.blocks[d]) };
    await orca.commands.invokeCommand("core.editor.undo");
    await sleep(2000);
    const undo2 = { backend: brief(await get(d)), state: brief(orca.state.blocks[d]) };
    return { afterGroup, undo1, undo2 };
  });

  await step("F2_准备手动撤销", async () => {
    const e = await newBlock("NA撤销测试E"); R.ids.e = e;
    await sleep(1000);
    await orca.commands.invokeGroup(async () => {
      await ed("core.editor.insertTag", e, TAG, [{ name: "状态", value: "待开始" }]);
      await ed("core.editor.setRefData", tagRef(await get(e)), [{ name: "重要性", value: 7 }]);
    });
    await sleep(1000);
    return brief(await get(e));
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 第一段结果已复制到剪贴板。块 E 的 ID：" + R.ids.e); } catch { console.log(out); }
  console.log(R);
})();
```

```js
(async () => {
  const id = window.__naSpike5b?.ids?.e;
  if (!id) { console.warn("找不到块 E 的 ID，请把第一段输出里的 ID 告诉我"); return; }
  const b = await orca.invokeBackend("get-block", id);
  const brief = (b) => b && ({ id: b.id, text: b.text,
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type,
      data: r.data?.map((d) => ({ name: d.name, value: d.value })) })) });
  window.__naSpike5b.steps.F2_手动CtrlZ之后 = { backend: brief(b), state: brief(orca.state.blocks[id]) };
  const out = JSON.stringify(window.__naSpike5b, null, 2);
  try { copy(out); console.log("✅ 完整结果已复制到剪贴板"); } catch { console.log(out); }
})();
```

## 实际返回（第二轮摘录）

生成的块：依赖目标 X 216，依赖 Y 217，依赖 Z 218，撤销测试 D 220、E 221。

A1，`insertTag` 直接传块 ID：`{ "name": "依赖", "type": 2, "value": [216] }`，`refs` 中没有指向 216 的引用。界面上依赖显示为空。

A2，先 `createRef` 再写引用 ID：`createRef` 返回 206。

```json
{ "id": 205, "to": 211, "type": 2, "data": [ { "name": "依赖", "type": 2, "value": [206] }, … ] },
{ "id": 206, "to": 216, "type": 3, "alias": null, "data": [] }
```

`text` 为 `NA依赖Z_createRef #NA验证标签改名,NA依赖目标X,收集箱,4`。界面上依赖显示为"NA依赖目标X"的胶囊，右侧有删除按钮。

A3，`deleteBlocks([216])` 后等待 800 ms：块 216 仍然存在（界面确认），`backRefs` 中有 206。Y、Z 没有变化。

B，写入 `pos` 0–6 后，返回顺序为：状态、重要性、工作量、截止时间、上下文、依赖、备注，再接 `_repr`、`_show`（这两个的 `pos` 为 `null`）。界面顺序与此一致。

C：
- `c0`：`{ subType: "single", choices: [甲, 乙] }`
- 只传 `name` 和 `type` 后：`typeArgs` 读不到值（代码输出"（属性不存在）"）
- 只传 `{ choices: [丙] }` 后：`{ choices: [丙] }`，`subType` 丢失
- 删除后：属性不存在

C2：任务 A 的 `ref.data` 中，状态的 `typeArgs` 已包含"进行中"。

D：标签块 `text` 为 `"NA验证标签\n"`，`content` 为 `[{ t: "t", v: "NA验证标签" }]`，`aliases` 为 `["NA验证标签改名"]`。

E：报错 `Cannot read properties of undefined (reading 'from')`。原因是任务 C 在第一轮的撤销之后已经失去了标签，`tagRef` 为空。

F1：
- `afterGroup`：`text` 为 `NA撤销测试D #NA验证标签改名,待开始,7`，`data` 为 `待开始, 7`
- 第一次撤销（等待 2 秒）：后端和 state 都是 `text: "NA撤销测试D"`，`refs: []`
- 第二次撤销：`text: null`，`refs: []`

F2：手动按 Ctrl+Z 之后，后端和 state 都是 `text: "NA撤销测试E"`，`refs: []`。界面上显示为普通文本块。

## 验证代码（第三轮）

第一段在控制台运行；然后在界面上删除 Z5 的 Q1 胶囊，并尝试手动删除块 X；再运行第二段。

```js
(async () => {
  const TAG = "NA验证标签改名";
  const R = { steps: {}, ids: {} }; window.__naSpike5c = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const aliasId = (name) => orca.invokeBackend("get-blockid-by-alias", name);
  const brief = (b) => b && ({
    id: b.id, text: b.text,
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type,
      data: r.data?.map((d) => ({ name: d.name, type: d.type, value: d.value })) })),
    backRefs: b.backRefs?.map((r) => ({ id: r.id, from: r.from, type: r.type })),
  });
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };

  const tagId = (await aliasId(TAG))?.id;
  if (!tagId) { console.warn("找不到标签 " + TAG); return; }
  R.ids.tag = tagId;
  const tagRef = (b) => b?.refs?.find((r) => r.type === 2 && r.to === tagId);
  const newBlock = (text) => ed("core.editor.insertBlock", null, null, [{ t: "t", v: text }]);
  const newTask = async (text, data) => { const id = await newBlock(text); await ed("core.editor.insertTag", id, TAG, data); return id; };
  const addDep = async (from, to) => {
    const refId = await ed("core.editor.createRef", from, to, 3);
    const ref = tagRef(await get(from));
    const cur = ref.data?.find((d) => d.name === "依赖")?.value ?? [];
    await ed("core.editor.setRefData", ref, [{ name: "依赖", type: 2, value: [...cur, refId] }]);
    return refId;
  };

  await step("A3b_代码删除被依赖块", async () => {
    const w = await newTask("NA依赖目标W");
    const zw = await newTask("NA依赖ZW");
    const refId = await addDep(zw, w);
    let ret1, ret2, err1, err2;
    try { ret1 = await ed("core.editor.deleteBlocks", [w]); } catch (e) { err1 = String(e); }
    await sleep(2000);
    const after1 = brief(await get(w));
    if (after1) {
      try { await orca.commands.invokeGroup(async () => { ret2 = await ed("core.editor.deleteBlocks", [w]); }); } catch (e) { err2 = String(e); }
      await sleep(2000);
    }
    return { w, refId, ret1, err1, after1, ret2, err2, after2: brief(await get(w)),
      inState: !!orca.state.blocks[w], zw: brief(await get(zw)) };
  });

  await step("A4_清空依赖值", async () => {
    const p = await newTask("NA依赖目标P");
    const z4 = await newTask("NA依赖Z4_清空");
    const refId = await addDep(z4, p);
    const before = brief(await get(z4));
    await ed("core.editor.setRefData", tagRef(await get(z4)), [{ name: "依赖", type: 2, value: [] }]);
    await sleep(500);
    return { refId, before, after: brief(await get(z4)), p: brief(await get(p)) };
  });

  await step("A4m_准备手动删胶囊", async () => {
    const q1 = await newTask("NA依赖目标Q1");
    const q2 = await newTask("NA依赖目标Q2");
    const z5 = await newTask("NA依赖Z5_手动");
    const r1 = await addDep(z5, q1);
    const r2 = await addDep(z5, q2);
    Object.assign(R.ids, { q1, q2, z5 });
    return { r1, r2, z5: brief(await get(z5)) };
  });

  await step("D2_更新标签块文本", async () => {
    await ed("core.editor.setBlocksContent", [{ id: tagId, content: [{ t: "t", v: TAG }] }], false);
    await sleep(500);
    const t = await get(tagId);
    return { text: t.text, aliases: t.aliases, aliasStillResolves: await aliasId(TAG) };
  });

  await step("E_日期引用的目标", async () => {
    const date = new Date("2026-11-03T09:00:00");
    const f = await newTask("NA日期测试F", [{ name: "截止时间", type: 5, value: date }]);
    await sleep(500);
    const targets = [];
    for (const r of (await get(f)).refs.filter((r) => r.type === 3)) {
      const t = await get(r.to);
      targets.push({ refId: r.id, id: t?.id, text: t?.text, parent: t?.parent,
        properties: t?.properties?.map((p) => ({ name: p.name, type: p.type, value: p.value })) });
    }
    const journal = await orca.invokeBackend("get-journal-block", date);
    const b213 = await get(213);
    return { f, targets, journalIdForDate: journal?.id,
      block213: b213 && { text: b213.text, properties: b213.properties?.map((p) => ({ name: p.name, value: p.value })) } };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 第一段完成"); } catch { console.log(out); }
  console.log(R);
})();
```

```js
(async () => {
  const R = window.__naSpike5c;
  const get = (id) => orca.invokeBackend("get-block", id);
  const brief = (b) => b && ({
    id: b.id, text: b.text,
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type,
      data: r.data?.map((d) => ({ name: d.name, value: d.value })) })),
    backRefs: b.backRefs?.map((r) => ({ id: r.id, from: r.from, type: r.type })),
  });
  R.steps.手动之后 = {
    z5: brief(await get(R.ids.z5)), q1: brief(await get(R.ids.q1)),
    x_216: brief(await get(216)), x_inState: !!orca.state.blocks[216],
    z_218: brief(await get(218)), y_217: brief(await get(217)),
  };
  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 完整结果已复制到剪贴板"); } catch { console.log(out); }
})();
```

## 实际返回（第三轮摘录）

生成的块：W 222、ZW 223、P 224、Z4 225、Q1 226、Q2 227、Z5 228、F 229，以及 2026-11-03 的日记 219。

A3b：`deleteBlocks([222])` 没有返回值，也没有报错；等待 2 秒后块 222 仍然存在。再包进 `invokeGroup` 删一次，仍然存在。ZW 的依赖值 `[209]` 和引用 209 都保持不变。

A4：
- 清空前：`依赖 = [212]`，有引用 `{ id: 212, to: 224, type: 3 }`，`text` 含"NA依赖目标P"
- 写入 `[]` 后：`data` 中没有"依赖"项，引用 212 消失，`text` 为 `NA依赖Z4_清空 #NA验证标签改名,收集箱,4`

A4m（在界面上删除 Q1 胶囊之后）：
- `依赖 = [216]`，引用 215 被删除，只剩 `{ id: 216, to: 227 }`
- `text` 中只剩 Q2

D2：`setBlocksContent` 之后，标签块 `text` 为 `"NA验证标签改名\n"`，`aliases` 仍是 `["NA验证标签改名"]`，别名仍能解析到 211。

E：
```json
"targets": [ { "refId": 218, "id": 219, "text": null, "parent": null,
  "properties": [ { "name": "_repr", "value": { "type": "journal", "date": "2026-11-03T00:00:00.000Z" } } ] } ],
"journalIdForDate": 219,
"block213": { "text": null, "properties": [ { "name": "_repr",
  "value": { "type": "journal", "date": "2026-10-20T00:00:00.000Z" } } ] }
```

界面观察：
- 运行前，标签页面的标题已经是新名字"NA验证标签改名"。
- 在界面上手动删除块 X（216，根级）失败。Orca 自动创建的根级块也同样删不掉。
- 移除块 X 的任务标签后，"NA依赖Z_createRef"的依赖属性仍显示块 X。
- "NA依赖Z4_清空"的依赖属性显示为空。

## 验证代码（第四轮）

测试块都建在 2026-11-03 日记下的容器"NA验证容器（第四轮）"中。第一段在控制台运行；然后在界面上改标签名，并试着手动删除 Q1b；再运行第二段。

```js
(async () => {
  const TAG = "NA验证标签改名", UITAG = "NA界面改名测试";
  const R = { steps: {}, ids: {} }; window.__naSpike5d = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const aliasId = (name) => orca.invokeBackend("get-blockid-by-alias", name);
  const brief = (b) => b && ({
    id: b.id, parent: b.parent, text: b.text,
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type,
      data: r.data?.map((d) => ({ name: d.name, type: d.type, value: d.value })) })),
    backRefs: b.backRefs?.map((r) => ({ id: r.id, from: r.from, type: r.type })),
  });
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };

  const tagId = (await aliasId(TAG))?.id;
  if (!tagId) { console.warn("找不到标签 " + TAG); return; }
  if ((await aliasId(UITAG))?.id) { console.warn("标签 " + UITAG + " 已存在，请先删除或改用别的名字"); return; }
  R.ids.tag = tagId;
  const tagRef = (b) => b?.refs?.find((r) => r.type === 2 && r.to === tagId);
  const blockObj = async (id) => orca.state.blocks[id] ?? await get(id);
  const child = async (parentId, text) =>
    ed("core.editor.insertBlock", await blockObj(parentId), "lastChild", [{ t: "t", v: text }]);
  const childTask = async (parentId, text) => { const id = await child(parentId, text); await ed("core.editor.insertTag", id, TAG); return id; };
  const addDep = async (from, to) => {
    const refId = await ed("core.editor.createRef", from, to, 3);
    const ref = tagRef(await get(from));
    const cur = ref.data?.find((d) => d.name === "依赖")?.value ?? [];
    await ed("core.editor.setRefData", ref, [{ name: "依赖", type: 2, value: [...cur, refId] }]);
    return refId;
  };
  const tryDelete = async (id) => {
    let ret, err;
    try { ret = await ed("core.editor.deleteBlocks", [id]); } catch (e) { err = String(e); }
    await sleep(1500);
    return { ret, err, stillExists: !!(await get(id)), inState: !!orca.state.blocks[id] };
  };

  await step("00_容器", async () => {
    const j = await orca.invokeBackend("get-journal-block", new Date("2026-11-03T09:00:00"));
    R.ids.journal = j?.id;
    R.ids.box = await child(j.id, "NA验证容器（第四轮）");
    return { journal: j?.id, box: brief(await get(R.ids.box)) };
  });
  const box = R.ids.box;
  if (!box) { console.warn("容器创建失败", R); return; }

  await step("X1_删子块_无引用", async () => {
    const x1 = await child(box, "NA删除测试X1");
    return { x1, ...(await tryDelete(x1)) };
  });

  await step("X2_删子块_被依赖", async () => {
    const x2 = await childTask(box, "NA删除测试X2_被依赖");
    const z = await childTask(box, "NA删除测试X2的依赖方");
    const refId = await addDep(z, x2);
    const zBefore = brief(await get(z));
    const del = await tryDelete(x2);
    await sleep(500);
    return { x2, refId, zBefore, ...del, zAfter: brief(await get(z)) };
  });

  await step("X3_删根级块_无引用", async () => {
    const x3 = await ed("core.editor.insertBlock", null, null, [{ t: "t", v: "NA删除测试X3_根级" }]);
    return { x3, ...(await tryDelete(x3)) };
  });

  await step("A5_只移除一个依赖", async () => {
    const q1 = await childTask(box, "NA依赖目标Q1b");
    const q2 = await childTask(box, "NA依赖目标Q2b");
    const z6 = await childTask(box, "NA依赖Z6_移除一个");
    const r1 = await addDep(z6, q1);
    const r2 = await addDep(z6, q2);
    const before = brief(await get(z6));
    await ed("core.editor.setRefData", tagRef(await get(z6)), [{ name: "依赖", type: 2, value: [r2] }]);
    await sleep(500);
    return { r1, r2, before, after: brief(await get(z6)) };
  });

  await step("T_准备界面改名", async () => {
    const t = await ed("core.editor.insertBlock", null, null, [{ t: "t", v: UITAG }]);
    const aliasErr = await ed("core.editor.createAlias", UITAG, t);
    R.ids.uiTag = t;
    const tb = await get(t);
    return { t, aliasErr, text: tb.text, aliases: tb.aliases };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 第一段完成"); } catch { console.log(out); }
  console.log(R);
})();
```

```js
(async () => {
  const R = window.__naSpike5d;
  const get = (id) => orca.invokeBackend("get-block", id);
  const t = await get(R.ids.uiTag);
  R.steps.T_界面改名之后 = { text: t?.text, content: t?.content, aliases: t?.aliases };
  const box = await get(R.ids.box);
  R.steps.容器剩余子块 = await Promise.all((box?.children ?? []).map(async (id) => ({ id, text: (await get(id))?.text })));
  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 完整结果已复制到剪贴板"); } catch { console.log(out); }
})();
```

## 实际返回（第四轮摘录）

生成的块：日记 219 下的容器 231；X1 232（已删除）；X2 232（复用了 ID）及其依赖方 233；X3 234（已删除）；Q1b 234（复用了 ID）、Q2b 235、Z6 236；界面改名测试标签 237。

- X1：`stillExists: false`，`inState: false`。
- X2：`stillExists: true`，`inState: true`。依赖方 233 在删除前后都是 `依赖 = [221]`，引用 `{ id: 221, to: 232, type: 3 }` 保留，`text` 仍含"NA删除测试X2_被依赖"。
- X3（根级块，没有被引用）：`stillExists: false`，`inState: false`。
- A5：删除前 `依赖 = [225, 226]`；写入 `[226]` 后 `依赖 = [226]`，引用 225 消失，`text` 只剩 Q2b。
- T：
  - 界面改名前：`text: "NA界面改名测试"`，`aliases: ["NA界面改名测试"]`
  - 界面改名后：`content` 仍为 `"NA界面改名测试"`，`aliases: ["NA界面改名测试2"]`
- 容器剩余子块：233、235、236。X2（232）和 Q1b（234）已不在容器中。

界面观察：
- 改标签名的方式是：在标签页面点击标题，像编辑普通文本块一样修改。改完后标题显示"NA界面改名测试2"。
- Q1b 是在 A5 中被移除了依赖的块，可以手动删除。
- "NA删除测试X2_被依赖"出现在根级，"NA删除测试X2的依赖方"的依赖属性仍然指向它。在界面上手动删除它失败。

## 验证代码（第五轮）

```js
(async () => {
  const TAG = "NA验证标签改名";
  const R = { steps: {} }; window.__naSpike5e = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const full = (b) => b && ({
    id: b.id, parent: b.parent, left: b.left, children: b.children, text: b.text, aliases: b.aliases,
    properties: b.properties?.map((p) => ({ name: p.name, type: p.type, value: p.value })),
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type, alias: r.alias })),
    backRefs: b.backRefs?.map((r) => ({ id: r.id, from: r.from, type: r.type })),
  });
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };
  const tagId = (await orca.invokeBackend("get-blockid-by-alias", TAG))?.id;
  const tagRef = (b) => b?.refs?.find((r) => r.type === 2 && r.to === tagId);
  const byTag = async () => orca.invokeBackend("query", { q: { kind: 100, conditions: [{ kind: 4, name: TAG }] } });

  await step("Y1_孤立块与原生根级块对比", async () => ({
    x2_232: full(await get(232)),
    x_216: full(await get(216)),
    x2_inState: full(orca.state.blocks[232]),
  }));

  await step("Y2_按标签查询", async () => {
    const ids = await byTag();
    return { total: ids.length, has232: ids.includes(232), has216: ids.includes(216), ids };
  });

  await step("Y3_解除依赖后", async () => {
    await ed("core.editor.setRefData", tagRef(await get(233)), [{ name: "依赖", type: 2, value: [] }]);
    await sleep(2000);
    const after = full(await get(232));
    const ids = await byTag();
    return { x2_after: after, stillInQuery: ids.includes(232) };
  });

  await step("Y4_再删除一次", async () => {
    let err;
    try { await ed("core.editor.deleteBlocks", [232]); } catch (e) { err = String(e); }
    await sleep(1500);
    return { err, stillExists: !!(await get(232)), inState: !!orca.state.blocks[232],
      stillInQuery: (await byTag()).includes(232) };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 结果已复制到剪贴板"); } catch { console.log(out); }
  console.log(R);
})();
```

## 实际返回（第五轮摘录）

Y1，被删除后成为孤立块的 X2（232）：

```json
{ "id": 232, "parent": null, "left": null, "children": [],
  "text": "NA删除测试X2_被依赖 #NA验证标签改名,收集箱,4\n", "aliases": [],
  "properties": [ { "name": "_tags", "value": [219] }, { "name": "_repr", "value": { "type": "text" } } ],
  "refs": [ { "id": 219, "to": 211, "type": 2, "alias": "NA验证标签改名" } ],
  "backRefs": [ { "id": 221, "from": 233, "type": 3 } ] }
```

对比：一开始就建在根级的 X（216），任务标签已被用户移除。它是 `parent: null`，`aliases: []`，`children: [230]`，`backRefs: [206]`。

Y2，按任务标签查询：共 16 个结果，`has232: true`，`has216: false`。

Y3，解除依赖方 233 的依赖并等待 2 秒后：232 仍然存在，`backRefs: []`，`_tags` 和任务标签引用都还在，`stillInQuery: true`。

Y4，再执行一次 `deleteBlocks`：`stillExists: false`，`inState: false`，`stillInQuery: false`。

界面观察：
- 运行前，根级仍能看到"NA删除测试X2_被依赖"；运行后它消失了。
- "NA删除测试X2的依赖方"的依赖属性显示为空。
