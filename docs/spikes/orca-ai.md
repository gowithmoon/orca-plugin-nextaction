# 技术验证：Orca 的 AI 能力、把块读成文字、批量插入与块菜单多选

> 第十六步（#201）开工前。2026-10-18 在测试笔记库中运行（Windows，UTC+8，Orca 程序包版本 1.98.0，AI 对话模型 `deepseek-flash`，界面语言 zh-CN）。另有一部分结论来自阅读 Orca 程序包 `resources/app.asar` 中的源码，已注明。

## 问题

- 插件能用哪些官方 AI 能力，各自的限制（读源码）
- `orca.ai.sendMessage` 带插件工具时的返回结构；模型会不会调用插件工具、会不会调用 Orca 自己的工具；对 Orca 的工具回"不可用"后能否继续；多轮能否接着进行（A1–A3）
- `orca.ai.sendStreamMessage` 的分段内容与中止（A4、A5）；未配置、出错时的表现（读源码）
- 用 Orca 的 Markdown 转换器读一个块及其全部子块，任务块和嵌套是什么样（B）
- 在同一个块后面连续插入多个任务并打标签，一次撤销能否全部撤回；目标块不在 `orca.state.blocks` 中时插到哪里；把多行 Markdown 写进日记且不提取标签（C）
- 块菜单多选时拿到哪些块编号、什么顺序（D）
- 只转换一个块自己的内容（不带子块）时各类块的输出；行内引用、镜像块、页面块；块或引用目标不在 `orca.state.blocks` 中时；`get-block-tree` 的顺序（E、G）
- 从插件面板写入：在一个任务下连续建多个子任务、往日记写多行文字（F）

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

### 逐块转换（E、G）

