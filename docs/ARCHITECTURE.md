# 架构与工程规矩

本文件是写代码时必须遵守的规矩。术语以 [`CONTEXT.md`](../CONTEXT.md) 为准，每条规矩背后的理由见 [`docs/adr/`](./adr/)。规矩需要修改时，先改本文件（必要时补一个 ADR），再改代码。

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
  infra/orca/
    schema/                任务标签的结构定义、启动对齐、改名
    codec/                 Block ⇄ Task 编解码、中英文名称表
    repository/            TaskRepository 的实现
    query/                 QueryDescription2 的构建
  ui/
    panel/                 插件面板外壳与视图导航
    views/                 各个视图，每个视图一个子目录
    task-panel/            任务属性面板
    task-menu/             状态图标与任务操作菜单（菜单项通过登记的方式添加）
    capture/               快速捕获弹窗
    components/            可复用组件
    hooks/                 React hooks（只调用 application）
    styles/                CSS
  platform/
    bootstrap.ts           组合根：创建实现、注入用例、注册 UI
    registry.ts            注册表
    settings.ts            设置项的唯一定义处
  shared/
    l10n/                  t() 与翻译字典
tests/
  architecture.test.ts
  fixtures/                真实 Orca Block 的 JSON 样本
```

测试文件与被测文件放在同一目录，命名为 `*.test.ts`。

## 4. 编码规矩

### 命名

- 领域概念一律使用 `CONTEXT.md` 中的英文名（`Task`、`NextAction`、`LogicalDay` 等），不要使用其中列为 _Avoid_ 的词。
- 注册给 Orca 的所有标识符（命令、面板、渲染器、按钮、设置、broadcast 类型）都以 `nextaction.` 开头。
- 插件写入的块属性名以 `nextaction.` 开头，不允许以 `_` 开头。
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
- 属性名、类型码（`PropType`）、标签别名只在 `infra/orca` 中出现。
- 读写块属性中的 JSON 时，必须经过带版本号的编解码函数；遇到无法解析的数据时保留原值并记录警告，禁止静默覆盖。
- 视图按需查询，缓存遵循 ADR 0007：插件写入后让相关缓存失效。

### 注册与清理

- 所有 `register*`、事件监听、样式注入、定时器都通过 `platform/registry.ts` 进行。注册表在 `unload` 时按注册的逆序全部释放。代码中禁止出现游离的 `register*` 调用。
- 不覆盖、不干扰 Orca 自带的命令、渲染器和界面。

### 错误处理

- `infra` 把 Orca 的失败转换成插件自己的错误类型；`application` 不吞掉错误。
- 错误统一在 `ui` 层捕获，通过 `orca.notify` 告知用户。禁止出现空的 `catch`。

### 界面文字

- 界面上禁止写死文字，一律使用 `t("English source text")`。英文原文就是翻译键，`zhCN` 字典必须完整，由测试检查。
- 写进笔记的属性名和选项名不走 `t()`，而是来自 `infra/orca/codec` 中的中英文名称表。

### React

- React 和 Valtio 使用全局的 `window.React`、`window.Valtio`，禁止打包进插件。
- 组件只通过 `ui/hooks` 调用用例，不直接访问仓储。
- 每个自定义渲染器都配一个纯文本转换器。

## 5. 测试

| 对象 | 方式 | 要求 |
|---|---|---|
| `domain` | Vitest 单元测试 | 每条规则都有测试，边界场景（`CONTEXT.md` 中的每条约定）必须覆盖 |
| `application` | Vitest，配合内存版仓储和固定时钟 | 每个用例都有测试 |
| `infra/orca/codec` | Vitest，使用 `tests/fixtures` 中的真实 Block 样本 | 中英文名称、空值、异常数据都要覆盖 |
| `infra`（其余部分）、`ui` | 在 Orca 中手动验证 | 每一步的完成标准里列出验证清单 |
| 架构 | `tests/architecture.test.ts` | 永远保持通过 |

修复缺陷时，先写一个能复现缺陷的测试。

## 6. 工具链

- 包管理：pnpm。所有依赖锁定精确版本，不使用 `^`、`~`。
- TypeScript 7，开启 `strict`，并加上 `noUncheckedIndexedAccess`、`noImplicitOverride`、`noFallthroughCasesInSwitch`。
- 构建用 Vite，测试用 Vitest，lint 和格式化用 Biome（ADR 0010）。
- 提交信息遵循 Conventional Commits（`feat:`、`fix:`、`refactor:`、`test:`、`docs:`、`chore:`）。
- CI（GitHub Actions）在每次推送时运行：类型检查、Biome、Vitest、构建。

## 7. 完成的定义

一项改动只有满足以下所有条件才算完成：

- 类型检查、lint、测试、构建全部通过。
- 新规则有测试，修复的缺陷有回归测试。
- 新增的界面文字都已有中文翻译。
- 新注册的东西都经过注册表。
- 引入了新术语就更新 `CONTEXT.md`；做出了符合条件的决策就补一个 ADR。
- 在 Orca 中按验证清单手动检查过。
