# 技术验证：Orca 原生提醒

> Issue #10。2026-10-07 00:03（本地时间，UTC+8）在测试笔记库中运行（Windows）。状态：**已完成**。本文只收集事实，提醒方案的决策留到路线图第十步。

## 问题

- Orca 原生提醒的数据结构和存储位置（`get-remindings` 的返回）
- 能否用代码给块设置、修改、删除提醒
- 提醒触发时的行为

## 结论

### 数据结构

- **原生提醒就是一个系统标签 `Reminder`。** 标签块的 ID 是 1，它是一个没有父块的根级块，有别名 `Reminder`。中文界面下也叫这个名字，搜索"提醒"找不到别名（P3）。
- 这个标签有四个属性：

  | 属性名 | 类型 | 说明 |
  |---|---|---|
  | `Date time` | DateTime（datetime） | 提醒时间 |
  | `Repeat every` | Text | 重复间隔，占位提示为 `1m; m=minute, h=hour, d=day, w=week, M=month, y=year` |
  | `Repeat until` | DateTime（datetime） | 重复截止时间 |
  | `Cron` | Text | cron 表达式，占位提示为 `0 9 * * *` |

  标签块上还有 `_show: ["Date time"]`。推测它是 #5 第二轮里见过的那个 `_show` 的用途：控制哪些属性直接显示在块上（推断，没有验证）。
- 给块设置提醒，就是给块打上 `Reminder` 标签，并把 `Date time` 写进标签引用的 `data`。时间存为 UTC 的 ISO 字符串，同时会生成一条指向当天日记的 RefData 引用，与 #5 中任务的日期属性是同一套机制（P2）。

### `get-remindings`

- `get-remindings(开始, 结束)` 返回 `[{ id, date }]`，`id` 是块 ID，`date` 是提醒时间的毫秒时间戳（P1）。
- 用代码打上标签之后，大约 1 秒内这个提醒就出现在 `get-remindings` 的结果里了（P4 `inRemindings: true`）。

### 用代码设置提醒

- 用 `insertTag(块, "Reminder", [{ name: "Date time", type: 5, value: Date }])` 设置提醒，与界面上手动设置的完全一样：块的结构相同，界面上看不出区别，到时间也会照常提醒（P4，用户确认）。
- 由此推断：修改提醒用 `setRefData` 改 `Date time`，删除提醒用 `removeTag(块, "Reminder")`，与 #5 中任务标签的行为相同。这两点没有单独验证。

### 提醒触发

- 到时间后，弹出一条**系统通知**。标题是"虎鲸笔记提醒"，内容是块的文本（含标签名，如 `NA提醒样本（#10） #Reminder`）。手动设置和代码设置的提醒，通知格式完全一样（用户确认）。
- 点击通知会怎样、Orca 没有运行时提醒会不会补发、重复规则（`Repeat every`、`Cron`）的效果，都没有验证。

### 设置

- `orca.state.settings[46]`（`ReminderAlertOffsets`）的结果没有出现在返回中，P3 只返回了别名。推测这个设置项与提前提醒有关（推断）。

### 第十步补测（2026-10-12，Windows，脚本 `.scratch/spikes/step10-reminder.js`）

- **修改提醒**：`setRefData(Reminder 标签引用, [{ name: "Date time", type: 5, value: Date }])` 后，`get-remindings` 立即跟着变成新时刻，到新时刻照常弹出通知（S4）。
- **移除提醒**：`removeTag(块, "Reminder")` 后，`get-remindings` 中不再有这个块，原定时刻没有弹出通知（S5）。
- **任务块上的原生提醒**：块上同时有任务标签和 `Reminder` 标签时，到时照常弹出通知（S3）。
- **点击原生通知**：Orca 定位到笔记中的对应块（用户确认）。
- **插件自己发系统通知**：渲染进程中的网页 `Notification` 可以使用，不需要申请权限，弹出的是系统通知（S1）。Orca 在前台时，3 分钟的 `setTimeout` 晚了 6 ms（S2，`visibility: "visible"`；最小化时的表现没测到）。点击插件发出的通知，没有记录到 `onclick`。
- 读回的 `Date time` 带 `typeArgs: { subType: "datetime" }`。

### 第十步补测二：Orca 最小化时（2026-10-12，Windows，Orca 1.97.1 / Electron 42.7.0，脚本 `.scratch/spikes/step10-background.js`）

