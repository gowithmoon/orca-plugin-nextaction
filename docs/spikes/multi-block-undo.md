# 技术验证：一个 `invokeGroup` 写多个块的撤销

> Issue #90（第八步 重复任务：子任务随父任务重置）。状态：已实测（2026-10-11，用户在测试笔记库中运行）。

## 问题

安排下一次时，插件在一个 `invokeGroup` 里依次写父任务（`setRefData` 改状态和日期、`setProperties` 写完成历史）和每个被重置的后代任务（`setRefData` 改状态和日期）。需要确认：

- M1 一次 Ctrl+Z 是否把父任务和全部子任务一起还原（状态、日期、`nextaction.completions`）
- M2 写入顺序（先父后子 / 先子后父）是否影响写入结果和撤销
- M3 从插件面板（隐藏编辑器，ADR 0014）写入时，在插件面板里按一次 Ctrl+Z 是否同样全部还原

已有结论只覆盖了**同一个块**的多步写入（`tag-operations` F1/F2、`capture-initial-properties`），以及放弃时**多个依赖方块**的 `setRefData` 加 `removeTag`（`next-action-hierarchy-boolean-deps`，一次撤销全部恢复）。后者已经是多块，所以 M1 大概率成立，但没有测过"多个块各自 `setRefData` 改日期"和写入顺序。

## 实测前的预期

- M1：一次撤销全部还原。
- M2：顺序不影响结果。实现按"父任务在前、后代任务按笔记顺序在后"写入（`orca-task-repository.ts` 的 `updateTasks`）。

## 验证代码

在测试笔记库中，打开今天的日记，按 F12 打开开发者工具，把下面的代码粘进 Console 运行。任务标签名按中文笔记库写作"任务"，英文笔记库把 `TAG`、属性名、选项改成英文（`Task`、`Status`、`Due`、`Todo`、`Done`）。

```js
(async () => {
  const TAG = "任务", STATUS = "状态", DUE = "截止日期", TODO = "待开始", DONE = "已完成";
  const ed = (id, ...a) => orca.commands.invokeEditorCommand(id, null, ...a);
  const get = (id) => orca.invokeBackend("get-block", id);
  const tagRef = async (id) => {
    const b = await get(id);
    return b.refs.find((r) => r.type === 2 && r.alias === TAG) ?? b.refs.find((r) => r.type === 2);
  };
  const show = async (label, ids) => {
    const rows = [];
    for (const id of ids) {
      const b = await get(id);
      const r = b && b.refs.find((x) => x.type === 2);
      rows.push({
        id,
        status: r?.data?.find((d) => d.name === STATUS)?.value,
        due: String(r?.data?.find((d) => d.name === DUE)?.value),
        completions: JSON.stringify(b?.properties?.find((p) => p.name === "nextaction.completions")?.value ?? null),
      });
    }
    console.log(label); console.table(rows);
  };
  // 准备：父任务和两个子任务，全部已完成，各带截止日期。
  const j = await orca.invokeBackend("get-journal-block", new Date());
  const ids = {};
  await orca.commands.invokeGroup(async () => {
    ids.p = await ed("core.editor.insertBlock", j, "lastChild", [{ t: "t", v: "NA多块撤销-父" }]);
    ids.c1 = await ed("core.editor.insertBlock", ids.p, "lastChild", [{ t: "t", v: "NA多块撤销-子1" }]);
    ids.c2 = await ed("core.editor.insertBlock", ids.p, "lastChild", [{ t: "t", v: "NA多块撤销-子2" }]);
    for (const [id, day] of [[ids.p, 12], [ids.c1, 11], [ids.c2, 10]]) {
      await ed("core.editor.insertTag", id, TAG, [
        { name: STATUS, value: DONE },
        { name: DUE, type: 5, value: new Date(2026, 9, day) },
      ]);
    }
  });
  const all = [ids.p, ids.c1, ids.c2];
  await show("准备好之后（全部已完成）", all);
  // 写入：一个 invokeGroup 里，ORDER 决定先父后子还是先子后父。
  window.__naMulti = { ids, all, show, run: async (order) => {
    const seq = order === "children-first" ? [ids.c2, ids.c1, ids.p] : [ids.p, ids.c1, ids.c2];
    await orca.commands.invokeGroup(async () => {
      for (const id of seq) {
        const day = id === ids.p ? 19 : id === ids.c1 ? 18 : 17;
        await ed("core.editor.setRefData", await tagRef(id), [
          { name: STATUS, value: TODO },
          { name: DUE, type: 5, value: new Date(2026, 9, day) },
        ]);
        if (id === ids.p) {
          await ed("core.editor.setProperties", [id], [
            // As the plugin writes it: PropType.JSON (0), the value an object (block-properties-json J1).
            { name: "nextaction.completions", type: 0, value: { v: 1, entries: [{ at: new Date().toISOString(), day: "2026-10-12" }] } },
          ]);
        }
      }
    });
    await show(`写入后（${order}）`, all);
  } };
  console.log("下一步：运行 __naMulti.run('parent-first')");
})();
```

依次执行，每一步把 Console 的输出贴回来：

1. 运行上面的代码，记下"准备好之后"的表。
2. 运行 `__naMulti.run('parent-first')`，记下"写入后"的表：三个块都应为待开始，截止日期分别为 10-19、10-18、10-17，父块有 `nextaction.completions`。
3. 点一下日记正文（让笔记面板成为活动面板），按**一次** Ctrl+Z，等一秒后运行 `__naMulti.show('撤销一次后', __naMulti.all)`。看三个块是否全部回到已完成、原来的截止日期，父块的 `nextaction.completions` 是否消失。
4. 再运行 `__naMulti.run('children-first')`，重复第 3 步。
5. 插件面板（M3）：装好本分支的插件，在"每周大扫除"这样的重复父任务下放两个已完成的子任务，从插件面板的卡片上完成父任务，然后在插件面板里按一次 Ctrl+Z，看父任务和子任务是否全部还原。笔记面板里同样试一次。

测完后删除这些测试块。

## 实际返回

用户运行了第 1–4 步（先父后子、先子后父两种顺序），并在插件面板和笔记面板中各做了第 5 步的手工测试，结果与预期一致（没有贴回 Console 的表格）：

- 每一种情形按一次 Ctrl+Z 都全部还原。
- 手工测试：从插件完成重复父任务，再按一次 Ctrl+Z，父任务回到完成前的待开始、截止日期为今天，两个子任务回到已完成。

## 结论

- M1 成立：一个 `invokeGroup` 里对多个块的 `setRefData` 加 `setProperties`，一次撤销全部还原，包括 `nextaction.completions`。
- M2 成立：先父后子、先子后父，写入结果和撤销都一样。实现保持"父任务在前、后代任务按笔记顺序在后"。
- M3 成立：从插件面板（隐藏编辑器）写入，在插件面板里按一次 Ctrl+Z 同样全部还原；笔记面板中亦然。

## 对后续步骤的影响

安排下一次的多块写入（`updateTasks`）按现在的做法保留，不需要改。
