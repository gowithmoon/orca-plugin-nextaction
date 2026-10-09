# 技术验证：快速捕获带初始属性写入；圆角与阴影变量

> Issue #49（#45 界面打磨）。2026-10-09 在测试笔记库中运行（UTC+8）。状态：**已完成**。

## 问题

- 新建块后立即用 `insertTag` 带上重要性、开始日期、截止日期，能否写对；没带的属性是否取默认值
- 新建块和带值的 `insertTag` 在一个 `invokeGroup` 里，一次撤销能否全部撤回
- `--orca-radius-md` 和 `--orca-shadow-popup` 这两个 CSS 变量是否存在

## 结论

- **带值的 `insertTag` 写对了。** 日期属性传本地零点的 `Date`（`{ type: 5, value: new Date(2026, 9, 12) }`），存为该本地零点（打印为 `2026-10-11T16:00:00.000Z`），与 `date-subtype` 一致。重要性存为 6。
- **没带的属性取默认值**：状态为"收集箱"，工作量为 4，与 `inbox-anomalous-status` 一致。所以快速捕获只写用户设定过的属性。
- **一次撤销全部撤回。** 在日记中按一次 Ctrl+Z 后，`get-block` 取不到新块（`false`），新建块、打标签和属性一起消失，与 `journal-capture` J6 一致。
- **两个变量都存在**：`--orca-radius-md` 为 `6px`；`--orca-shadow-popup` 为 `rgba(15, 15, 15, .08) 0px 0px 0px 1px, rgba(15, 15, 15, .03) 0px 2px 4px, rgba(15, 15, 15, .06) 0px 5px 20px`（当前主题下的值）。样式中可以直接使用，不需要回退值。

## 对后续步骤的影响

- 快速捕获：在原来的 `invokeGroup` 里，用 `insertTag(新块, 任务标签, 已设定的属性)` 一次写入，未设定的属性不传。
- 样式：卡片、导航、窗口的圆角用 `--orca-radius-md`，弹窗阴影用 `--orca-shadow-popup`。

## 验证代码

```js
(async () => {
  const ed = (id, ...a) => orca.commands.invokeEditorCommand(id, null, ...a);
  const s = getComputedStyle(document.documentElement);
  console.log("radius-md:", JSON.stringify(s.getPropertyValue("--orca-radius-md")),
              "shadow-popup:", JSON.stringify(s.getPropertyValue("--orca-shadow-popup")));
  const j = await orca.invokeBackend("get-journal-block", new Date());
  let id;
  await orca.commands.invokeGroup(async () => {
    id = await ed("core.editor.insertBlock", j, "lastChild", [{ t: "t", v: "NA捕获属性测试（#49）" }]);
    await ed("core.editor.insertTag", id, "任务", [
      { name: "重要性", value: 6 },
      { name: "开始日期", type: 5, value: new Date(2026, 9, 12) },
      { name: "截止日期", type: 5, value: new Date(2026, 9, 20) },
    ]);
  });
  const b = await orca.invokeBackend("get-block", id);
  console.log("写入后", b.refs.filter((r) => r.type === 2).map((r) => r.data.map((d) => [d.name, d.value])));
  // 然后在日记中按一次 Ctrl+Z，再运行：
  // orca.invokeBackend("get-block", id).then((x) => console.log("撤销后还在吗", !!x))
})();
```

## 实际返回

```
radius-md: "6px" shadow-popup: "rgba(15, 15, 15, .08) 0px 0px 0px 1px, rgba(15, 15, 15, .03) 0px 2px 4px, rgba(15, 15, 15, .06) 0px 5px 20px"
写入后 [[["工作量",4],["开始日期","2026-10-11T16:00:00.000Z"],["截止日期","2026-10-19T16:00:00.000Z"],["状态","收集箱"],["重要性",6]]]
撤销后还在吗 false
```