- `blockConvert("markdown", { content: 块的 content }, _repr, 块, true, { exportRootId })` 只转换块自己的内容，不带子块。各类块的输出：标题 `## E 标题`，列表项 `- G 列表项`，编号项 `1. G 编号项`，代码块 `` ```JavaScript `` 加代码，带链接和斜体的文字 `G 带链接 [Orca](https://orca.note) 和 *斜体*`，Orca 的复选框块 `- [ ] G 复选框`，空块为空字符串，引用块（`quote2`，内容在子块里）只有 `> `。末尾都带两个换行。
- **页面块**只转换自己时得到页面名（E3）。
- **镜像块**转出源块的内容（`- G 列表项`），镜像块自己在不在缓存中都一样（G5，当时源块在缓存中）。
- **被转换的块不必在 `orca.state.blocks` 中**：传 `get-block` 取回的对象就能转换，转换后也不会被放进缓存（G2）。E4 的报错是脚本取错了块，不是 Orca 的行为。
- **行内引用要求目标块在 `orca.state.blocks` 中**：在缓存中时转出 `前G 列表项`（引用处换成目标块的文字，没有括号或标记，G4）；不在时引用整个消失，只剩 `前`，不报错（G3）。
- 转换很快：约 0.035 毫秒一个块（E6）。
- `get-block-tree` 返回的数组**不含根块本身**，后代按先序（父块在前，子块按笔记顺序紧随其后）排列（E7）。

### 从插件面板写入（F）

- 插件面板是活动面板时，`insertBlock` 加带状态值的 `insertTag`（`[{ name: "状态", value: "待开始" }]`）建出的子任务状态正确，一个 `invokeGroup` 一次撤销全部撤回；写完后活动面板仍是插件面板（F1）。
- **连续三次 `insertBlock(父块对象, "lastChild", …)`，父块对象是写入前用 `get-block` 取的同一份时，顺序反了**：父块的子块成了"三、二、一"（F1）。Orca 按传入对象的 `children` 判断"最后"，那份对象不会随写入更新。
- `batchInsertText(日记, "lastChild", "NA16 F2 小结\n- 第一条 #…\n- 第二条", false, true)`：只建出一个顶层块，后面的列表行成了它的子块；没有生成标签；一次撤销撤回（F2）。

### 按层级写进日记（H4）

2026-10-18 在 Orca 中从插件面板实测（插件面板为活动面板），以下五步放在**一个** `invokeGroup` 中：

1. `top = insertBlock(日记, "lastChild", [{ t: "t", v: 标题 }])`
2. `s1 = insertBlock(await get-block(top), "lastChild", [{ t: "t", v: "这段时间" }])`
3. `batchInsertText(await get-block(s1), "lastChild", "- 第一句 **加粗**\n- 第二句 #词", false, true)`
4. `s2 = insertBlock(await get-block(s1), "after", [{ t: "t", v: "值得留意" }])`
5. `batchInsertText(await get-block(s2), "lastChild", "- 一条\n- 两条", false, true)`

结果：

- `top` 在日记下；`s1`、`s2` 是 `top` 的子块，顺序正确。
- 每部分的条目成为该部分块的子块，类型为列表项（`ul`），加粗保留。
- `#词` 保持为文字，没有生成别名或标签。
- 一次 Ctrl+Z 全部撤回。

### 块菜单多选（D）

- `worksOnMultipleBlocks: true` 的项在多选时收到**选中的那几个块**（不含它们的子块），按笔记中的顺序；只右键一个块时收到只有一个元素的数组。`rootBlockId` 是面板的根块（这里是日记）。

## 对第十六步的影响

- AI 只走插件自己调 `orca.ai` 这一条（ADR 0026）。不用 Orca 对话的 `call_commands`（写入不可撤销），也不用 MCP 服务器（插件不能注册工具）。
- 对话流程：在回复中找插件自己的工具调用；对模型发出的**每一个**其他工具调用都回一条"此处不可用"的工具结果再请求，这是必需的而不是兜底（A1）。`sendMessage` 返回 `null`、流式没有任何文字时按失败处理，Orca 已经提示过错误。
- 交给 AI 的所选内容、任务说明和 AI 说明由插件自己拼成缩进的大纲：用 `get-block-tree` 取回后代，每个块只转换它自己的内容（`blockConvert` 不带子块），按层级缩进，去掉转换结果首尾的空白，结果为空或只有 `>` 的块不占一行（它的子块照常缩进）；已经是任务的块由插件标为 `[已是任务]`（插件读块时就知道它是不是任务）。不用整棵转换，也不用块的 `text` 字段。
- 转换前，把块内行内引用的目标块、镜像块的源块中不在 `orca.state.blocks` 里的，用 `get-block` 取回放进缓存（只补缺，不覆盖，与 `move-blocks` 相同），否则引用的文字会丢失（G3）。被转换的块本身不必放进缓存。
- 提取任务、拆分子任务写入多个任务时，在一个 `invokeGroup` 中用 `insertBlock` 加 `insertTag`（状态等初始值随 `insertTag` 一起写入）：放在所选块下方时按倒序插在它之后（C1）；放在子块或日记末尾时，第一条插为最后子块，之后每一条插在上一条新块之后，参考块每次用 `get-block` 重新取回。不能拿同一份父块对象连续 `lastChild`，顺序会反（F1）。参考块不必写进缓存（C2）。
- AI 小结按层级写进日记（H4），全部在一个 `invokeGroup` 中：先用 `insertBlock` 把插件加的标题块"NextAction任务回顾小结（日期）"插为日记的最后子块；每部分的名称（"这段时间""值得留意"）用 `insertBlock` 建成标题块的子块，第一部分插为最后子块，之后每部分插在上一部分之后；每部分的条目用 `batchInsertText(部分块, "lastChild", "- …", false, true)` 写成它的子块。参考块每次用 `get-block` 重新取回（F1）。整个小结可以整块折叠，一次撤销撤回，`#` 不变成标签。不再把整段文字交给一次 `batchInsertText`：AI 写出的 Markdown 标题会自己成为顶层块（C3）。
- 写入前插件把（用户改过的）文字读成几部分：不以列表符号开头的非空行开始一部分，`- ` 开头的行归入最近的一部分；第一部分之前的条目直接写在标题块下面。提示词把两部分的名称按界面语言原样给 AI，要求照写、不翻译。
- 提取任务的块菜单项用 `worksOnMultipleBlocks: true`，单选和多选都覆盖；收到的块已按笔记顺序排好，各自再读全部子块。

## 没有实测

- 引用页面（`[[页面]]`）与引用块的转换应当一样（都是 `t: "r"` 片段），没有单独测。
- "上一条新块之后"的插法在 F 中没有单独测；它用到的两点（`insertBlock` 参考 `get-block` 取回的对象、在某块之后插入）已在 C1、C2 确认，按 #202 的手动验证清单检查。
- 别的模型对"只用插件工具"的遵守程度。流程不依赖模型遵守，只是重试次数可能更多。

## 验证代码

脚本在 `.scratch/spikes/16a-ai.js`、`16b-markdown.js`、`16c-insert.js`、`16d-block-menu.js`（不纳入版本管理）。要点：

- A：一个插件工具 `propose_items`（`items[{ title, due? }]`），用户文字为一段周会记录。A1 普通请求；A2 把 A1 的 `assistant` 消息和每个工具调用的结果（`"OK"`）接上后再问；A3 系统提示要求先调 `read_skills`，对非插件工具回"不可用"后再请求；A4 流式读完；A5 收到 5 段后 `abort()`。
- B：今天日记下建"容器 → 普通块（带加粗）→ 孙块""容器 → 任务块 → 说明""容器 → 普通块"，`get-block-tree` 后放进缓存，分别转换容器（只带子块、带自己的内容）和任务块。
- C：C1 在容器第一个子块之后倒序 `insertBlock("after")` 三次并 `insertTag`，一个 `invokeGroup`，再撤销一次；C2 删掉缓存中的锚点块后用 `get-block` 的对象 `insertBlock("after")`，再放进缓存重做；C3 `batchInsertText` 往日记写含标题、列表、`#词` 的多行文字，`skipTags` 为 `true`。
- D：登记 `worksOnMultipleBlocks: true` 的块菜单项，打印收到的块编号和根块。
- E（`16e-outline.js`）、G（`16g-outline-2.js`，改正 E 的脚本错误）：容器下每种块用一次 `batchInsertText` 单独建出；在一个块里用 `insertLink`（光标是第一个参数）插入指向列表项的行内引用；`batchInsertReprs` 加 `createRef(…, 5)` 建镜像块（它不返回 ID，按前后子块的差找）；根级块加 `createAlias` 建页面。逐块转换，并分别在块、引用目标、镜像块不在缓存中时转换。
- F（`16f-panel-writes.js`）：插件面板为活动面板，在今天日记里建父任务，再在一个 `invokeGroup` 中对同一份父块对象 `insertBlock(lastChild)` 三次并带状态 `insertTag`，撤销一次；再 `batchInsertText` 往日记写三行（第二行带 `#词`），撤销一次。

## 实际返回

- A1：调用 `parse_datetime`（`{"text": "tomorrow"}`）。A2：调用 `propose_items`，`[{"title":"给老王打电话问报价"},{"title":"交季度报告","due":"2026-10-23"}]`。A3：先调 `read_skills`（`{"blockIds":[1]}`），回"不可用"后调 `propose_items`，`[{"title":"下午给老王打电话问报价（明天下午）"},{"title":"交季度报告","due":"2026-10-23"}]`。
- A4：186 段，键 `role`、`content`、`reasoning_content`，正文 242 字，用时 1.9 秒。A5：5 段后中止，之后 0 段，没有异常。
- B：容器（只带子块）转出 `"\n\n老王说报价**下周一**给到\n\n嵌套的孙块：记得问运费\n\nNA16 已是任务：整理需求\n\n任务下面的说明：先列清单\n\n最后一条普通块\n\n"`；任务块转出 `"NA16 已是任务：整理需求\n\n任务下面的说明：先列清单\n\n"`。
- C1：容器子块为 `[a, 任务一, 任务二, 任务三, 任务块, 普通块]`，三条各有 1 个标签引用；撤销一次后三条都不存在。C2a、C2b：新块的父块都是容器，撤销后不存在。C3：日记新增两个顶层块（文字块"NA16 C3 小结"，标题块"这段时间"带 3 个子块），没有标签引用，`get-blockid-by-alias("NA16不该成标签")` 没有返回块；撤销一次后都不存在。
- D：多选两个块时 `{"ids":[1531,1533],"root":1491}`（第一个是普通块，第二个是任务块，按笔记顺序）；只右键任务块时 `{"ids":[1533]}`。
- E：标题块 `"## E 标题\n\n"`；空块 `"\n\n"`；页面块 `"NA16页面E…\n\n"`；约 0.035 毫秒一块；`get-block-tree` 为 `[1537, 1538, 1539, 1540, 1541, 1542]`（根块 1536 不在其中，1537 的四个子块紧随其后）。另两项因脚本错误没有结果（`insertLink` 光标放错参数位置，报 SQLite 绑定错误；`batchInsertReprs` 没有返回值）。
- G：列表 `"- G 列表项\n\n"`，编号 `"1. G 编号项\n\n"`，代码 `` "```JavaScript\nconst g = 1;\n```\n\n" ``，文字 `"G 带链接 [Orca](https://orca.note) 和 *斜体*\n\n"`，引用块 `"> \n\n"`（`content` 为 `null`），复选框 `"- [ ] G 复选框\n\n"`；行内引用块（`content: [{t:"t",v:"前"},{t:"r",v:1356}]`，`text: "前[G 列表项]"`）目标在缓存中为 `"前G 列表项\n\n"`，不在为 `"前\n\n"`；镜像块（`_repr: { type: "mirror", mirroredId: 1547 }`，`content: null`）为 `"- G 列表项\n\n"`；列表项块不在缓存中时用取回的对象转换为 `"- G 列表项\n\n"`，转换后仍不在缓存中。
- F：活动面板 `orca-plugin-nextaction.panel`；F1 依次建出 1546、1547、1548，父块的 `children` 为 `[1548, 1547, 1546]`，三个都是"待开始"，撤销一次后都不存在；F2 只新增一个顶层块"NA16 F2 小结"，没有建出别名，撤销一次后不存在；写完后活动面板仍是插件面板。
