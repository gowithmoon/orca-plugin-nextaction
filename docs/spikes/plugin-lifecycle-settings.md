# 技术验证：pluginName 取值、设置变更时机与插件生命周期

> Issue #12（同时完成 #7 移交的"插件面板开着时重启 Orca"）。2026-10-07 用临时插件 `orca-plugin-nextaction-spike` 在测试笔记库中运行（Windows，UTC+8）。状态：**已完成**。
>
> Issue #17 补测设置的保存范围与插件写入设置（路线图第二步）。2026-10-07 用临时插件 `orca-plugin-nextaction-spike17` 在两个测试笔记库（`sample`、`demo-repo`）中运行。

## 问题

- 插件目录名为 `orca-plugin-nextaction` 时，`load` 收到的 `pluginName`
- `setSettingsSchema` 之后，设置值的读取时机
- 用户修改设置时，能否订阅 `orca.state.plugins[pluginName].settings` 的变化，以及触发的时机
- 停用再启用插件后，设置是否保留
- （#7 移交）插件面板开着时重启 Orca、停用状态下重启，面板会怎样
- （#17）用户在设置页修改的值保存在 app 级还是 repo 级；`plugins.setData` 是否按笔记库区分
- （#17）`orca.plugins.setSettings` 写入后，`settings` 和设置页是否立即更新；只写一部分设置项时其余项怎样；app 级与 repo 级同时有值时以哪个为准
- （#17）插件自己写设置时，订阅 `orca.state.plugins[pluginName]` 的回调会不会被触发

## 结论

### pluginName

- **`load` 收到的 `pluginName` 就是插件目录名**（`orca-plugin-nextaction-spike`）。`docs/ARCHITECTURE.md` 第 4 节的命名规则成立：注册类标识符以运行时的 `pluginName` 加 `.` 开头，正式插件的目录名是 `orca-plugin-nextaction`。
- `orca.state.plugins[pluginName]` 的字段为 `enabled`、`icon`、`schema`、`settings`、`module`。`load` 时 `enabled` 已经是 `true`，`orca.state.locale` 为 `zh-CN`。

### 设置

- **第一次启用时，`setSettingsSchema` 之前 `settings` 为 `null`**；之后默认值立即生效（`setSettingsSchema` 返回后马上就能读到）。
- 没有 `defaultValue` 的设置项，值是 `undefined`（`time` 类型的日界线）。插件要自己补上默认值。
- **设置在停用、启用和重启之后都会保留。** 之后每次 `load` 时，在调用 `setSettingsSchema` 之前就能读到上次的值。
- **订阅 `orca.state.plugins[pluginName]` 能收到设置的变化**：每次修改都触发一次 `set settings`，整个 `settings` 对象被替换。面板里用 `Valtio.useSnapshot` 读取设置，修改后立即刷新（界面已确认）。
- **文本设置在输入过程中会触发多次。** 把任务标签名从"NA验证插件标签"改成"NA验证插件标签-改名"，中途收到了"NA验证插件标签-"和"NA验证插件标签-改名"两次变化，间隔约 1 秒。所以每收到一次变化就去重命名任务标签是不行的：中间值也会被当成新名字，而且可能是空字符串，或者和已有别名冲突。
- **`time` 类型的值是一个完整的 `Date`，用它的本地时分表示所选时间。** 选 4:00 时存的是 `2026-10-06T20:00:00.000Z`，即北京时间 10 月 7 日 04:00；改成 5:00 后变为 `21:00:00.000Z`。日期部分是选择时的日期，没有意义。重启后读到的仍是 `Date`。用户看到的"不正确"，其实是日志把它按 UTC 打印了，值本身是对的。
- 插件处于"加载失败"的状态时，设置页仍然可以打开和修改。

### 设置的保存范围与插件写入（#17）

