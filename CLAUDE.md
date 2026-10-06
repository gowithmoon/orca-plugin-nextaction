# NextAction（今天干点啥）

Orca Note（虎鲸笔记）的 GTD 任务管理插件，插件名 `orca-plugin-nextaction`（中文名：今天干点啥）。

## 文档分工

每份文档只管一件事，动手前读与任务相关的那几份：

| 文档 | 管什么 | 何时读 |
|---|---|---|
| `CONTEXT.md` | 术语 | 每次。代码、文档、Issue 都用这里的词，_Avoid_ 列出的词不用 |
| `docs/adr/` | 已做的决策及理由 | 改动涉及数据存储、任务识别、父子关系、分层、时间、重复、缓存、工具链时 |
| `docs/ARCHITECTURE.md` | 工程规矩：分层、目录、编码、测试、完成的定义 | 写代码前 |
| `docs/ROADMAP.md` | 步骤顺序和每一步的范围 | 开始一项工作前，确认它属于当前这一步 |
| GitHub Issue | 当前这一步的详细需求 | 实施具体功能时，以 Issue 为准 |

文档之间出现冲突（例如 Issue 的做法违反某个 ADR）时，先停下来向用户指出，商定后修改其中一份文档，再继续写代码。路线图每一步的细节在开始那一步时与用户讨论，结论写进 Issue。

## 最容易出错的规矩

完整规矩见 `docs/ARCHITECTURE.md`，以下几条最常被违反：

- `domain`、`application` 保持纯净：当前时间从 `Clock` 端口传入，Orca 访问只发生在 `infra`，React 只出现在 `ui`。`ui` 通过 `ui/hooks` 调用用例，不直接调用 Orca 读写 API。
- 所有 `register*`、监听器、样式注入都经过 `platform/registry.ts`，`unload` 时由注册表统一释放。
- 代码中的状态等值使用英文键（`inbox`、`todo`……）；属性名、选项名、`PropType` 类型码只出现在 `infra/orca`。
- 界面文字一律写成 `t("English source")`，同时补全 `zhCN` 翻译。
- 当前所在的路线图步骤之外的功能，记下来留给对应步骤，不顺手实现。

## Orca API 资料

Orca 的 API 以 `plugin-docs/` 和 `src/orca.d.ts` 为准，入口索引是 `plugin-docs/modules.md`：

- `documents/Quick-Start.md`：项目结构、`load`/`unload` 生命周期、插件设置
- `documents/Core-Commands.md`：应用级命令（面板、导航等），用 `orca.commands.invokeCommand` 调用
- `documents/Core-Editor-Commands.md`：编辑器命令（块、属性、标签、别名），用 `orca.commands.invokeEditorCommand` 调用
- `documents/Backend-API.md`：后端接口（取块、`query`、日记），用 `orca.invokeBackend` 调用
- `documents/Custom-Renderers.md`：自定义渲染器与配套转换器
- `constants/db.md`：属性类型 `PropType` 和查询常量
- `types/orca.md`：全部类型定义，与 `src/orca.d.ts` 对应。文件很大，按标题搜索

文档没写清楚的实际行为，以 `docs/spikes/` 中的实测结论为准；需要新的实测时，停止写代码并将实测代码片段提供给用户，要求用户提供返回，并将结论补进 `docs/spikes/`，禁止猜测。`vendor/orca-simple-task/` 是一个现成的 Orca 任务插件（不纳入版本管理），可以参考 API 的实际用法，但它的设计不作为本项目的依据（例如它改名时删除旧标签，本项目用 `renameAlias`，见 ADR 0002）。

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (gowithmoon/orca-plugin-nextaction) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
