# 架构与工程规矩

本文件是写代码时必须遵守的规矩。术语以 [`GLOSSARY.md`](../GLOSSARY.md) 为准，每条规矩背后的理由见 [`docs/adr/`](./adr/)。规矩需要修改时，先改本文件（必要时补一个 ADR），再改代码。

## 1. 核心原则

1. **笔记是唯一真相源**（ADR 0001）：卸载插件后，任务数据仍完整留在笔记里。`orca.plugins.setData` 只存可丢弃、可重建的数据。
2. **任务只由任务标签识别**（ADR 0002）：不读、不写 Orca 原生任务块的复选框状态。
3. **父子关系只来自块层级**（ADR 0003）：块层级之外的先后关系一律用依赖表达。
4. **业务规则与 Orca 隔离**（ADR 0004）：下一步行动、评分、阻塞、重复、逻辑日等规则都写成纯函数，脱离 Orca 也能测试。
5. **数据结构只增不改**（ADR 0008）：启动时的对齐只补齐缺失的部分，从不删除、改名或改类型。
6. **写进笔记的名称在创建时确定**（ADR 0009）：代码里只用英文键，名称和键的互相转换只在编解码层进行。

## 2. 分层

```
ui ──────────► application ──────────► domain
                    ▲                    ▲
                    │ 实现端口（ports）   │
                  infra ─────────────────┘
platform：组合根，可以依赖以上所有层，负责装配和注册
shared：与 Orca 无关的通用工具，所有层都可以依赖
```

| 层 | 职责 | 可以依赖 | 禁止 |
|---|---|---|---|
| `domain` | 任务模型、状态、阻塞判断、评分、逻辑日、重复规则、回顾步骤 | `shared` | 全局 `orca`、React、`Date.now()`/`new Date()`（当前时间一律由参数传入） |
| `application` | 用例（如捕获、改状态、计算下一步行动）和端口接口 | `domain`、`shared` | 全局 `orca`、React、`infra` |
| `infra` | 实现端口：仓储、查询构建、属性编解码、标签结构对齐、Orca 命令调用 | `application`（端口）、`domain`、`shared`、全局 `orca` | React、`ui` |
| `ui` | 插件面板、各视图、任务属性面板、快速捕获弹窗 | `application`、`domain`（仅类型和纯函数）、`shared`、React、`orca.components`、只读的 `orca.state` | `infra`；直接调用 `orca.invokeBackend`、`orca.commands.invoke*` |
| `platform` | `load`/`unload`、注册表、设置项定义、依赖装配 | 所有层 | 业务规则 |
| `shared` | 翻译函数 `t()`、通用类型和工具 | 无 | 全局 `orca`、React |

依赖方向由 `tests/architecture.test.ts` 扫描 `import` 和全局 `orca` 的用法来检查，CI 不通过就不能合并。

## 3. 目录结构

```
src/
  main.tsx                 只导出 load/unload，转调 platform/bootstrap
  domain/
    task/                  Task、TaskStatus、各属性值对象
    blocking/              阻塞判断、搁置子树、下一步行动筛选
    scoring/               评分公式及其参数
    time/                  日界线、逻辑日
    recurrence/            重复规则、顺延计算
    review/                回顾步骤、回顾周期
  application/
    ports/                 TaskRepository、TaskQuery、Clock、Settings、Notifier 等接口
    usecases/              每个用例一个文件
  infra/
    system-clock.ts        Clock 端口的真实实现（与 Orca 无关）
  infra/orca/
    schema/                任务标签的结构定义、启动对齐、改名
    codec/                 Block ⇄ Task 编解码、中英文名称表
    repository/            TaskRepository 的实现
    query/                 QueryDescription2 的构建
  ui/
    panel/                 插件面板外壳与视图导航
    views/                 各个视图，每个视图一个子目录
    task-panel/            任务属性面板
    task-menu/             状态图标（只显示）与任务操作菜单（菜单项通过登记的方式添加，渲染进 Orca 的标签菜单和块右键菜单）
    capture/               快速捕获弹窗
    components/            可复用组件
    hooks/                 React hooks（只调用 application）
    styles/                CSS
  platform/
    bootstrap.ts           组合根：创建实现、注入用例、注册 UI，各功能之间的装配都在这里
    registry.ts            注册表
    settings.ts            设置项的唯一定义处
    panel-*.ts、note-navigation.ts
                           面板导航胶水（orca.nav）：要用 ui 的面板参数类型，而 infra 不能依赖 ui，所以放在 platform；其中的日期仍经 infra 构造（见 §4 日记与日期）
  shared/
    l10n/                  t() 与翻译字典
tests/
  architecture.test.ts
  fixtures/                真实 Orca Block 的 JSON 样本
```