- **用户在设置页修改的值按笔记库保存。** 库 1 改成"库1-界面填写"、1 之后，库 2 第一次启用时读到的仍是默认值"NA17默认"、7；回到库 1，读到的仍是库 1 的值（A1、A2、C1）。所以每个笔记库可以有自己的任务标签名。
- **插件的启用状态是全局的。** 在库 1 启用后，切到库 2 时插件已自动启用。
- **`plugins.setData` 也按笔记库区分。** 两个库用同一个键写日志，各自读回的日志里只有本库的条目（`report` 结果）。
- **`setSettings` 写入后立即生效**：`await` 返回时 `orca.state.plugins[pluginName].settings` 已是新值，设置页显示的也是新值（B1–B3）。
- **`setSettings` 整体替换 `settings`，不合并。** 只写 `tagName` 时，`settings` 变成只有 `tagName` 的对象，`other` 从对象里消失（B2）；下次 `load` 时，`setSettingsSchema` 给缺失的项补回 `defaultValue`（`other` 变回 7，而不是之前写入的 3）。所以插件写设置时必须传入完整的设置对象。
- **repo 级优先于 app 级。** 在库 2 先写 repo 级、再写 app 级"app写入"：写入当时内存中的值变成"app写入"，但重新加载后读到的是 repo 级的"库2-repo只写名字"。app 级的值在没有 repo 级值时是否生效，没有验证。插件只使用 repo 级。
- **插件自己写设置，也会触发订阅回调**，每次写入恰好一次，在 `await` 返回之前就已触发（`eventsImmediate: 1`）。所以由设置变化触发的副作用（任务标签改名）必须能识别插件自己的写入，不能再次触发。
- 用户在设置页输入文字时，每次停顿都触发一次变化（"库1"、"库1-"、"库1-界面填写"），与 #12 一致。
- 在库 2 第一次 `load` 时，`setSettingsSchema` 之前读到的已经是默认值（不是 #12 中的 `null`）。原因不明，可能是库 1 已经设置过 schema。插件不应依赖 `setSettingsSchema` 之前的值。

### 生命周期

- **每次 `load` 都是一个全新的模块实例。** 每次 `load` 的模块会话 ID 都不同，模块级计数器始终是 1。所以模块内的变量不会跨越停用和启用保留，上一个实例留下的监听器和定时器，只能在它自己的 `unload` 里清理。
- **启用插件时，有时会连续出现 `load → unload → load`，三次调用在 1 秒之内。** 这次观察到两次（16:44:42–43、16:47:27–28），原因不明。所以 `load` 和 `unload` 必须能被快速、反复地调用，不留残余。
- **`load` 抛错后，Orca 在右下角显示"`<pluginName>`：加载时出错"，插件仍然保持启用状态。之后停用插件时，Orca 仍会调用这个实例的 `unload`**（16:48:15 调用了加载失败的 `xgmfu7` 实例的 `unload`）。所以 `unload` 必须能处理"只加载了一半"的情况。关闭报错开关、重新启用后，插件恢复正常。
- `plugins.getData` 和 `setData` 的数据在重启后仍然存在。是否跟着笔记库同步，没有验证。

### 插件面板与重启（#7 移交）

- 停用插件时，打开着的插件面板仍然留在界面上（与 #7 一致）。重新启用时，`load` 一开始就能在 `orca.state.panels` 里找到这个面板，面板渲染器要等插件再次注册后才有（`panelRendererAtLoad: false`）。
- **重启 Orca 后，插件面板都会被关闭**，不管重启前插件是启用还是停用；重新启用后也不会再打开。所以插件不需要处理"重启后恢复插件面板"的情况，也不会因此留下坏掉的面板。
- 重启之后，被插件面板覆盖的那个面板也一起消失了，这是用 `goTo` 覆盖的推论：重启前那个位置是插件面板，重启后就没了。被覆盖的原内容在重启后无法恢复，这和 #7 记录的"用 Orca 自己的方式关闭插件面板"属于同一种代价。

## 对后续步骤的影响

**第一步 #3：注册表与组合根**
- `load` 和 `unload` 必须是幂等的，能承受 1 秒内的 `load → unload → load`。注册表在 `load` 失败时回滚，`unload` 时再调用一次也不能出错。
- 不依赖模块级变量跨越 `load`。需要判断"是否已经注册过"时，看 `orca.state`（例如 `orca.state.commands`），或者干脆在 `unload` 里清理干净。
- 设置的读取：`setSettingsSchema` 之后，从 `orca.state.plugins[pluginName].settings` 读取；没有默认值的项，插件自己补默认值。

**第二步：任务标签改名（ADR 0002，#23）**
- 不在每次收到设置变化时都立刻 `renameAlias`。做法是：变化停止一段时间（例如 1 秒）后再执行；新名字为空、与原名相同或与其他别名冲突时，不执行并提示用户。
- 插件写设置（第一次启动写入默认名称、新名字不合法时改回原名）一律用 `setSettings("repo", pluginName, 完整设置对象)`：先读出当前的全部设置，只改要改的项，再整体写回。
- 插件自己的写入会触发订阅。改回原名后，设置值等于当前的标签名，按"与原名相同时什么都不做"的规则自然不会再次改名；写入默认名称时同理，只要先确定标签再写设置。
- 每个笔记库有自己的任务标签名，多个笔记库互不影响。
- `plugins.setData` 本身按笔记库区分，任务标签的缓存键不需要再带笔记库名。


