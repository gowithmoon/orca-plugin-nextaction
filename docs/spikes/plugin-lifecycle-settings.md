# 技术验证：pluginName 取值、设置变更时机与插件生命周期

> Issue #12（同时完成 #7 移交的"插件面板开着时重启 Orca"）。2026-10-07 用临时插件 `orca-plugin-nextaction-spike` 在测试笔记库中运行（Windows，UTC+8）。状态：**已完成**。

## 问题

- 插件目录名为 `orca-plugin-nextaction` 时，`load` 收到的 `pluginName`
- `setSettingsSchema` 之后，设置值的读取时机
- 用户修改设置时，能否订阅 `orca.state.plugins[pluginName].settings` 的变化，以及触发的时机
- 停用再启用插件后，设置是否保留
- （#7 移交）插件面板开着时重启 Orca、停用状态下重启，面板会怎样

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

**第二步：任务标签改名（ADR 0002）**
- 不在每次收到设置变化时都立刻 `renameAlias`。做法是：变化停止一段时间（例如 1 秒）后再执行；新名字为空、与原名相同或与其他别名冲突时，不执行并提示用户。具体策略在第二步开始时确定。

**第三步：日界线设置**
- 用 `time` 类型，读取时只取本地的小时和分钟（`getHours`、`getMinutes`），转换成 `domain/time` 里的"时分"值，不使用它的日期部分。没有值时默认 5:00。

## 验证插件

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
