# 技术验证：Orca 的 AI 能力、把块读成文字、批量插入与块菜单多选

> 第十六步（#201）开工前。2026-10-18 在测试笔记库中运行（Windows，UTC+8，Orca 程序包版本 1.98.0，AI 对话模型 `deepseek-flash`，界面语言 zh-CN）。另有一部分结论来自阅读 Orca 程序包 `resources/app.asar` 中的源码，已注明。

## 问题

- 插件能用哪些官方 AI 能力，各自的限制（读源码）
- `orca.ai.sendMessage` 带插件工具时的返回结构；模型会不会调用插件工具、会不会调用 Orca 自己的工具；对 Orca 的工具回"不可用"后能否继续；多轮能否接着进行（A1–A3）
- `orca.ai.sendStreamMessage` 的分段内容与中止（A4、A5）；未配置、出错时的表现（读源码）
- 用 Orca 的 Markdown 转换器读一个块及其全部子块，任务块和嵌套是什么样（B）
- 在同一个块后面连续插入多个任务并打标签，一次撤销能否全部撤回；目标块不在 `orca.state.blocks` 中时插到哪里；把多行 Markdown 写进日记且不提取标签（C）
- 块菜单多选时拿到哪些块编号、什么顺序（D）

已有结论不再重复测：一个 `invokeGroup` 写多个块的撤销（`multi-block-undo`）；插入为某块的最后子块、追加到日记末尾并带属性一次撤销（`journal-capture`、`capture-initial-properties`）；单选、多选时块菜单显示哪些项（`official-task-menus`）；`moveBlocks` 目标块不在缓存中时落到根级（`move-blocks`）。

## 结论

### 三条官方途径（读源码）

- **插件自己调 `orca.ai`**：使用 Orca 设置中的 AI 对话配置（`AIChatBaseURL`、`AIChatAPIKey`、`AIChatModel`）。插件不接触密钥。Orca 每次都把它自己的对话工具放在插件的 `extraTools` 前面一起交给模型：`read_skills`、`call_commands`，以及 MCP 服务器连上时的全部 MCP 工具。插件执行不了这些工具，工具调用的循环由插件自己跑。官方插件 GotIt 就是这样用的：插件定义一个工具拿结构化结果，用流式接口拿长文字。
- **Orca 自带的 AI 对话**：技能是带 `AI Skill` 标签的块（系统提示里只列名称和描述，全文要模型调 `read_skills` 读），提示词是带 `AI Prompt` 标签的块（用 `/名称` 调用）。`call_commands` 能执行 `orca.state.commands` 中的任何命令（含插件命令），一次至多 20 个，参数是 JSON 数组，只返回成功或失败、拿不到返回值；编辑器命令以 `undoable: false` 执行，**写入不能撤销**。模型不知道有哪些命令，要靠技能写明。
- **Orca 的 MCP 服务器**：`http://localhost:18672/mcp`，带令牌。工具有 `query_blocks`、`get_blocks_text`、`get_tags_and_pages`、`get_page`、`get_journal`、`insert_markdown`、`batch_insert_blocks`、`insert_tags`、`remove_tags`、`create_tags`、`create_page`、`move_blocks`、`delete_blocks`、`search_web`、`fetch_webpage`。插件不能往上面注册工具。

### `orca.ai.sendMessage`（A1–A3）

- 返回完整的 OpenAI 对话结果（`id`、`choices`、`usage` 等）。模型调用工具时 `finish_reason` 为 `tool_calls`，`content` 为空字符串，调用在 `choices[0].message.tool_calls`（`id`、`function.name`、`function.arguments` 为 JSON 字符串）。每次约 1.3–2.3 秒。
- **系统提示写了"只用 propose_items"，模型第一次仍然调了 Orca 的工具 `parse_datetime`**（A1；这个工具不在 Orca 程序包里，应来自 MCP 服务器）。把每个调用都回一条工具结果后，下一次它调了插件的工具（A2）。
- 让模型先调 `read_skills`，插件回"此处不可用，请只用 propose_items"，下一次它就改用插件的工具（A3）。
- 多轮能接着进行：把上一次的 `assistant` 消息和每个工具调用的结果接在后面再发，模型据此继续（A2、A3）。
- 模型按原文写出了 `due: "2026-10-23"`；没写日期的条目没有 `due`。A3 中一条任务名被改成了"下午给老王打电话问报价（明天下午）"，说明任务名的措辞需要提示词约束。