- **单次长 `setTimeout` 准时**：最小化（`visibility: "hidden"`）期间，12 分钟的 `setTimeout` 晚了 142 ms，系统通知照常弹出（`onshow`）。
- **`setInterval` 被节流**：隐藏约 3 分钟后，30 秒的间隔变成 60 秒左右（其中一次 85 秒），即每分钟最多一次。靠轮询计时最多晚约 1 分钟；用"只为最近的提醒设一次 `setTimeout`"不受影响。
- **点击插件发出的系统通知，Orca 没有回到前台**：没有记录到 `onclick`；点击后约 1 分钟记录到 `onclose`。`onclose` 是点击引起的，还是通知超时进入通知中心引起的，分不出来。用户随后自己切回 Orca。
- 对比：原生 `Reminder` 的通知由 Orca 主进程发出，点击后会定位到块。

### 第十步补测三：通知的事件与把窗口带到前台（2026-10-12，同上环境，脚本 `.scratch/spikes/step10-click.js`）

- **点击还在屏幕上的通知会触发 `onclick`**（A，弹出 2 秒后点击），但 Orca 不会因此回到前台。
- **点 × 和等它自己消失都触发 `onclose`**（B 4 秒后，C 约 6 秒后），两者分不出来。Windows 的通知弹出约 6 秒后自动收起。
- 补测二点击时没有 `onclick`、约 1 分钟后才有 `onclose`：那次通知带 `requireInteraction`，推测点击时它已经收进了通知中心，从通知中心点击不触发 `onclick`（推断，没有单独验证）。
- **`core.global.toggleWindow` 能把最小化的 Orca 带到前台**：调用后立即 `visibility: "visible"`、窗口获得焦点。插件调用时不需要用户操作。

### 第十步补测四：点击通知后带到前台并定位（2026-10-12，同上环境，脚本 `.scratch/spikes/step10-locate.js`）

- **在 `onclick` 里调 `toggleWindow`，最小化（A）和被别的窗口完全挡住（B）时，Orca 都回到了前台**，没有出现反而被藏起来的情况。
- **Windows 上被完全挡住的窗口也报告 `visibility: "hidden"`**（B 点击时），与最小化分不出来。
- 紧接着 `orca.nav.goTo("block", { blockId: 69 }, orca.state.activePanel)` 看起来没有跳转：69 是当天的日记块（`TARGET` 为空时的取值），活动面板本来就显示着它。补测五改用任务块后确认跳转正常。

### 第十步补测五：定位到任务块；可见但没有焦点时（2026-10-12，同上环境，脚本 `.scratch/spikes/step10-goto.js`）

- **点击通知 → `toggleWindow` → `goTo` 能定位到任务块**：最小化（A）和可见但没有焦点（B）两种情况，Orca 都回到前台并获得焦点，活动面板立即显示目标任务块 48（`viewArgs.blockId: 48`），不需要等待或再次调用（用户确认）。
- **Orca 可见但没有焦点时，`toggleWindow` 把它带到前台，不会藏起来**（B，`visibility: "visible"`、`focus: false` 时调用）。没有测 Orca 已有焦点时调用；做法是只在 `document.hasFocus()` 为假时调用。
- 结论：通知还在屏幕上时点击，可以把 Orca 带到前台并定位到任务块；收进系统通知中心后再点，不触发 `onclick`（补测二、三），这时什么都不做。

## 对后续步骤的影响

**第十步：提醒（决策留到那时）**
- 复用原生提醒在技术上可行：插件只需在任务块上同时打上 `Reminder` 标签。这样不需要自己实现定时器、通知和错过补发，重复规则也由 Orca 处理。
- 复用的代价：
  - 提醒的数据在任务标签之外，是另一个标签。用户在 Orca 里直接移除 `Reminder` 标签，提醒就没了，插件不会察觉。
  - 通知的内容是块的文本，会带上任务标签及其属性值。
  - 提醒的重复规则和第八步重复任务的重复规则，是两套独立的东西。
- 自己实现的话，要在 Orca 运行时自行计时，并通过 `orca.notify` 或系统通知提醒，Orca 没在运行时提醒不了。
- 第十步开始时，补测上面"没有验证"的几点。

**第二步起：查询**
- 用户的任务块上可能同时有 `Reminder` 标签。编解码时只读任务标签的引用，靠 `to === 任务标签块 ID` 区分，不能假设块上只有一个标签。

## 验证代码

运行前，先在界面上给一个文字为"NA提醒样本（#10）"的块设置提醒。

