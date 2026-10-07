# 技术验证：向当天日记末尾追加任务

> Issue #9。2026-10-06 23:51（本地时间，UTC+8）在测试笔记库中运行（Windows）。状态：**已完成**。

## 问题

- `get-journal-block` 获取当天日记；日记不存在时是否会创建，不会的话如何创建
- 用 `core.editor.insertBlock` 追加到日记末尾，并同时带上任务标签和属性；能否作为一次撤销
- 自然日的判定是否受时区影响

## 结论

### 获取日记块

- `get-journal-block(date)` 返回该日期的日记块。**日记还不存在时，它会直接创建一篇空日记**，再次调用返回同一个块（J2：块 246）。所以它不是一个只读接口：只是想查一下某天有没有日记，也会在笔记库里留下一篇空日记。
- 日记块的结构：没有父块，`text` 为 `null`，没有别名，`_repr` 为 `{ type: "journal", date }`（J1）。
- 新建的日记不在 `orca.state.blocks` 里，因为没有加载到界面上（J2 `inState: false`）。

### 日期与时区

- **`get-journal-block` 按传入时间的本地日期选日记。** 本地 2027-03-16 的 00:30、02:00、07:30、12:00、23:30 都得到同一篇日记 247（J3）。其中 00:30 和 02:00 的 UTC 时间还在 3 月 15 日，所以选日记用的是本地日期，不是 UTC 日期。
- 日记 `_repr.date` 存的是**该本地日期的 UTC 零点**，例如本地 2027-03-16 的日记存为 `2027-03-16T00:00:00.000Z`（J3），与 #5 的结论一致。
- **`nav.goTo("journal", { date })` 按 UTC 日期打开日记，与 `get-journal-block` 不同。** 传入本地零点 `new Date(2027, 2, 15)`（UTC 为 3 月 14 日 16:00）时，打开的是 3 月 14 日；传入 `new Date(2027, 2, 16)` 时，打开的是 3 月 15 日（用户实测）。也就是说，导航用的日期必须是该日期的 UTC 零点，即 `new Date(Date.UTC(年, 月, 日))`，这和日记 `_repr.date` 以及 #7 中日记面板 `viewArgs.date` 的格式一致。
- 以上只在 UTC+8 下验证过。按这个规律推断，在 UTC 负时区，`get-journal-block(Date.UTC(…))` 会取到前一天的日记。所以两个接口要分别构造参数，不能共用同一个 `Date` 对象。

### 追加任务

- 在一个 `invokeGroup` 中，先 `insertBlock(日记块, "lastChild", 内容)`，再 `insertTag(新块, 任务标签)`。新块成为日记的最后一个子块，状态是默认值"收集箱"（J4）。
- 日记没有打开过、不在 `orca.state.blocks` 里时，用 `get-block` 取到的块对象作为参考块也能正常追加（J5）。
- **一次撤销会把新建和打标签一起撤回，块消失**（J6）。

### 未验证

- Orca 会不会自动清理空日记。
- 插件的状态图标没有出现在新块上：#8 的验证已经通过 `dispose` 移除了样式，这次没有注入图标，所以是预期的结果，与本项验证无关。

## 对后续步骤的影响

**第三步：快速捕获（ADR 0005）**
- 用 `get-journal-block(new Date())` 取当天（自然日）的日记，然后在一个 `invokeGroup` 中执行 `insertBlock(日记, "lastChild", …)` 和 `insertTag(新块, 任务标签)`，用户可以一次撤销。
- 当天的日记不存在时不需要特别处理，`get-journal-block` 会自动创建。

**所有步骤：日期**
- 日期相关的 Orca 参数统一在 `infra` 的一个模块里构造，两种格式明确区分：
  - 取日记：`get-journal-block` 传本地时间的 `Date`；
  - 导航到日记：`nav.goTo/replace("journal", { date })` 传本地日期对应的 UTC 零点。
- `domain/time` 只用本地日期（年、月、日）表示"哪一天"，不使用 `Date`。
- **只读的场景不能调用 `get-journal-block`**，比如判断某天有没有日记、显示某天的任务，否则会凭空创建空日记。按日期筛选任务时，用任务自己的日期属性查询（#13）。

## 验证代码

