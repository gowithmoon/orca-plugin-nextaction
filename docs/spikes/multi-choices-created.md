# 技术验证：多选属性写入不在选项里的值；块的创建时间

> 第四步补测。2026-10-08 在测试笔记库中运行（Windows，UTC+8）。共四段。状态：**已完成**。

## 问题

- 多选属性（上下文、标记）写入标签定义 `choices` 里没有的值时，Orca 是否保存、是否显示，是否自动把它补进 `choices`
- `get-block`、`get-blocks` 返回的 `created` 是什么类型

## 结论

### 不在选项里的值（第一段）

- **能存，但不显示。** 用 `insertTag` 或 `setRefData` 写入不在 `choices` 里的值，都原样存进了任务块标签引用的 `data`（`["@home", "@新值2"]`、`["@新值1", "@新值3"]`）。
- 但界面上块"NA多选测试A"只显示 `@home`（在 `choices` 里的那个），原生属性编辑器里也只有它（界面已确认）。
- Orca **不会**把这些值自动补进标签定义的 `choices`：写入后两个属性的 `choices` 仍是 `[]` 和 `[@home]`。
- 结论：插件写入新的上下文或标记时，必须先把它补进任务标签对应属性的 `choices`，否则用户在笔记里看不到它。

### 补进选项之后（第二段）

- **把值补进 `choices` 后，已存的值立即显示。** 块 A 的"有选项"原本存着 `["@home", "@新值2"]` 但只显示 `@home`；只给标签补上 `@新值2` 这个选项（传完整 `typeArgs` 和 `pos`），不改块 A，界面就显示两个值，原生属性编辑器里也能选到（界面已确认）。
- 在同一个 `invokeGroup` 里先补选项、再 `setRefData` 写值，两步都生效：`choices` 变为 `[@新值4]`，块 A 的值为 `["@新值4"]`，界面显示正常。
- 第二段写入后，用户先在界面上查看了块和原生编辑器，再在控制台调用一次 `core.editor.undo` 并等 2 秒：`choices` 和块 A 的值都没有变，界面上 `@新值4` 仍在。

### 撤销（第三段）

- **写入后立刻用代码撤销，一次就撤掉整组。** 补选项 `@新值5` 加写值的 `invokeGroup` 之后，调用一次 `core.editor.undo` 并等 2 秒：`choices` 回到 `[@新值4]`，块 A 的值回到 `["@新值4"]`。补选项和写值是同一个撤销单元。
- 紧接着再撤销一次，什么都没变：更早的那组（第二段的 `@新值4`）没有被撤回。
- **用户手动 Ctrl+Z 没有撤销。** 再写一组 `@新值6`，用户点一下笔记编辑器（不输入）后按一次 Ctrl+Z，等 2 秒：`choices` 和值都还是 `@新值6`。
- 这一段没有记录 Ctrl+Z 是否真的触发了 `core.editor.undo`，原因由第四段排查。

### 手动撤销（第四段）

- **用户按一次 Ctrl+Z，补选项和写值一起被撤回。** 只开一个面板、打开块 A，用户点一下面板后按 Ctrl+Z：
  - 对照组（`invokeGroup` 里只写值）：值从 `["@home"]` 回到 `["@home", "@新值2"]`。
  - 补选项加写值：`choices` 从 `[@新值4, @新值6, @新值7]` 回到 `[@新值4, @新值6]`，值从 `["@新值7"]` 回到 `["@新值6"]`。
  - 两次都由命令后钩子记录到一次 `core.editor.undo`，写入时和撤销时的活动面板是同一个。
- 结论：修改标签定义（`setProperties`）和写值放进同一个 `invokeGroup`，代码撤销和用户的 Ctrl+Z 都会一次撤回整组，与 `tag-operations` 的结论一致。
- 第三段手动撤销失败，最可能的原因是那次 Ctrl+Z 没有到达 Orca 的编辑器（焦点仍在开发者工具等处），那一段没有钩子记录，无法确认。
- 未解释的现象：第二段之后的代码撤销，以及第三段的第二次代码撤销，都没有撤回更早的那组写入（`@新值4`）。两次之间用户都在界面上操作过。撤销历史在什么情况下被截断没有验证；插件的设计只依赖"撤销最近一次写入"，不依赖更早的历史。

## 对第四步的影响

- 任务属性面板写入上下文或标记时，在同一个 `invokeGroup` 中：先把列表里不在 `choices` 中的值补进任务标签对应属性的 `choices`（传完整 `typeArgs` 和 `pos`，只增不改，符合 ADR 0008），再写入值。用户一次撤销撤回两步。
- 补进 `choices` 后，原本存着却不显示的值也会显示出来，所以每次写入都检查整张列表，而不只检查新加的值。
- 收集箱按块的 `created` 排序，`created` 是 `Date`，不需要转换。

### 创建时间