```js
(async () => {
  const R = { steps: {} }; window.__naSpike10 = R;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = (id, ...args) => orca.commands.invokeEditorCommand(id, null, ...args);
  const get = (id) => orca.invokeBackend("get-block", id);
  const full = (b) => b && { id: b.id, parent: b.parent, text: b.text,
    properties: b.properties?.map((p) => ({ name: p.name, type: p.type, typeArgs: p.typeArgs, value: p.value })),
    refs: b.refs?.map((r) => ({ id: r.id, to: r.to, type: r.type, alias: r.alias,
      data: r.data?.map((d) => ({ name: d.name, type: d.type, typeArgs: d.typeArgs, value: d.value })) })) };
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); } catch (e) { R.steps[name] = { error: String(e?.stack ?? e) }; }
    await sleep(300);
  };
  const idOf = (x) => (x && typeof x === "object" ? (x.blockId ?? x.id ?? x.block?.id) : x);
  const now = new Date();
  const range = [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() + 2, 0, 1)];

  let list = [];
  await step("P1_get-remindings", async () => {
    list = await orca.invokeBackend("get-remindings", ...range);
    return { type: Array.isArray(list) ? "array" : typeof list, length: list?.length,
      firstItem: list?.[0], firstKeys: list?.[0] && typeof list[0] === "object" ? Object.keys(list[0]) : null,
      all: list?.slice(0, 20) };
  });

  let sample;
  await step("P2_样本块", async () => {
    const ids = (list ?? []).map(idOf).filter(Boolean);
    for (const id of ids) { const b = await get(id); if (b?.text?.includes("NA提醒样本")) { sample = b; break; } }
    if (!sample) {
      const hits = await orca.invokeBackend("search-blocks-by-text", "NA提醒样本");
      const id = Array.isArray(hits) ? idOf(hits[0]) : null;
      if (id) sample = await get(id);
    }
    if (!sample) return "没有找到样本块，请确认块文字里包含“NA提醒样本”";
    return { foundVia: ids.includes(sample.id) ? "get-remindings" : "search", block: full(sample),
      tagBlocks: await Promise.all((sample.refs ?? []).filter((r) => r.type === 2).map(async (r) => full(await get(r.to)))) };
  });

  await step("P3_设置与别名", async () => ({
    reminderAlertOffsets: orca.state.settings?.[46],
    aliases: await orca.invokeBackend("search-aliases", "remind"),
    aliasesZh: await orca.invokeBackend("search-aliases", "提醒"),
  }));

  await step("P4_代码设置提醒", async () => {
    if (!sample) return "跳过：没有样本";
    const at = new Date(Date.now() + 3 * 60 * 1000);
    const journal = await orca.invokeBackend("get-journal-block", new Date());
    let id;
    await orca.commands.invokeGroup(async () => {
      id = await ed("core.editor.insertBlock", orca.state.blocks[journal.id] ?? journal, "lastChild",
        [{ t: "t", v: "NA提醒代码测试（#10，3 分钟后）" }]);
      for (const r of (sample.refs ?? []).filter((r) => r.type === 2)) {
        const data = (r.data ?? []).map((d) => ({ name: d.name, type: d.type, value: d.type === 5 ? at : d.value }));
        await ed("core.editor.insertTag", id, r.alias, data);
      }
    });
    await sleep(800);
    const after = await orca.invokeBackend("get-remindings", new Date(Date.now() - 60000), new Date(Date.now() + 3600000));
    R.copyId = id;
    return { id, alertAt: at.toString(), block: full(await get(id)),
      inRemindings: (after ?? []).map(idOf).includes(id), remindingsSoon: after };
  });

  const out = JSON.stringify(R, null, 2);
  try { copy(out); console.log("✅ 结果已复制到剪贴板。请等 3 分钟，看是否收到提醒"); } catch { console.log(out); }
  console.log(R);
})();
```

## 实际返回（摘录）

- P1：`[{ "id": 252, "date": 1791302760000 }]`（键为 `id`、`date`）。
- P2：样本块 252 位于日记 251 下，`text` 为 `NA提醒样本（#10） #Reminder,2026-10-07 00:06`。
  - 标签引用：`{ id: 233, to: 1, type: 2, alias: "Reminder", data: [ { name: "Date time", type: 5, value: "2026-10-06T16:06:00.000Z" } ] }`
  - RefData 引用：`{ id: 234, to: 251, type: 3 }`
  - 标签块 1：`text: "Reminder"`，属性为 `Date time`（type 5）、`Repeat every`（type 1）、`Repeat until`（type 5）、`Cron`（type 1）、`_repr`、`_show: ["Date time"]`。
- P3：`search-aliases("remind")` 返回 `[{ id: 1, name: "Reminder", type: 0 }]`，`search-aliases("提醒")` 返回 `[]`。
- P4：代码块 253，`text` 为 `NA提醒代码测试（#10，3 分钟后） #Reminder,2026-10-07 00:07`，结构与样本相同；`inRemindings: true`，`remindingsSoon` 为 `[{ id: 252 }, { id: 253, date: 1791302843000 }]`。

界面观察：
- 两个块在界面上没有区别，都是文本加 `Reminder` 标签。
- 到时间后都弹出了系统通知，标题"虎鲸笔记提醒"，内容是块文本（含 `#Reminder`），两者格式完全一样。