```js
(async () => {
  const TAG = "NA验证标签改名";
  const R = { steps: {}, ids: {} }; window.__naSpike9 = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const getJ = (d) => orca.invokeBackend("get-journal-block", d);
  const reprOf = (b) => b?.properties?.find((p) => p.name === "_repr")?.value;
  const jinfo = (b) => b ? { id: b.id, parent: b.parent ?? null, childCount: b.children?.length, lastChild: b.children?.at(-1),
    repr: reprOf(b), text: b.text, aliases: b.aliases, inState: !!orca.state.blocks[b.id] } : b;
  const binfo = (b) => b && { id: b.id, parent: b.parent, left: b.left, text: b.text,
    tagData: b.refs?.filter((r) => r.type === 2).map((r) => ({ alias: r.alias, data: r.data?.map((d) => [d.name, d.value]) })) };
  const pad = (n) => String(n).padStart(2, "0");
  const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(400);
  };
  const appendTask = async (journalId, text) => {
    let id;
    await orca.commands.invokeGroup(async () => {
      const j = orca.state.blocks[journalId] ?? await get(journalId);
      id = await ed("core.editor.insertBlock", j, "lastChild", [{ t: "t", v: text }]);
      await ed("core.editor.insertTag", id, TAG);
    });
    return id;
  };

  await step("J1_今天的日记", async () => {
    const now = new Date();
    const j = await getJ(now);
    R.ids.today = j?.id;
    return { localNow: local(now), tzOffsetMin: now.getTimezoneOffset(), journal: jinfo(j) };
  });

  await step("J2_不存在的日期", async () => {
    const d = new Date(2027, 2, 15, 10, 0);
    const first = await getJ(d);
    await sleep(800);
    const second = await getJ(d);
    R.ids.future = second?.id ?? first?.id;
    return { date: local(d), first: jinfo(first), second: jinfo(second) };
  });

  await step("J3_同一天不同时刻", async () => {
    const out = [];
    for (const [h, m] of [[0, 30], [2, 0], [7, 30], [12, 0], [23, 30]]) {
      const d = new Date(2027, 2, 16, h, m);
      const j = await getJ(d);
      out.push({ local: local(d), utc: d.toISOString(), id: j?.id ?? null, reprDate: reprOf(j)?.date });
    }
    return out;
  });

  await step("J4_追加到今天日记末尾", async () => {
    const before = jinfo(await get(R.ids.today));
    const id = await appendTask(R.ids.today, "NA捕获测试（#9，可删除）");
    R.ids.captured = id;
    await sleep(400);
    const after = jinfo(await get(R.ids.today));
    return { before, after, isLast: after?.lastChild === id, block: binfo(await get(id)) };
  });

  await step("J5_追加到未打开的日记", async () => {
    if (!R.ids.future) return "跳过：J2 没有得到日记块";
    const wasInState = !!orca.state.blocks[R.ids.future];
    const id = await appendTask(R.ids.future, "NA捕获测试（未打开的日记）");
    await sleep(400);
    const j = await get(R.ids.future);
    return { wasInState, id, isLast: j?.children?.at(-1) === id, block: binfo(await get(id)) };
  });

  await step("J6_一次撤销", async () => {
    const id = await appendTask(R.ids.today, "NA撤销测试（#9）");
    await sleep(1000);
    const before = binfo(await get(id));
    await orca.commands.invokeCommand("core.editor.undo");
    await sleep(2000);
    const after = await get(id);
    const j = await get(R.ids.today);
    return { id, before, afterExists: !!after, after: binfo(after), stillInJournal: !!j?.children?.includes(id) };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 结果已复制到剪贴板"); } catch { console.log(out); }
  console.log(R);
})();
```

## 实际返回（摘录）

- J1：本地时间 2026-10-06 23:51，`tzOffsetMin: -480`；今天的日记为 207，`parent: null`，`text: null`，`_repr: { type: "journal", date: "2026-10-06T00:00:00.000Z" }`。
- J2：2027-03-15 10:00 → 两次都返回块 246，`childCount: 0`，`_repr.date: "2027-03-15T00:00:00.000Z"`，`inState: false`。
- J3：本地 2027-03-16 五个时刻（UTC 从 03-15T16:30Z 到 03-16T15:30Z）全部返回块 247，`reprDate: "2027-03-16T00:00:00.000Z"`。
- J4：新块 248，`parent: 207`，`left: 208`，是日记的最后一个子块；`text` 为 `NA捕获测试（#9，可删除） #NA验证标签改名,收集箱,4`。
- J5：日记 246 原本不在 state 中；新块 249，`parent: 246`，是最后一个子块，状态为收集箱。
- J6：撤销前块 250 存在于日记 207 的末尾；一次撤销后 `afterExists: false`，`stillInJournal: false`。

界面观察：
- 今天日记的最后一个块是"NA捕获测试（#9，可删除）"，没有状态图标（#8 的样式已移除）。
- `orca.nav.goTo("journal", { date: new Date(2027, 2, 15) })` 打开的是 3 月 14 日；改为 `new Date(2027, 2, 16)` 才打开 3 月 15 日，里面有"NA捕获测试（未打开的日记）"。