测试文件与被测文件放在同一目录，命名为 `*.test.ts`。

## 4. 编码规矩

### 命名

- 领域概念一律使用 `GLOSSARY.md` 中的英文名（`Task`、`NextAction`、`LogicalDay` 等），不要使用其中列为 _Avoid_ 的词。
- 插件名是 `orca-plugin-nextaction`，即插件目录名，也是 Orca 传给 `load` 的 `pluginName`。
- 注册给 Orca 的所有标识符（命令、面板、渲染器、按钮、设置、broadcast 类型）都以运行时的 `pluginName` 加 `.` 开头，由注册表统一拼接和校验，代码中不写死前缀。
- 写进笔记的数据键（插件块属性名等）使用固定前缀 `nextaction.`，不随插件目录名变化，这样即使插件目录被改名，已有数据仍然可读。不允许以 `_` 开头。
- CSS 类名以 `nextaction-` 开头，颜色和间距只使用 Orca 的 CSS 变量。
- 文件名用 kebab-case，React 组件用 PascalCase。

### 领域模型

- `Task` 是不可变对象，修改即生成新对象。
- 状态在代码里是英文键组成的联合类型：`"inbox" | "todo" | "doing" | "waiting" | "someday" | "done"`。
- `domain` 中不出现 Orca 的类型（`Block`、`DbId` 等）。任务 ID 用领域内自己的类型 `TaskId` 表示。

### 时间

- 当前时间只通过 `Clock` 端口获取。`domain` 函数一律把 `now` 作为参数。
- "今天"一律指逻辑日，统一由 `domain/time` 计算，其他地方禁止自己算日界线。

### 读写 Orca

- 所有写操作都经过仓储，涉及多个步骤的写操作包在 `orca.commands.invokeGroup` 里，让用户能一次撤销。
- `invokeGroup` 和编辑器命令都通过**活动面板的编辑器**（`viewState.editor`）执行，没有编辑器的面板写不进去，而且不报错。插件面板里藏着一个 Orca 的块面板渲染器（`ui/panel/hidden-editor.tsx`），插件面板因此能自己写入，撤销也在插件面板里。活动面板没有编辑器时，`infra/orca/orca-calls.ts` 先切到一个有编辑器的面板，写完再切回（ADR 0014，`plugin-panel-writes`）。只经过 `orca-calls` 调用它们，由架构测试检查；不要改用后端接口直接写，那样写入进不了 Orca 的撤销历史。
- 属性名、类型码（`PropType`）、标签别名只在 `infra/orca` 中出现。
- 读写块属性中的 JSON 时，必须经过带版本号的编解码函数；遇到无法解析的数据时保留原值并记录警告，禁止静默覆盖。
- 视图按需查询，缓存遵循 ADR 0007：插件写入后、命令后钩子报告相关编辑后、视图获得焦点时，让相关缓存失效。

### Orca 行为约束（实测）

以下规矩来自 `docs/spikes/` 中的实测结论（括号内为文件名），违反它们会得到错误数据，或者让 Orca 崩溃。

查询（`tag-property-query`）：
- 每次 `query` 都显式传 `pageSize`，默认只返回 20 条。
- 检查返回值是不是数组：出错时返回 `{ code: "SQLITE_ERROR" }`，不抛异常。
- 不使用 `sort` 和 `page`，排序和分页在内存中做。
- 单选属性"是几个值之一"用 OR 组表达；多选属性"不包含"用取反组表达。不要用 `op: 3` 传数组，也不要用 `op: 4`。
- 状态为空或无法识别的任务读作收集箱，但任何查询条件都匹配不到它们（`op: 1` 漏掉，单选属性的 `op: 11` 一个都不命中）。要包含收集箱的结果，查询全部任务后在内存中按解码后的状态筛选（`inbox-anomalous-status`）。
- 任务查询一律加上"有父块或有别名"的 OR 组 `{ kind: 101, conditions: [{ kind: 9, hasParent: true }, { kind: 9, hasAliases: true }] }`，排除日记块和被删除后残留的孤立块，保留页面任务（ADR 0013，`tag-operations`、`page-task`）。按 ID 读取使用同一条规则。

