# NextAction（今天干点啥）

Orca Note（虎鲸笔记）的 GTD 任务管理插件，插件标识 `orca-plugin-nextaction`。1.0.0 已发布，路线图的十八步全部完成，现在按 GitHub Issue 维护和迭代。

## 文档分工

每份文档只管一件事，动手前读与任务相关的那几份：

| 文档 | 管什么 | 何时读 |
|---|---|---|
| `GLOSSARY.md` | 术语 | 每次。代码、文档、Issue、提交信息都用这里的词，_Avoid_ 列出的词不用 |
| `docs/ARCHITECTURE.md` | 工程规矩：分层、目录、编码、Orca 行为约束、测试、完成的定义 | 写代码前 |
| `docs/adr/` | 已做的决策及理由，文件名就是主题 | 改动碰到某个 ADR 的主题时 |
| `docs/spikes/` | Orca 实际行为的实测结论，索引在 `README.md` | 依赖 Orca 文档没写清楚的行为时 |
| GitHub Issue | 一项工作的需求 | 实施时以 Issue 为准 |
| `docs/ROADMAP.md` | 最初的计划，已全部完成，只作历史记录 | 查某个功能当初的范围和取舍。新工作写进 Issue，不往路线图里加步骤 |
| `docs/guide/` | 用户手册，中文为原稿（`zh/`），目录在 `zh/README.md` | 改了用户能看到的行为时，同步改对应章节 |
| `README.md`、`README.en.md` | 功能概览、安装、发版步骤 | 改了功能概览或安装方式时，中英两份一起改 |

文档之间出现冲突（例如 Issue 的做法违反某个 ADR）时，先停下来向用户指出，商定后修改其中一份文档，再继续写代码。

版本号：新功能升次版本，修复升修订。发版按 `README.md` 的"发布新版本"一节。

## 最容易出错的规矩

完整规矩见 `docs/ARCHITECTURE.md`，以下几条最常被违反：

- `domain`、`application` 保持纯净：当前时间从 `Clock` 端口传入，Orca 访问只发生在 `infra`，React 只出现在 `ui`。`ui` 通过 `ui/hooks` 调用用例。
- 所有 `register*`、监听器、样式注入都经过 `platform/registry.ts`，`unload` 时由注册表统一释放。
- 代码中的状态等值使用英文键（`inbox`、`todo`……）；属性名、选项名、`PropType` 类型码只出现在 `infra/orca`。
- 界面文字一律写成 `t("English source")`，同时补全 `zhCN` 翻译。
- 写笔记只经过 `infra/orca/orca-calls.ts` 的 `invokeEditorCommand` 和 `invokeGroup`，这样写入才进得了 Orca 的撤销历史。写入走活动面板的编辑器，插件面板靠藏起来的块编辑器写（ADR 0014）。

## 验证

- 改完跑 `pnpm check`（类型检查、Biome、Vitest、构建）。
- TDD 只用于 `domain`、`application` 的业务规则。Orca 行为和界面由用户在 Orca 中手动验证：`pnpm build` 之后列出验证清单交给用户。
- 代码审查的意见批判性地接受：只实现插件运行环境真正需要的东西。

## Orca API 资料

API 以 `plugin-docs/` 和 `src/orca.d.ts` 为准，入口索引是 `plugin-docs/modules.md`。`plugin-docs/types/orca.md` 很大，按标题搜索。

文档没写清楚的行为，先查 `docs/spikes/`；那里也没有时，停止写代码，把实测脚本（放在 `.scratch/spikes/`）交给用户在 Orca 控制台运行，拿到返回后把结论补进 `docs/spikes/`。

`vendor/` 下是其他 Orca 插件（不纳入版本管理）：`orca-simple-task` 可以参考 API 的实际用法，`orca-plugin-whiteboard` 可以参考画布手势。它们的设计不作为本项目的依据（例如 `orca-simple-task` 改名时删除旧标签，本项目用 `renameAlias`，见 ADR 0002）。

## Agent skills

- Issue tracker: GitHub Issues (gowithmoon/orca-plugin-nextaction) via `gh`. See `docs/agents/issue-tracker.md`.
- Triage labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.
- Domain docs: single-context, one `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
