# 技术验证：斜杠命令调用插件命令

> #194（体验打磨 #189）。2026-10-17 用户在测试笔记库中运行（Windows，Orca 1.98.0）。状态：**已完成**。

## 问题

- 斜杠命令（`orca.slashCommands.registerSlashCommand`）指向插件的"转为任务"编辑器命令时，块里输入的"/…"会不会留下，撤销是否正常
- 普通命令（`registerCommand`，如"创建任务"）能不能挂在斜杠命令上

## 结论

- **指向编辑器命令可行。** 在有文字的块末尾输入 `/` 选"转为任务"：块变成任务，"/…"这段输入不留在块里（块内容只剩原来的文字 `[{ t: "t", v: "aaafff" }]`，带一条任务标签引用）。撤销正常，转为任务正常（用户确认）。
- **斜杠命令只能调用编辑器命令。** 指向普通命令 `orca-plugin-nextaction.quickCapture` 时，Orca 报错 `No command named "orca-plugin-nextaction.quickCapture" or it's not an editor command!`（来自 `invokeTopEditorCommand`），什么都不做。

## 对后续步骤的影响

- "转为任务"的斜杠命令直接指向已有的 `convertToTask` 编辑器命令。
- "创建任务"另登记一个编辑器命令，只负责打开创建任务窗口，不写笔记（撤销函数什么都不做），斜杠命令指向它。普通命令"创建任务"保留，供用户绑定快捷键。
- 斜杠命令和新的编辑器命令都经过注册表登记，卸载时释放。

## 验证代码

`.scratch/spikes/polish-slash.js`（贴在 #189 的评论里）：登记三个斜杠命令，分别指向 `convertToTask`、一个只记录收到的光标的编辑器命令、`quickCapture`；`__naSlash.check(blockId)` 读回块的 `text`、`content`、`refs`。

## 实际返回（摘录）

```json
{ "hasCommand": true,
  "runs": [{ "check": { "blockId": 1518, "text": "aaafff #任务,全部,4,收集箱,4,4\n",
    "content": [{ "t": "t", "v": "aaafff" }],
    "refs": [{ "type": 2, "to": 281, "alias": "任务" }] } }] }
```