### 流式与出错（A4、A5，及读源码）

- `sendStreamMessage` 逐段给出 delta，键为 `role`、`content`、`reasoning_content`（A4：186 段，其中 56 段是推理内容，没有工具调用的段）。插件只拼 `content`。
- 收到 5 段后 `abort()`：之后不再有分段，循环正常结束，不抛异常（A5）。
- 读源码：两个接口都捕获了请求错误，弹出 Orca 自己的提示"Error calling AI: …"后，`sendMessage` 返回 `null`，`sendStreamMessage` 直接结束；中止不弹提示。Orca 自带对话正在生成时（`window._orcaAIStreaming` 有值），`sendMessage` 立即返回 `null`，`sendStreamMessage` 立即结束。所以插件拿到 `null`，或流式结束时一个字也没有，都按失败处理，不必再弹一次错误。未配置 AI 对话时，请求失败，走的也是这条路。

### 把块读成文字（B）

- `get-block-tree` 返回一个块和它全部后代的数组；放进 `orca.state.blocks` 后可以用 `orca.converters.blockConvert("markdown", …)` 转换（Orca 读技能时也是这样做的）。
- **整棵转换会丢掉层级**：容器下的子块、孙块、任务下的说明，全部变成同一级的段落，看不出谁属于谁。
- **转出来的文字里没有任务标签**：任务块只剩它的文字"NA16 已是任务：整理需求"，没有 `#任务`。
- 加粗等行内格式保留为 Markdown（`**下周一**`）。
- 块的 `text` 字段带着标签和全部属性值（`NA16 已是任务：整理需求 #任务,全部,4,收集箱,4,4`），不适合直接交给 AI。

### 批量插入（C）

- 在同一个块后面按倒序插入三条（每次都插在锚点块之后），各自 `insertTag` 任务标签，包在一个 `invokeGroup` 中：最后的顺序正确，三条都带上了任务标签，**一次撤销全部撤回**（C1）。
- `insertBlock` 的参考块传 `get-block` 取回的对象时，**不管它在不在 `orca.state.blocks` 中，新块都落在正确的父块下**（C2a、C2b）。这一点与 `moveBlocks` 不同。
- `batchInsertText(日记, "lastChild", 多行文字, false, true)`（解析 Markdown、不提取标签）：Markdown 被解析成块，标题块把它下面的几行收成子块；`#NA16不该成标签` 保持为文字，没有生成别名或标签；一次撤销全部撤回（C3）。

### 块菜单多选（D）

- `worksOnMultipleBlocks: true` 的项在多选时收到**选中的那几个块**（不含它们的子块），按笔记中的顺序；只右键一个块时收到只有一个元素的数组。`rootBlockId` 是面板的根块（这里是日记）。

## 对第十六步的影响

- AI 只走插件自己调 `orca.ai` 这一条（ADR 0026）。不用 Orca 对话的 `call_commands`（写入不可撤销），也不用 MCP 服务器（插件不能注册工具）。
- 对话流程：在回复中找插件自己的工具调用；对模型发出的**每一个**其他工具调用都回一条"此处不可用"的工具结果再请求，这是必需的而不是兜底（A1）。`sendMessage` 返回 `null`、流式没有任何文字时按失败处理，Orca 已经提示过错误。
- 交给 AI 的所选内容、任务说明和 AI 说明由插件自己拼成缩进的大纲：每个块只转换它自己的内容（`blockConvert` 不带子块），按层级缩进成列表；已经是任务的块由插件标为 `[已是任务]`（插件读块时就知道它是不是任务）。不用整棵转换，也不用块的 `text` 字段。
- 提取任务、拆分子任务写入多个任务时，在一个 `invokeGroup` 中用 `insertBlock` 加 `insertTag`：放在所选块下方时按倒序插在它之后，放在子块或日记末尾时依次 `lastChild`。参考块用 `get-block` 取回即可，不必写进缓存。
- AI 小结写进日记用 `batchInsertText`，`skipTags` 为 `true`。
- 提取任务的块菜单项用 `worksOnMultipleBlocks: true`，单选和多选都覆盖；收到的块已按笔记顺序排好，各自再读全部子块。