读写任务数据（`tag-operations`、`block-properties-json`）：
- 任务属性值从任务块 `refs` 中 `to` 为任务标签块 ID 的那条引用的 `data` 读取。块上可能还有其他标签（例如 `Reminder`）。缺项和 `null` 都视为空；`get-blocks` 返回的日期是 `Date`（`plugin-panel-writes`；早先记成 ISO 字符串是 JSON 打印造成的）。页面任务的 `content` 为空，文字取它的别名。
- 修改标签块上的属性定义时，传入完整的 `typeArgs`（Orca 是整体替换），并显式写入 `pos`。
- 块引用属性（依赖）的值是引用 ID：先 `createRef(任务块, 目标块, 3)`，再写入引用 ID。任何时候都不写原始块 ID。
- 依赖方从被依赖块 `backRefs` 中 `type: 3` 的引用找到，并以依赖方"依赖"值中含有该引用 ID 为准；行内引用是 `type: 1`，不算依赖（`next-action-hierarchy-boolean-deps`）。
- 布尔属性的值项一律带 `type: 4`。`insertTag` 传不带 `type` 的 `true` / `false` 时，标签整个打不上，也不报错（`next-action-hierarchy-boolean-deps`）。
- 多选属性（上下文、标记）的值不在任务标签的 `choices` 里时，能存进笔记，但界面上不显示，Orca 也不会自动补上。写入时，在同一个 `invokeGroup` 中先把缺少的值补进 `choices`，再写值；一次撤销撤回两步（`multi-choices-created`）。
- 块 ID 和引用 ID 都会被回收再用，不能在删除操作之后继续持有。
- 放弃任务时，在同一个 `invokeGroup` 中移除任务标签，并删除全部 `nextaction.*` 块属性。
- **所有接收块 ID 的入口都先把镜像块解析成源块**（`_repr.type === "mirror"` 时改用 `mirroredId`），在仓储入口统一处理，否则数据会写到镜像块上。
- `orca.state.blocks` 只是前端缓存，不作为任务数据的来源；批量读取用 `get-blocks`。
- 任务的父任务和先后位置：取回全部任务后，对不在任务集合中的 `parent` 按层用 `get-blocks` 补取，在内存中沿 `parent` 找最近的任务祖先、按"在父块 `children` 中的序号"路径排先后。1000 个任务约 32 ms。不用 `get-block-tree`（`next-action-hierarchy-boolean-deps`）。

日记与日期（`journal-capture`）：
- `get-journal-block` 会在日记不存在时创建它，只在要写入日记时调用。
- `get-journal-block` 按传入时间的**本地日期**选日记；`nav.goTo`/`replace("journal", { date })` 需要该日期的 **UTC 零点**。两种参数只在 `infra` 的一个模块里构造（`infra/orca/journal-date.ts`），`domain` 只用年、月、日表示日期。
- `time` 类型的设置只取本地的小时和分钟（`plugin-lifecycle-settings`）。
- 开始日期、截止日期是 `date` 子类型（ADR 0012）：读取时只取本地年月日，写入时传本地零点。Orca 不会截掉代码写入的时刻（`date-subtype`）。

导航与面板（`editor-sidetool-panel`，ADR 0011）：
- 传给导航 API 的 `viewArgs` 保持原始类型，不做 JSON 序列化或深拷贝；只操作参数结构已知的 `block` 和 `journal` 视图。传错类型会让整个 Orca 崩溃。
- 调用 `nav.changeSizes` 时传入这一行所有面板的宽度。
- `orca.state.panels` 中的对象是实时的，需要保存的值在调用导航 API 之前取出；不要序列化它（含 DOM 元素）。
- 插件面板中需要让用户复制的文字，显式设置 `user-select: text`。

撤销（`tag-operations`）：
- `core.editor.undo` 返回时撤销还没有完全生效，不能假设数据已经更新。

界面注入（`status-icon-task-menu`、`official-task-menus`）：
- 优先使用 Orca 的官方扩展点（命令、`tagMenuCommands`、`blockMenuCommands` 等），不拦截 Orca 的鼠标和键盘事件，不从 DOM 读取块 ID。
- 只有状态图标依赖 Orca 内部 DOM：它是一份只负责显示的注入样式，Orca 改版时最坏的结果是图标不显示，不影响任何操作。依赖内部 DOM 的选择器全部集中在 `ui/task-menu` 的一个文件中，每次 Orca 升级后手动检查。`.orca-tag` 的 `data-name` 是小写的标签名，选择器要用 `i` 标志匹配；属性的 `data-` 名是属性名转小写、空格换成 `_`（`page-task`）。
- 例外：这个文件需要笔记中的任务标签名、状态属性名和选项名来生成选择器。这些名称只通过 `TaskTagNamesSource` 端口提供，只在这个文件中使用；其他 `ui` 代码仍然只用英文键。

### 注册与清理