**第三步：日界线设置**
- 用 `time` 类型，读取时只取本地的小时和分钟（`getHours`、`getMinutes`），转换成 `domain/time` 里的"时分"值，不使用它的日期部分。没有值时默认 5:00。

## 验证插件

#17 的临时插件位于 `.scratch/spikes/17-plugin/orca-plugin-nextaction-spike17/`（不纳入版本管理）：定义一个文本设置 `tagName` 和一个数字设置 `other`；`load`、`unload`、设置变化、写入都记进 `plugins.setData` 的日志；`__naSpike17.run()` 在库 2 依次执行 B1（repo 级写两项）、B2（repo 级只写一项）、B3（app 级写一项），每次写入后立即读取，并在 1.5 秒后再读一次，统计订阅回调的次数。

#12 的临时插件：

临时插件位于 `.scratch/spikes/12-plugin/orca-plugin-nextaction-spike/`（不纳入版本管理）：
- `load` 和 `unload` 时把 `pluginName`、模块会话 ID、设置的值和类型、已打开的插件面板写入 `plugins.setData`，重启后也能读到；
- 注册一个编辑器工具按钮和一个面板，面板用 `useSnapshot` 实时显示设置；
- 设置项"停用时关闭面板""加载时故意报错"分别用来测停用和加载失败。

## 实际返回（摘录）

| 时间（UTC） | 模块会话 | 事件 | 要点 |
|---|---|---|---|
| 16:41:38 | b897tp | load | 第一次启用：`settingsBeforeSchema: null`；之后读到默认值，`dayBoundary` 为 `undefined` |
| 16:42:05–06 | b897tp | 设置变化 ×2 | `taskTagName` 依次为"NA验证插件标签-""NA验证插件标签-改名" |
| 16:42:24 | b897tp | 设置变化 | `dayBoundary: Date(2026-10-06T20:00:00.000Z)`（选的是 4:00） |
| 16:44:14 | b897tp | unload | 面板 `LHsFHxr46J` 开着，`unload` 后仍在 |
| 16:44:42–43 | tdgxnj → uu4d3u | load、unload、load | 启用时连续调用；`panelsAtLoad: ["LHsFHxr46J"]`，`panelRendererAtLoad: false` |
| 16:45:01 | stbk9t | load | 重启后：`panelsAtLoad: []`，设置保留（`dayBoundary` 仍是 `Date`） |
| 16:46:40 | kuawyd | load | 停用状态下重启再启用：`panelsAtLoad: []` |
| 16:47:18 | kuawyd | unload | `closePanels: true`，`panelsAfter: []` |
| 16:47:27–28 | c3o5js → 6235pb | load、unload、load | 启用时再次连续调用 |
| 16:47:36 | xgmfu7 | load 抛错 | `throwing` 之后没有 `load-end` |
| 16:48:15 | xgmfu7 | unload | 加载失败的实例照样被调用 `unload` |
| 16:48:15 | qnrd3t | load | 关闭报错开关后正常加载 |

界面观察：
- 设置页出现 5 个设置项，修改后面板中的值立即刷新。
- 停用后插件面板仍然开着。
- 启用状态下重启，插件面板被关闭；停用状态下重启，面板也被关闭，重新启用后不会再打开。
- 加载报错时，右下角出现"orca-plugin-nextaction-spike：加载时出错"，按钮没有出现；关闭开关后重新启用，一切正常。

### #17（摘录）

| 步骤 | 笔记库 | 操作 | 结果 |
|---|---|---|---|
| A1 | sample | 设置页改成"库1-界面填写"、1 | 读到 `{ tagName: "库1-界面填写", other: 1 }`；输入过程中触发 3 次变化 |
| A2 | demo-repo | 第一次启用（自动启用） | 读到默认值 `{ tagName: "NA17默认", other: 7 }` |
| B1 | demo-repo | `setSettings("repo", …, { tagName: "库2-repo写入", other: 3 })` | 立即为 `{ tagName: "库2-repo写入", other: 3 }`，回调 1 次 |
| B2 | demo-repo | `setSettings("repo", …, { tagName: "库2-repo只写名字" })` | 立即为 `{ tagName: "库2-repo只写名字" }`（`other` 消失），回调 1 次 |
| B3 | demo-repo | `setSettings("app", …, { tagName: "app写入" })` | 立即为 `{ tagName: "app写入" }`，回调 1 次；设置页显示"app写入"、7 |
| C1 | sample | 切回库 1 | 读到 `{ tagName: "库1-界面填写", other: 1 }` |
| — | demo-repo | 重新加载 | `setSettingsSchema` 前后都是 `{ tagName: "库2-repo只写名字", other: 7 }` |
| — | 两个库 | `report()` | 各自的日志里只有本库的条目 |