- `get-block` 和 `get-blocks` 返回的 `created` 都是 `Date` 对象（`instanceof Date` 为 `true`），值是本地时刻。

## 待补测

| | 问题 | 状态 |
|---|---|---|
| 2 | 把已存的值补进 `choices` 后能否显示；补选项和写值放进同一个 `invokeGroup` 能否一次撤销 | 显示：已解决（第二段）。撤销：结果不明 |
| 3 | 补选项 + 写值的 `invokeGroup`，写入后立刻用代码撤销、以及用户手动 Ctrl+Z，各撤掉了什么 | 已完成：代码撤销一次撤掉整组；手动 Ctrl+Z 没有撤销，原因见第四段 |
| 4 | 手动 Ctrl+Z 没撤销的原因 | 已解决：对照组和补选项组都被一次 Ctrl+Z 撤回 |

## 验证代码（第一段）

见 `.scratch/spikes/18-multi-choices-created.js`：新建标签"NA多选测试"，含 `choices` 为空和只有 `@home` 的两个多选属性；新建块 A，先用 `insertTag`、再用 `setRefData` 写入不在 `choices` 里的值，读回标签定义、`data` 和 `created`。

第二段见 `.scratch/spikes/18b-add-choice.js`：先只给"有选项"补 `@新值2`；再在一个 `invokeGroup` 里给"空选项"补 `@新值4` 并把块 A 的值写成 `["@新值4"]`；最后调用一次 `core.editor.undo`，等 2 秒读回。

## 实际返回（第一段）

```json
{
  "ids": { "tagId": 269, "a": 270 },
  "tagPropsAfter": [
    { "name": "空选项", "type": 6, "typeArgs": { "subType": "multi", "choices": [] } },
    { "name": "有选项", "type": 6, "typeArgs": { "subType": "multi", "choices": [{ "n": "@home", "c": "" }] } }
  ],
  "taskData": [
    { "name": "有选项", "value": ["@home", "@新值2"] },
    { "name": "空选项", "value": ["@新值1", "@新值3"] }
  ],
  "created": {
    "getBlock": { "value": "Thu Oct 08 2026 20:56:56 GMT+0800 (中国标准时间)", "type": "object", "isDate": true },
    "getBlocks": { "value": "Thu Oct 08 2026 20:56:56 GMT+0800 (中国标准时间)", "type": "object", "isDate": true }
  }
}
```

## 实际返回（第二段）

```json
{
  "step1": { "choices": ["@home", "@新值2"], "data": { "有选项": ["@home", "@新值2"], "空选项": ["@新值1", "@新值3"] } },
  "step2": { "choices": ["@新值4"], "data": { "有选项": ["@home", "@新值2"], "空选项": ["@新值4"] } },
  "afterUndo": { "choices": ["@新值4"], "data": { "有选项": ["@home", "@新值2"], "空选项": ["@新值4"] } }
}
```

（`choices` 只列出选项名，原始返回中每项还带 `"c": ""`。）

## 实际返回（第三段）

```json
{
  "before":           { "空选项": { "choices": ["@新值4"], "value": ["@新值4"] } },
  "afterGroup":       { "空选项": { "choices": ["@新值4", "@新值5"], "value": ["@新值5"] } },
  "afterUndo1":       { "空选项": { "choices": ["@新值4"], "value": ["@新值4"] } },
  "afterUndo2":       { "空选项": { "choices": ["@新值4"], "value": ["@新值4"] } },
  "manualAfterGroup": { "空选项": { "choices": ["@新值4", "@新值6"], "value": ["@新值6"] } },
  "manualAfterUndo":  { "空选项": { "choices": ["@新值4", "@新值6"], "value": ["@新值6"] } }
}
```

（"有选项"在各次读取中都是 `choices: [@home, @新值2]`、`value: ["@home", "@新值2"]`，省略。）

## 实际返回（第四段）

```json
{
  "control": {
    "activePanelAtWrite": "QV0QEKft1h",
    "afterWrite": { "有选项": { "choices": ["@home", "@新值2"], "value": ["@home"] } },
    "afterUndo":  { "有选项": { "choices": ["@home", "@新值2"], "value": ["@home", "@新值2"] } },
    "undoHook": [{ "at": "2026-10-08T13:23:41.544Z", "activePanel": "QV0QEKft1h" }]
  },
  "withChoice": {
    "activePanelAtWrite": "QV0QEKft1h",
    "afterWrite": { "空选项": { "choices": ["@新值4", "@新值6", "@新值7"], "value": ["@新值7"] } },
    "afterUndo":  { "空选项": { "choices": ["@新值4", "@新值6"], "value": ["@新值6"] } },
    "undoHook": [{ "at": "2026-10-08T13:24:42.579Z", "activePanel": "QV0QEKft1h" }]
  }
}
```

（各组中没有改动的另一个属性省略。）