- 所有 `register*`、事件监听、样式注入、定时器、独立的 React 根节点都通过 `platform/registry.ts` 进行。注册表在 `unload` 时按注册的逆序全部释放。代码中禁止出现游离的 `register*` 调用。
- `load` 和 `unload` 必须经得起反复调用：Orca 启用插件时可能在 1 秒内执行 `load → unload → load`；`load` 抛错后，停用时仍会调用 `unload`。注册表要能处理只加载了一半的状态（`plugin-lifecycle-settings`）。
- 每次 `load` 都是新的模块实例，模块级变量不会跨越停用和启用保留。
- 注销插件面板类型之前，先关闭所有打开着的插件面板；覆盖打开的，恢复被覆盖的内容（ADR 0011）。只注销不关闭，面板会一直留在界面上。
- 设置在 `setSettingsSchema` 之后从 `orca.state.plugins[pluginName].settings` 读取，没有默认值的项由插件补上默认值。文本设置在用户输入过程中会多次变化，由设置触发的副作用（例如任务标签改名）要等输入停止后再执行，并校验新值。设置和 `plugins.setData` 都按笔记库保存。插件写设置时用 `setSettings("repo", …)` 并传入完整的设置对象（它整体替换，不合并）；插件自己的写入也会触发设置变化的订阅，由设置触发的副作用要能识别这种情况。
- 不覆盖、不干扰 Orca 自带的命令、渲染器和界面。

### 错误处理

- `infra` 把 Orca 的失败转换成插件自己的错误类型；`application` 不吞掉错误。
- 错误统一在 `ui` 层捕获，通过 `orca.notify` 告知用户。例外：`load`/`unload` 本身的失败（加载出错、回滚或释放出错），以及由设置触发的工作（任务标签的改名、把设置改回原名）的结果和失败，都没有 `ui` 可用，由 `platform` 直接调用 `orca.notify`。禁止出现空的 `catch`。

### 界面文字

- 界面上禁止写死文字，一律使用 `t("English source text")`。英文原文就是翻译键，`zhCN` 字典必须完整，由测试检查。
- 写进笔记的属性名和选项名不走 `t()`，而是来自 `infra/orca/codec` 中的中英文名称表。

### React

- React 和 Valtio 使用全局的 `window.React`、`window.Valtio`，禁止打包进插件。
- 组件只通过 `ui/hooks` 调用用例，不直接访问仓储。
- 命令回调、菜单项回调这类不是 React 组件的 `ui` 代码用不了 hooks，它们直接调用由 `platform` 注入的用例；同样不直接访问仓储，也不调用 Orca 的读写 API。
- 每个自定义渲染器都配一个纯文本转换器。

## 5. 测试

| 对象 | 方式 | 要求 |
|---|---|---|
| `domain` | Vitest 单元测试 | 每条规则都有测试，边界场景（`GLOSSARY.md` 中的每条约定）必须覆盖 |
| `application` | Vitest，配合内存版仓储和固定时钟 | 每个用例都有测试 |
| `infra/orca/codec` | Vitest，使用 `tests/fixtures` 中的真实 Block 样本 | 中英文名称、空值、异常数据都要覆盖 |
| `infra`（其余部分）、`ui`、`platform` | 在 Orca 中手动验证 | 每一步的完成标准里列出验证清单。加载、卸载、注册表属于 Orca 行为，不写假宿主测试 |
| 架构 | `tests/architecture.test.ts` | 永远保持通过 |

修复缺陷时，先写一个能复现缺陷的测试。

## 6. 工具链

- 包管理：pnpm。所有依赖锁定精确版本，不使用 `^`、`~`。
- TypeScript 7，开启 `strict`，并加上 `noUncheckedIndexedAccess`、`noImplicitOverride`、`noFallthroughCasesInSwitch`。
- 构建用 Vite，测试用 Vitest，lint 和格式化用 Biome（ADR 0010）。
- 提交信息遵循 Conventional Commits（`feat:`、`fix:`、`refactor:`、`test:`、`docs:`、`chore:`）。
- CI（GitHub Actions）在每次推送时运行：类型检查、Biome、Vitest、构建。
- 本机测试：`pnpm deploy:local` 构建后把插件复制到 `ORCA_PLUGINS_DIR/orca-plugin-nextaction/`。`ORCA_PLUGINS_DIR` 写在仓库根目录的 `.env.local`（已被 git 忽略），例如 `ORCA_PLUGINS_DIR=/mnt/c/Users/<你>/Documents/orca/plugins`。复制后在 Orca 中停用再启用插件。

## 7. 完成的定义

一项改动只有满足以下所有条件才算完成：

- 类型检查、lint、测试、构建全部通过。
- 新规则有测试，修复的缺陷有回归测试。
- 新增的界面文字都已有中文翻译。
- 新注册的东西都经过注册表。
- 引入了新术语就更新 `GLOSSARY.md`；做出了符合条件的决策就补一个 ADR。
- 在 Orca 中按验证清单手动检查过。