## 没有实测

- **只转换一个块自己的内容（不带子块）时的输出**，以及这时是否也要先把块放进 `orca.state.blocks`。B 只测了带子块的转换。#202 实现大纲读法时先在 Orca 中确认，结论补在这里。
- 块内有行内块引用、页面引用时转出来的文字。
- 镜像块经块菜单或转换读出来是什么样；仓储入口照例先把镜像块解析成源块。
- 页面块（有别名的根级块）作为所选块时的转换。
- 别的模型对"只用插件工具"的遵守程度。流程不依赖模型遵守，只是重试次数可能更多。

## 验证代码

脚本在 `.scratch/spikes/16a-ai.js`、`16b-markdown.js`、`16c-insert.js`、`16d-block-menu.js`（不纳入版本管理）。要点：

- A：一个插件工具 `propose_items`（`items[{ title, due? }]`），用户文字为一段周会记录。A1 普通请求；A2 把 A1 的 `assistant` 消息和每个工具调用的结果（`"OK"`）接上后再问；A3 系统提示要求先调 `read_skills`，对非插件工具回"不可用"后再请求；A4 流式读完；A5 收到 5 段后 `abort()`。
- B：今天日记下建"容器 → 普通块（带加粗）→ 孙块""容器 → 任务块 → 说明""容器 → 普通块"，`get-block-tree` 后放进缓存，分别转换容器（只带子块、带自己的内容）和任务块。
- C：C1 在容器第一个子块之后倒序 `insertBlock("after")` 三次并 `insertTag`，一个 `invokeGroup`，再撤销一次；C2 删掉缓存中的锚点块后用 `get-block` 的对象 `insertBlock("after")`，再放进缓存重做；C3 `batchInsertText` 往日记写含标题、列表、`#词` 的多行文字，`skipTags` 为 `true`。
- D：登记 `worksOnMultipleBlocks: true` 的块菜单项，打印收到的块编号和根块。

## 实际返回

- A1：调用 `parse_datetime`（`{"text": "tomorrow"}`）。A2：调用 `propose_items`，`[{"title":"给老王打电话问报价"},{"title":"交季度报告","due":"2026-10-23"}]`。A3：先调 `read_skills`（`{"blockIds":[1]}`），回"不可用"后调 `propose_items`，`[{"title":"下午给老王打电话问报价（明天下午）"},{"title":"交季度报告","due":"2026-10-23"}]`。
- A4：186 段，键 `role`、`content`、`reasoning_content`，正文 242 字，用时 1.9 秒。A5：5 段后中止，之后 0 段，没有异常。
- B：容器（只带子块）转出 `"\n\n老王说报价**下周一**给到\n\n嵌套的孙块：记得问运费\n\nNA16 已是任务：整理需求\n\n任务下面的说明：先列清单\n\n最后一条普通块\n\n"`；任务块转出 `"NA16 已是任务：整理需求\n\n任务下面的说明：先列清单\n\n"`。
- C1：容器子块为 `[a, 任务一, 任务二, 任务三, 任务块, 普通块]`，三条各有 1 个标签引用；撤销一次后三条都不存在。C2a、C2b：新块的父块都是容器，撤销后不存在。C3：日记新增两个顶层块（文字块"NA16 C3 小结"，标题块"这段时间"带 3 个子块），没有标签引用，`get-blockid-by-alias("NA16不该成标签")` 没有返回块；撤销一次后都不存在。
- D：多选两个块时 `{"ids":[1531,1533],"root":1491}`（第一个是普通块，第二个是任务块，按笔记顺序）；只右键任务块时 `{"ids":[1533]}`。
