# 技术验证：Orca Select 的 `filterFunction` 与额外选项

> 2026-10-21，块引用自定义属性的"添加 …"在 Orca 中不显示时补测，共两轮。状态：**已完成**。

## 问题

- `filterFunction` 返回 `options` 里没有的选项（如"添加 …"）时，Select 显示不显示，选中后 `onChange` 收到什么。
- Select 什么时候重新调用 `filterFunction`，什么时候把列表换回 `options`。

## 结论

- **`filterFunction` 返回的额外选项会显示**，同步、异步都可以；选中后 `onChange` 收到它的 `value`（v1 的 A–D）。
- **`options` 换成新数组时，打开着的列表被换回 `options` 本身**，`filterFunction` 刚返回的结果被丢掉：`options` 为空时"添加 zzz"一闪而过（v2 的 E、F；E 是每次渲染都给新的空数组 `[]`）。
- **`filterFunction` 换成新函数时，Select 用当前的搜索词再调用一次**：每秒重新渲染一次、每次都给新函数（G），5 秒里调用了 8 次；函数不变、只换内容相同的新 `options`（H），只在输入时调用。
- v1 的 D 在 `filterFunction` 里改 state、让 `options` 跟着变，结果是同一个搜索词被连续调用十几次。

## 对实现的影响

- `filterFunction` 要异步查询（每个搜索词去问 Orca）的地方：`options` 和 `filterFunction` 在重新渲染时都要保持同一个引用（`options` 用模块级常量，函数用 `useCallback`）。不要在 `filterFunction` 里改 state 来更新 `options`。
- 块引用自定义属性原来就犯了这两条：每次搜索后 `setFound` 换 `options`，同时 `filterFunction` 是每次渲染新建的。搜到结果时看不出问题，只是会多查一次；搜不到时列表被换回空的 `options`，"添加 …"一闪就没了。
- 依赖、所属项目的候选是事先读好的，`options` 只在候选变了才换，过滤在本地进行，不受影响。

## 验证代码

`.scratch/spikes/select-extra-option.js`（不纳入版本管理）。v1：`options` 为两个基础选项，A 同步、B 异步返回额外项，C 只返回额外项，D 同时把额外项放进 `options`。v2：E、F 的 `options` 为空（同步、异步）；G 的 `options` 不变、`filterFunction` 每次渲染新建；H 的 `filterFunction` 不变、`options` 每次渲染新建；组件每秒重新渲染一次。

## 实际返回（v2 摘要）

| 变体 | 调用次数 | 看到的 |
|---|---|---|
| E | 2 | "添加 zzz"一闪而过 |
| F | 4 | "添加 zzz"一闪而过 |
| G | 8（输入后每秒一次） | 无匹配 |
| H | 2（只在输入时） | 无匹配 |
