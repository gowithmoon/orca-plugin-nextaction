# 业界项目管理工具调研：功能、视图、生命周期与数据结构

> 为路线图第十一步"项目"准备的调研。访问日期统一为 2026-10-15。只采用官方帮助中心、官方 API 或数据模型文档、开源源码作为依据；找不到一手来源的，标为"未能从一手来源确认"。本文只调研和摆选项，不对本插件的做法下结论。

## 1. 摘要

1. **"项目"有三种建模方式。**
   - 独立对象：Asana、Linear、Jira、OpenProject、Plane，任务挂到项目上。
   - 容器：ClickUp 的 Folder 或 List、Monday 的 board、Basecamp 的项目，任务就在容器里。
   - 一种更大的任务：MS Project 的摘要任务、Wrike 的 project（folder 的一种）、Notion 数据库中的一页。
   - 无论哪种方式，项目的子结构都是"项目 → 可选的分组或里程碑 → 任务 → 子任务"。
2. **任务能否同时属于多个项目，各家分歧明显。**
   - 允许：Asana、Wrike、GitHub Projects、ClickUp（需要开启 TIML）。
   - 不允许：Linear、Jira、Plane、OpenProject、Planner。Linear 文档写明 "only one project at a time"。
3. **项目能否嵌套，多数工具选择不嵌套，另加一层容器。**
   - 不嵌套，另设项目组合层：Linear 有 Initiative，Asana 有 Portfolio，Jira 有 Plans 的层级，Plane 有 Initiative。
   - 允许嵌套：OpenProject 有 parent 字段，Wrike 有 subproject，ClickUp 有 Subfolder。
4. **项目状态大多是"固定类别 + 可改名称"。**
   - 类别大致都是：规划（backlog/planned）、进行中（started）、暂停（paused/on hold）、完成（completed）、取消（canceled）。
   - 例子：Linear 的状态 type、Plane 的 state group、Wrike 的四个状态分组、ClickUp 的四类状态。
   - 归档和完成是两回事。Asana、Linear、Jira、Basecamp 都把归档当作"从视野中移走"的操作，而不是一种状态。
5. **健康度（on track / at risk / off track）和生命周期状态，主流做法是分开存放。**
   - 分开：Linear、Atlassian Home、Plane、Monday Portfolio、Wrike。健康度通常挂在定期的项目更新上（Linear、Plane、Atlassian Home），或者由系统计算（Wrike）。
   - 混在一个枚举里：Asana 的 `status_type`、GitHub 的 status update、OpenProject 的项目状态。
6. **进度的默认口径是"按子项数量"。**
   - 按数量：GitHub、Plane、Notion 模板、Monday、Jira Plans、Asana Portfolio（可选按任务或按 milestone）。
   - 按估算加权：Linear 用 estimate 加权，进行中的任务算 0.25。
   - 按工期或工时：MS Project 按工期，OpenProject 按工时或按状态。
   - 人工判断：Basecamp 的 Hill Chart 和 Gauge。
7. **"定期项目更新"是团队工具共有的功能，并且是停滞检测的主要依据。**
   - Asana 每周四提醒 owner 写 status update，Linear 可以设提醒频率，Atlassian Home 每周五提醒，Basecamp 有 Automatic Check-ins。
   - 停滞提示多由"更新缺失"触发：Linear 的 Update Missing 和灰色不活跃状态。
   - 少数按活动或逾期判断：Jira Summary 的 dormant，Wrike 由逾期和偏差计算健康度，Plane 自动关闭长期不动的工作项。
8. **视图的共性。**
   - 每家都有：项目列表或项目组合总览、单个项目的概览页、任务列表或表格、看板。
   - 绝大多数有：时间线或甘特。
   - 偏团队的视图：工作量、仪表盘、燃尽图。
   - 概览页的内容基本一致：属性、描述、进度、里程碑、最近一次状态更新。
9. **里程碑多数不是独立对象。**
   - 作为任务的一种类型或标记：Asana、ClickUp、MS Project、Wrike。
   - 作为独立对象：Linear 和 Plane 的 milestone、Jira 的 version。
   - 阶段和阶段关口是重型方法论（PRINCE2、Project Online EPT、OpenProject life cycle）的做法，轻量工具一般不提供。
10. **对本插件而言**，GTD 视角下最有价值的部分是：项目清单、项目进度、"项目没有下一步行动"或"长期无进展"的检测，以及与回顾的结合。资源、权限、协作类功能不适用。具体的选项见第 5 节。

## 2. 方法论参照

**PMBOK / PMI**：PMI 官网和 PMI Lexicon of Project Management Terms 的 PDF 抓取时都返回 403，没有读到原文。下面两条只是搜索摘要。
- 阶段（phase）的定义："collections of logically related project activities that culminates in the completion of one or more deliverables"（PMI 官网 What is a Project 页面的搜索摘要）。
- PMI 学习库中的一篇会议论文把关口（gate）描述为"每个阶段末尾一系列计划好的、标准化的评审"（[Tollgate Methodology](https://www.pmi.org/learning/library/gates-success-tollgate-methodology-6842)，搜索摘要，不是标准原文）。
- project life cycle、phase gate、milestone、status report、close project 的 PMI 官方定义，未能从一手来源确认。

**PRINCE2**：在 AXELOS 和 PeopleCert 的官方站点上没有检索到可读的原文。以下来自非官方站点，只作线索。
- 7 个流程：Starting up、Directing、Initiating、Controlling a stage、Managing product delivery、Managing a stage boundary、Closing。项目按 management stage 推进。每个阶段结束时执行 Managing a stage boundary，由项目委员会决定继续还是停止，起到阶段关口的作用。Closing 是项目的正式结束，包括确认验收、评估绩效（[prince2.com，ILX 培训机构](https://www.prince2.com/usa/prince2-processes)；[prince2.wiki: stage boundary](https://prince2.wiki/processes/managing-a-stage-boundary/)）。
- Highlight report：项目经理定期向委员会报告阶段是否在容差（tolerance）之内，涉及时间、成本、质量、范围、收益、风险等。委员会据此在两个阶段边界之间按例外管理，超出容差时才上报（[highlight report](https://prince2.wiki/management-products/reports/highlight-report/)；[manage by exception](https://prince2.wiki/principles/manage-by-exception/)）。

**与工具的对应**：方法论中的三个概念在工具里都能找到对应：
- 阶段与关口：OpenProject 的 phases 和 phase gates，飞书项目的节点流。
- 定期状态报告：Asana、Linear、GitHub、Plane 的 status update 或 project update。
- 收尾：多数工具的项目"完成/归档"。

## 3. 逐个工具

### 3.1 Jira（含 Jira Work Management、Plans）

Jira Cloud 帮助中心的界面文字已经把 project 改叫 space，把 issue 改叫 work item，URL 仍用旧名。本节沿用 project/issue。REST 字段取自官方 OpenAPI 规范（[swagger-v3](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json)，下称 swagger）。Jira 里与"项目"相关的对象有两个：Jira project 和 Atlassian Home 的 project（原 Atlas）。两者分开说明。

**数据结构**
- 层级：站点 → project → work item。默认层级是 Epic（level 1）、Story 等标准类型（level 0）、subtask（level −1）。Premium 和 Enterprise 可以在 Epic 之上加层，例如 Initiative。层级在全局 scheme 中配置，改动会影响所有使用这个 scheme 的 plan 和 project，可能打断已有的父子关系（[custom hierarchy levels](https://support.atlassian.com/jira-software-cloud/docs/configure-custom-hierarchy-levels-in-advanced-roadmaps/)）。
- Jira `Project` 对象的字段（swagger）：`key`、`name`、`description`、`lead`、`projectTypeKey`（software、service_desk、business、product_discovery）、`projectCategory`、`components`、`versions`、`issueTypes`、`issueTypeHierarchy`、`roles`、`permissions`、`isPrivate`、`archived`/`archivedDate`、`deleted`/`retentionTillDate`、`style`（classic、next-gen）。
  - 没有状态、健康度、开始日期、目标日期字段。
  - `ProjectCategory` 只有 `id`、`name`、`description`，是扁平分类。
- 一个 issue 只能属于一个 project，project 也不能嵌套。这两点没有找到官方明文，只能从对象结构推断：issue 只有一个 project 字段，`ProjectCategory` 是扁平的。官方知识库提到 epic 进度条只统计同一 project 内的子项，可见父子关系可以跨 project。
- 依赖是 issue 之间的链接：`IssueLink`（`type`、`inwardIssue`、`outwardIssue`），类型 `IssueLinkType`（`name`、`inward`、`outward`）在全局配置，默认有 Blocks 等（swagger；[issue linking](https://support.atlassian.com/jira-cloud-administration/docs/configure-issue-linking/)）。
  - 没有 FS、SS 之类的类型区分。
  - 项目 timeline 只显示同一 project 内的 Blocks 链接（[dependencies on timeline](https://support.atlassian.com/jira-software-cloud/docs/manage-dependencies-between-epics-on-the-timeline/)）。
  - Plans 有专门的 Dependencies 视图（[dependencies report](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-dependencies-report-in-advanced-roadmaps/)）。
- Atlassian Home project 的字段：name、emoji、visibility、About（What、Why、怎样算成功）、单一 owner、contributors、followers、links。它可以和一个 epic 同步 name、start date、target date、tags（[what is a project](https://support.atlassian.com/platform-experiences/docs/what-is-a-project/)）。Analytics 中的表 `atlassian_project` 有 `owner_id`、`phase`、`status`、`is_archived`、`started_at`、`target_date_type` 等列（[schema](https://support.atlassian.com/analytics/docs/schema-for-atlassian-projects/)）。

**生命周期**
- Jira project 本身没有 workflow 状态，只有归档和删除两个标志。
  - 归档：`POST /project/{id}/archive`。
  - 删除：`DELETE` 时可以进回收站。
  - 恢复：`POST /project/{id}/restore`，已归档和回收站里的都能恢复（swagger）。
- 归档 project 只在 Premium 和 Enterprise 提供（[archive a project](https://support.atlassian.com/jira-cloud-administration/docs/archive-a-project/)）。
  - 归档后，其中的 issue 不出现在搜索里，可以通过链接查看，但不能编辑。
  - components、versions 跟着项目一起归档。
  - 恢复时，失效的 epic 关系不会还原。
- 单个 issue 也可以归档（[archive an issue](https://support.atlassian.com/jira-software-cloud/docs/archive-an-issue/)）。
- Epic、Initiative 是 issue，走 issue 的 workflow。它们的状态是否可以自定义，没有找到直接的官方表述。
- Home project 把生命周期和健康度分成两个字段（schema）：
  - `phase`：示例值 pending、in progress、paused、done。
  - `status`：示例值 On track、At risk、Off track。
- 暂停要通过发一条 update 来设置，暂停期间不再发提醒。Archive 是单独的操作，不是一种状态，归档后默认搜索找不到（[pause or archive](https://support.atlassian.com/platform-experiences/docs/pause-or-archive-projects-and-goals/)）。Home 的 `phase` 有没有 cancelled，未能从一手来源确认。
- 项目模板未能从一手来源确认：没有抓到专门的帮助页。

**视图**
- 单个 project 的视图有 Summary、List、Board、Calendar、Timeline、Backlog、Reports、Dashboards。business project 有 list、board、calendar、timeline（[summary view](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-summary-view/)；[business projects](https://support.atlassian.com/jira-software-cloud/docs/work-in-jira-business-projects/)）。
- Summary 的 Work pulse 把 project 判定为 empty、dormant、off track、on track 之一，并用 badge 标出待分诊、stale work 等（summary view）。
- Timeline 显示 work item 的时间、时长和依赖（[timeline](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-timeline-and-how-do-i-use-it/)）。
- Reports（[generate a report](https://support.atlassian.com/jira-software-cloud/docs/generate-a-report/)）：
  - Scrum：Burndown、Burnup、Sprint、Velocity、Epic Burndown、Release Burndown、Version Report 等。
  - Kanban：Control Chart、Cumulative Flow Diagram（用来发现瓶颈）。
  - 通用：Created vs Resolved、Average Age、Workload 等。
- Plans 有 summary（Work item progress、Team progress、Status overview、Key dependencies）、timeline、calendar、list、Program board（[plan summary](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-summary-view-of-your-plan/)）。
- 项目列表的默认排序和分组，未能从一手来源确认。

**进度与跟踪**
- 项目 timeline 上的进度条按子 work item 的状态汇总，包括 subtask（[progress monitor](https://support.atlassian.com/jira-software-cloud/docs/enable-and-disable-the-progress-monitor-in-your-project/)）。
- Plans 有两种算法：按 work item 数，只看直接下级；按估算，包含各层子项（[by issue count](https://support.atlassian.com/jira-software-cloud/docs/track-progress-using-issue-count-in-advanced-roadmaps/)；[by estimates](https://support.atlassian.com/jira-software-cloud/docs/track-progress-using-estimates-in-advanced-roadmaps/)）。这两条只有搜索摘要，正文没有抓到。
- Home 有定期更新的提醒（[update reminders](https://support.atlassian.com/platform-experiences/docs/update-reminders-for-goals-and-projects/)）：
  - project owner 每周五收到写 update 的提醒，followers 每周一收到汇总。
  - goal 每月提醒一次。
  - paused 和 pending 状态不发提醒。
- 停滞提示：Summary 的 dormant 判定和 stale work badge（summary view）。

**核心功能**：
- 目标关联：Atlassian Goals、Home project 与 issue 关联（[goals & projects](https://support.atlassian.com/platform-experiences/docs/track-goals-and-projects-across-atlassian-products/)）。
- 里程碑：用 versions，也就是 releases。
- 风险：Home 用 At risk、Off track 表示；Jira 内没有专门的风险对象，官方 KB 建议用自定义字段做 RAG（[RAG KB](https://support.atlassian.com/jira/kb/how-to-create-health-status-indicator-fields-like-rag-or-traffic-light-in-jira-and-advanced-roadmaps/)）。
- 其他：Plans 的容量与 Team progress、roles 与 permissions、Home 的 followers 通知、自动化（[automation smart values](https://support.atlassian.com/cloud-automation/docs/automation-smart-values-atlassian-projects/)）。

### 3.2 Asana

API 字段取自官方 OpenAPI 规范（[asana_oas.yaml](https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml)），帮助中心页面经无头浏览器渲染后读取正文。

**数据结构**
- 层级：workspace/organization → team → project → section → task → subtask。每个项目只属于一个 workspace 和一个 team（[object hierarchy](https://developers.asana.com/docs/object-hierarchy)）。
- portfolio 是"collections of projects (or other portfolios)"，是一个独立的集合层，不在 team 之下。portfolio 可以嵌套，嵌套后 Timeline 标签页不可用（object hierarchy；[portfolios overview](https://help.asana.com/s/article/portfolios-overview)）。
- subtask 最多 5 层。subtask 不继承父任务的项目和 assignee（[subtasks](https://help.asana.com/s/article/subtasks)）。
- Project 没有 parent 字段，项目不能嵌套。多层结构靠 portfolio 实现。
- Project 的字段（[API: projects](https://developers.asana.com/reference/projects)）：
  - 基本信息：`name`、`notes`/`html_notes`、`color`、`icon`、`project_brief`。
  - 人员：`owner`（可以为空）、`members`、`followers`。
  - 归属：`team`、`workspace`。
  - 日期：`start_on`、`due_on`。
  - 状态：`completed`/`completed_at`/`completed_by`、`archived`、`current_status_update`（原 `current_status` 已废弃）。
  - 视图与字段：`default_view`（list、board、calendar、timeline）、`custom_fields`（项目自己的字段值）、`custom_field_settings`（项目内任务可用的字段）。
  - 权限：`privacy_setting`、`default_access_level`。
  - 来源：`created_from_template`。
  - 项目没有优先级字段，优先级通常用自定义字段表达。
- Portfolio 的字段：`name`、`owner`、`members`、`start_on`、`due_on`、`archived`、`current_status_update`、`custom_fields`（[API: portfolios](https://developers.asana.com/reference/portfolios)）。
- 一个 task 可以不属于任何项目，也可以同时属于多个项目（multi-homing），用 `memberships`（项目加 section）、`addProject`、`removeProject` 管理。它还可以同时是另一个任务的 subtask（object hierarchy；[API: tasks](https://developers.asana.com/reference/tasks)）。帮助中心说，任务加入多个项目时不会复制，一处修改到处可见（[task types](https://help.asana.com/s/article/different-types-of-tasks)）。
- 依赖挂在 task 上：`dependencies`、`dependents`，每个任务合计最多 30 条（[add dependencies](https://developers.asana.com/reference/adddependenciesfortask)）。界面上支持 FS、FF、SS、SF 四种类型，默认 FS，日期可以自动顺延（[dependency types](https://help.asana.com/s/article/dependency-types)）。OpenAPI 里没有依赖类型和 lag 字段。
- milestone 和 approval 都是 task 的 `resource_subtype`。milestone 表示"a single moment in time"，不能设开始日期（API: tasks）。

**生命周期**
- 项目没有工作流状态字段，只有 `completed`、`archived` 两个布尔值，加上最新的一条 status update（API: projects）。
- status update 的 `status_type`（[API: status updates](https://developers.asana.com/reference/status-updates)）：
  - project 和 portfolio：`on_track`、`at_risk`、`off_track`、`on_hold`、`complete`、`dropped`。
  - goal：`on_track`、`at_risk`、`off_track`、`achieved`、`partial`、`missed`、`dropped`。
  - 健康度（on track、at risk、off track）和终态（暂停、完成、放弃）混在同一个下拉框里。status update 只能新建和删除，不能修改。
- 在界面上"完成项目"就是在状态下拉中选 Complete。帮助中心原话："Completed projects should be marked as Complete in the status update instead of archiving them… Archiving a project … does not update a project's status."。一个项目可以同时是已完成和已归档（[progress & status updates](https://help.asana.com/s/article/project-progress-and-status-updates)）。
- 归档（[understanding projects](https://help.asana.com/s/article/understanding-projects)）：
  - 只有 admin 能归档。归档后项目在界面上默认隐藏，凭链接或搜索仍能打开，可以随时恢复。
  - 归档项目里分配给你的任务仍出现在 My tasks 里；帮助中心没有说归档会完成任务。
  - 删除项目时，已分配的任务和属于多个项目的任务不会被删除。
- 完成父任务不会自动完成它的 subtask（subtasks）。
- 项目模板：可以从项目另存为模板。模板里的日期相对于项目开始日或截止日计算，可以用角色占位分配任务，可以带字段、表单和规则（[project templates](https://help.asana.com/s/article/project-templates)；[API: project templates](https://developers.asana.com/reference/project-templates)）。

**视图**
- 项目视图有 Overview、List、Board、Timeline、Gantt、Calendar、Dashboard、Workflow、Messages、Files（[views](https://help.asana.com/s/article/project-customization-and-views)）。List、Board、Calendar、Files、Messages 各自的细节没有逐篇核对。
- Overview：项目描述、角色、关联的 goal 和 portfolio、key resources、project brief、milestone 列表、当前状态，以及历史 status update 的圆点时间线（[overview tab](https://help.asana.com/s/article/project-overview-tab)）。
- Timeline：有日期的任务画在时间轴上，没日期的放在 Unscheduled 栏，可以在上面画依赖（[timeline](https://help.asana.com/s/article/timeline)）。
- Gantt：带自动排程、工期和基线对比（[gantt](https://help.asana.com/s/article/gantt-view)）。
- Dashboard：项目内有 burnup 图和计数图，另有跨项目的 universal reporting（[dashboards](https://help.asana.com/s/article/reporting-with-dashboards)）。
- Workload：按任务数或 effort 统计，可以给每个人设容量（[workload](https://help.asana.com/s/article/portfolio-workload-and-universal-workload)）。
- Portfolio 列表：每行一个项目或子 portfolio，显示 owner、priority、status、due date、任务进度或 milestone 进度。可以按名称、状态、owner、日期、优先级、剩余时间等排序，按 owner、status、due date 分组，可以把当前布局存为默认。另有 Portfolio Timeline 和 Progress 标签页，后者统计各健康度的项目数（[portfolio views](https://help.asana.com/s/article/portfolio-views)；[portfolio progress](https://help.asana.com/s/article/portfolio-progress-and-reporting)）。出厂默认按什么排序，未能从一手来源确认。

**进度与跟踪**
- Portfolio 可以给每个项目选"按任务"或"按 milestone"显示进度（portfolio views）。计数来自 `getTaskCountsForProject`，返回 `num_tasks`、`num_completed_tasks`、`num_milestones`、`num_completed_milestones`（[task counts](https://developers.asana.com/reference/gettaskcountsforproject)）。
- Goal 的进度可以手填，也可以自动计算。自动计算的来源有子 goal、项目的任务或 milestone 完成率、关联任务（[goals progress](https://help.asana.com/s/article/progress-status-and-connecting-work-to-goals)；[API: goals](https://developers.asana.com/reference/goals)）。
- status update 的结构（progress & status updates）：
  - 内容：标题、状态（必选）、项目信息、Summary、What we've accomplished、Next steps、可以拖入的 highlights（例如已完成的 milestone、逾期任务）、图表。
  - 发布时数据被快照冻结，以后任务改动不影响已发布的更新。
  - portfolio 的 update 还有 What's blocked 一块（portfolio progress）。
- 提醒：项目 owner 每周四收到一个"更新项目状态"的任务，截止日是周五，可以关掉。任何人都可以在 Overview 或 portfolio 里 Request a status update（progress & status updates）。
- 没有查到"多久没更新就标为停滞"的自动提示。

**核心功能**：
- Goals。
- Milestones。
- Approvals（[approvals](https://help.asana.com/s/article/approvals)）。
- Rules 自动化（[rules](https://help.asana.com/s/article/rules)）。
- Forms（[forms](https://help.asana.com/s/article/forms)）。
- 四类依赖与关键路径（[task dependencies](https://help.asana.com/s/article/task-dependencies)）。
- Workload 与容量、Dashboards 与跨项目报表。
- 四级项目权限。
- owner 状态更新、新任务、新对话的通知（[owner & members](https://help.asana.com/s/article/project-owner-and-members)）。
- 模板。

### 3.3 Linear

字段以官方 GraphQL schema 为准（[schema.graphql](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)，下称 schema）。

**数据结构**
- 层级：Workspace → Teams（可以有 sub-teams）→ Issues。另一条线是 Initiatives（可以有 sub-initiatives）→ Projects（项目里有 milestones）→ Issues。Cycles 是团队的时间盒，不属于工作层级（[conceptual model](https://linear.app/docs/conceptual-model)）。
- Issue 的归属：恰好属于一个 `team`；最多属于一个 `project`、一个 `projectMilestone`、一个 `cycle`；可以有 `parent`（schema）。文档原话："Issues can only be associated with one project at a time"。要把工作分到不同项目，就拆成 sub-issues，分别放进各个项目（[projects](https://linear.app/docs/projects)）。
- Project 的主要字段（schema）：
  - 基本信息：`name`、`description`（短描述）、`content`（正文）、`icon`、`color`、`labels`。
  - 人员：`lead`（只有一人）、`members`。
  - 状态与健康度：`status`（指向 ProjectStatus 对象）、`health`（取最近一次 update 的值）、`lastUpdate`。
  - 优先级：`priority`，0 表示无，1–4 依次为 Urgent、High、Medium、Low。
  - 日期：`startDate`、`targetDate`，以及 `startDateResolution`、`targetDateResolution`（日期的粒度，可以是年、半年、季、月或具体某天）。
  - 进度：`progress`、`scope`，以及历史序列 `progressHistory`、`scopeHistory`。
  - 关联：`teams`、`initiatives`、`projectMilestones`、`relations`。
  - 生命周期时间戳：`startedAt`、`completedAt`、`canceledAt`、`archivedAt`、`autoArchivedAt`。
  - 提醒设置：`updateReminderFrequency`。
  - 其他：`convertedFromIssue`。
- `ProjectStatus` 的字段：`name`、`color`、`description`、`position`、`indefinite`、`type`。`type` 是固定枚举 backlog、planned、started、paused、completed、canceled（schema）。
- 一个项目可以属于多个 team，由 lead team 决定可用哪些状态（projects；[project status](https://linear.app/docs/project-status)）。从 schema 的结构看，一个项目可以属于多个 initiative，但文档没有明说。
- Project 没有 parent 字段，项目不能嵌套；milestone 可以转成独立的项目（[milestones](https://linear.app/docs/project-milestones)）。Initiative 可以嵌套，最多五层，可以有多个父级，属于 Enterprise 功能（[sub-initiatives](https://linear.app/docs/sub-initiatives)）。
- 依赖分两层。
  - issue 之间有 blocked、blocking、related、duplicate 四种关系，blocker 解决后关系移入 Related（[issue property](https://linear.app/docs/issue-property)）。
  - 项目之间的依赖只支持 end → start 一种，可以锚定到 milestone。依赖在 timeline 上画成连线，被违反时变红。拖动上游项目时，处于 backlog 或 planned 的下游项目一起顺延（[project dependencies](https://linear.app/docs/project-dependencies)）。

**生命周期**
- 项目状态可以自定义，但每个状态必须归入五个类别之一：Backlog、Planned、Started、Completed、Canceled。原来的 Paused 类别已改成 Planned 类别下的一个状态，API 枚举中仍保留 `paused`（[custom statuses changelog](https://linear.app/changelog/2024-03-19-custom-statuses-for-projects)；project status）。
- `ProjectStatus.indefinite` 为 false 的状态下，项目长时间不活跃可能触发提醒或自动归档。官方举的例子是给长期工作用的 "Maintenance" 状态（schema；projects）。
- health 只有 On track、At risk、Off track 三个值，只能随 project update 一起写，与 status 是两回事。没有 update 时 health 为空（[updates](https://linear.app/docs/initiative-and-project-updates)）。
- 归档全部自动进行，不能手动归档。项目被自动归档要同时满足三个条件：状态处于 completed 或 canceled；超过设定的时长；项目里的 issue 都已经可以归档。另外，未完成项目里的 issue 不会被自动关闭（[delete & archive](https://linear.app/docs/delete-archive-issues)）。项目完成或取消时，未完成 issue 怎么处理，未能从一手来源确认。
- 项目模板可以预置描述、teams、status、lead、members、initiatives、milestones 和一批初始 issue（[project templates](https://linear.app/docs/project-templates)）。
- issue 层面：sub-issue 全部完成时可以自动完成父 issue，团队可以开关这个规则（[parent & sub-issues](https://linear.app/docs/parent-and-sub-issues)）。
- Initiative 的状态：Proposed、Planned、Active、Completed、Canceled（[initiatives](https://linear.app/docs/initiatives)）。

**视图**
- Projects 列表：有团队级和工作区级，可以切换 list、board、timeline，可以按 status、lead、target date 等分组（projects）。按优先级排序时，没有优先级的项目排在最后，同一优先级内可以手动拖动排序（[project priority](https://linear.app/docs/project-priority)）。默认的排序和分组，未能从一手来源确认。
- 项目概览页（Overview）：顶部是 status、lead、members、target date 等属性，下面是正文、文档和链接、milestones。侧栏显示进度图和每个 milestone 的完成百分比（[projects changelog](https://linear.app/changelog/2024-05-02-the-next-generation-of-linear-projects)；milestones）。
- Timeline：只显示项目，不显示 issue。可以按 initiative 分组，可以显示 milestones、依赖、health，可以叠加团队的 cycle（[timeline](https://linear.app/docs/timeline)）。
- Initiatives 视图：汇总下属项目最近一次 update 的 health，没有当前 update 的显示为灰（initiatives）。
- 其他视图：Cycles（[cycles](https://linear.app/docs/use-cycles)）、Insights（[insights](https://linear.app/docs/insights)）、Dashboards（[dashboards](https://linear.app/docs/dashboards)）。

**进度与跟踪**
- progress 的计算公式（schema）："(completed estimate points + 0.25 * in progress estimate points) / total estimate points"。
  - 不用 estimate 的团队，每个 issue 按 1 点算，相当于按 issue 数计算。
  - canceled 的 issue 移出 scope，所以取消 issue 可能让进度下降（[project graph](https://linear.app/docs/project-graph)）。
- Project graph：项目进入 Started 后才显示。图上有已开始、已完成两条线，scope 线用来看范围蔓延。系统按近期速度预测完成日期，给出乐观和悲观两个值（project graph）。
- Project updates（[updates](https://linear.app/docs/initiative-and-project-updates)）：
  - 由 lead 发起，每条带 health。
  - 管理员可以开启提醒，频率可选 daily、weekly、biweekly 或自定义。提醒只发给 Started 类别项目的 lead，没写的话之后再追提醒。
  - 停滞提示：上次是 On track、但 update 逾期超过一个周期加 3 天时，标为 "Update Missing"；长期没有 update 时显示灰色，表示不活跃。

**核心功能**：Initiative 及其汇总、milestones、project labels、project priority、项目依赖、模板、订阅项目通知（[notifications](https://linear.app/docs/project-notifications)）、Slack 同步、自动归档、cycle 未完成项自动顺延、角色权限（[members & roles](https://linear.app/docs/members-roles)）。

### 3.4 Microsoft Project / Planner

产品现状会影响下面的所有结论，先说明：
- Project Online 已于 2026-09-30 退役，learn 页面顶部有这条通告（[demand management](https://learn.microsoft.com/en-us/projectonline/using-workflow-for-demand-management-in-project-online)）。
- 官方文档写着 "Project for the web will soon become Microsoft Planner"（[limits](https://learn.microsoft.com/en-us/project-for-the-web/project-for-the-web-limits-and-boundaries)），它的能力并入 Planner 的 premium plans。
- 退役的具体日期，官方博客抓取时返回 403，只看到搜索摘要。

本节分三部分：Planner basic、Planner premium（原 Project for the web）、Project desktop（含 Project Server）。

**数据结构**
- Planner basic（Microsoft Graph，[overview](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0)）：
  - 层级：容器（通常是 M365 group）→ `plannerPlan` → `plannerBucket` → `plannerTask` → `plannerTaskDetails.checklist`。删除容器时，其中的计划一起删除。
  - Graph API 只能访问 basic 计划，premium 计划不在其中。
  - `plannerPlan` 的字段：`container`、`title`、`createdBy`（[plannerPlan](https://learn.microsoft.com/en-us/graph/api/resources/plannerplan?view=graph-rest-1.0)）。
  - `plannerTask` 的字段：`planId`、`bucketId`、`percentComplete`（值为 100 时视为完成）、`priority`（0–10）、`startDateTime`、`dueDateTime`、`assignments`、`appliedCategories`、`orderHint`、`checklistItemCount`（[plannerTask](https://learn.microsoft.com/en-us/graph/api/resources/plannertask?view=graph-rest-1.0)）。
  - `planId` 是单值，所以一个任务只属于一个计划。这是从字段推断的，官方没有明文。basic 计划没有依赖字段。
- Planner premium / Project for the web 的数据存在 Dataverse 里（[schedule API](https://learn.microsoft.com/en-us/dynamics365/project-operations/project-management/schedule-api-preview)）：
  - 实体有 `msdyn_project`、`msdyn_projecttask`（用 `msdyn_parenttask`、`msdyn_outlinelevel` 表达大纲层级）、`msdyn_projecttaskdependency`（`msdyn_predecessortask`、`msdyn_successortask`、`msdyn_linktype`）、`msdyn_projectbucket`、`msdyn_projectsprint`，以及 Project Goal。
  - 项目的 Progress、Finish、Duration 由调度引擎计算，不能经 API 写入。
  - 上限：每个项目最多 3000 个任务，层级最多 10 级，最多 10 个自定义字段（limits）。
  - `msdyn_projecttask` 的实体参考页返回 404，`msdyn_progress` 等字段名未能从一手来源确认。
- Project desktop：
  - 依赖写在任务的 Predecessors 字段里，类型有 FS、FF、SS、SF，可以带 lead 或 lag，例如 "14FS+3d"，也可以跨项目链接（[predecessors](https://support.microsoft.com/en-us/project/predecessors-task-field)）。
  - 里程碑就是工期为 0、Milestone 字段为 Yes 的任务（[milestone](https://support.microsoft.com/en-us/project/milestone-task-field)）。
  - Project Server 的 `PublishedProject` 有 `StartDate`、`FinishDate`、`PercentComplete`、`Owner`、`EnterpriseProjectType`、`Phase`、`Stage`、`StatusDate`、`ProjectSummaryTask` 等字段（[PublishedProject](https://learn.microsoft.com/en-us/dotnet/api/microsoft.projectserver.client.publishedproject?view=sharepoint-csom)）。
  - 项目本身用一个摘要任务表示，任务按大纲层级嵌套，摘要任务就是父任务。
- Roadmap 汇集多个项目，由行（row）和关键日期（key date）组成。连接到项目的行会同步日期，行和关键日期都有 Status 下拉框（[architecture](https://learn.microsoft.com/en-us/project-for-the-web/project-architecture-overview)；[key dates](https://support.microsoft.com/en-us/project/video-add-top-level-key-dates-to-your-roadmap)）。

**生命周期**
- Project Online：
  - Enterprise Project Type（EPT）把 phases、stages、一个 workflow 和若干详情页打包在一起（[EPT](https://support.microsoft.com/en-us/topic/c576de02-a25c-4ea1-9de6-02be44dbb0a6)）。
  - 默认阶段是 Create、Select、Manage。phase 只用来归组，stage 之间怎么推进由 workflow 决定（demand management）。
  - 这就是阶段关口式的生命周期，也随 Project Online 一起退役。
- 健康度：
  - Project desktop 的任务有 Status 字段，取值 Complete、On Schedule、Late、Future Task，并配有图标（[status indicator](https://support.microsoft.com/en-us/project/status-indicator-task-field)）。
  - 自定义字段可以配红黄绿图形指示器（[indicators](https://support.microsoft.com/en-us/project/add-indicators)）。
  - Planner premium 有没有项目级的状态或健康度字段，未能从一手来源确认。
- Planner 任务的进度只有 Not started、In progress、Completed 三档。已完成的任务折叠到列表底部（[task progress](https://support.microsoft.com/en-us/planner/set-and-update-task-progress)）。
- 计划的归档：只查到一条，basic 计划转成 premium 后，原计划只读并保留 90 天（[plan conversion](https://learn.microsoft.com/en-us/planner/plan-conversion)）。新建计划时可以选内置模板。

**视图**
- Planner basic 有 Grid、Board（可以按 bucket、进度、截止日、优先级、标签、负责人分组）、Schedule（日历）、Charts。premium 在此基础上加了 Timeline（Gantt 加依赖）、People（成员负载）、Goals、Assignments、Sprints/backlog（[plans in Teams](https://support.microsoft.com/en-US/Planner/teams/manage-your-team-s-plans-with-planner-in-teams)；[basic vs premium](https://support.microsoft.com/en-us/planner/compare-microsoft-planner-basic-vs-premium-plans)）。
- Project desktop 的视图（[overview of views](https://support.microsoft.com/en-us/project/overview-of-project-views)；[choose a view](https://support.microsoft.com/en-us/project/user-goal-choose-the-right-view-of-your-schedule)）：
  - Gantt Chart：默认视图。
  - Tracking Gantt：对比基线和实际。
  - Network Diagram：用流程图展示依赖关系。
  - Calendar。
  - Resource Usage、Resource Graph：用来发现资源过度分配。
  - Timeline：用于展示里程碑、做汇报。
  - Team Planner：按人查看任务。
- Project desktop 的内置报表有 Burndown、Project Overview、Upcoming Tasks、Critical Tasks、Late Tasks、Slipping Tasks、Milestone Report、Earned Value 等（[reports](https://support.microsoft.com/en-us/project/pick-the-right-report-in-project?nochrome=&shownav=false)）。
- 项目列表：Project Home 默认列出最近查看的、自己拥有的、共享给自己的项目（architecture）。Project Center 的默认排序未能从一手来源确认。

**进度与跟踪**
- 进度有三种口径：
  - % Complete = 实际工期 / 工期，按工期计算（[% complete](https://support.microsoft.com/en-us/project/percent-complete-fields)）。
  - % Work Complete = 实际工时 / 工时（[% work complete](https://support.microsoft.com/en-us/project/percent-work-complete-fields)）。
  - Physical % Complete：手工填写，用于挣值计算（[physical % complete](https://support.microsoft.com/en-us/project/physical-percent-complete-task-field?nochrome=)）。
- 基线：Project desktop 最多存 11 个基线，用来对比计划和实际（[baseline](https://support.microsoft.com/et-ee/office/create-or-update-a-baseline-or-an-interim-plan-in-project-desktop-7e775482-ac84-4f4a-bbd0-592f9ac91953)）。
- 状态汇报：在 Project Online 里，任务进度由 Status Manager 审批，默认是项目经理（[approvals](https://learn.microsoft.com/en-us/projectonline/set-up-time-and-task-progress-approval)）。
- 停滞提示：Project desktop 有 Late Tasks、Slipping Tasks 两个报表（完成日期晚于基线），以及任务 Status 为 Late。Planner 中没有找到对应功能。

**核心功能**：
- 关键路径（[critical path](https://support.microsoft.com/en-us/office/show-the-critical-path-of-your-project-in-project-ad6e3b08-7748-4231-afc4-a2046207fd86)）。
- 资源平衡（[leveling](https://support.microsoft.com/en-us/office/distribute-project-work-evenly-level-resource-assignments-59ee715d-4446-42c9-8756-4ea2a5a7e4a0)）。
- 基线。
- Planner premium 的四类依赖、里程碑、Goals、sprints、自定义字段（[premium capabilities](https://support.microsoft.com/en-us/office/advanced-capabilities-with-premium-plans-in-planner-6cdba2aa-da06-4e08-be4c-baaa4fda17ba)）。
- 组合分析：按业务驱动因素给项目排优先级（[portfolio analysis](https://learn.microsoft.com/en-us/projectonline/portfolio-analysis-overview)）。
- 由容器决定的权限、Power Automate。

### 3.5 ClickUp

来源说明：help.clickup.com 拒绝抓取（403）。本节标 [摘要] 的内容来自官方域名在搜索结果中的摘要，没有读到正文；标 [API] 的来自 developer.clickup.com 的文档全文。

**数据结构**
- 层级：Workspace → Space → Folder（可选，可以有 Subfolder）→ List → Task → Subtask（可以嵌套，默认 3 层，最多 7 层）→ Checklist [摘要]（[hierarchy](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy)；[nested subtasks](https://help.clickup.com/hc/en-us/articles/6304431740055-Create-nested-subtasks)）。
  - Folder 对象有 `parent_folder` 和嵌套的 `folders` [API]（[get folder](https://developer.clickup.com/reference/getfolder)）。
  - 帮助中心说用"装着多个 List 的 Folder"来组织项目 [摘要]。
  - Task 的 API 里有一个 `project` 字段，内容就是 Folder [API]（[get task](https://developer.clickup.com/reference/gettask)）。所以"项目"通常对应 Folder 或 List。
- List 的字段 [API]（[get list](https://developer.clickup.com/reference/getlist)）：`name`、`content`、`status`、`priority`、`assignee`、`start_date`、`due_date`、`task_count`、`archived`、`statuses[]`。List 有自己的状态、优先级、负责人和日期。Folder 没有日期和优先级字段（get folder）。
- Task 的关键字段 [API]（get task）：
  - 类型：`custom_item_id`，自定义任务类型，1 表示 Milestone。
  - 层级：`parent`、`top_level_parent`。
  - 关系：`dependencies[]{depends_on,type}`、`linked_tasks`、`locations[]`（任务所在的其他 List）。
  - 估算：`points`、`time_estimate`。
  - 其他：`date_done`、`date_closed`、`checklists`。
- Tasks in Multiple Lists（TIML）是一个可开关的功能 [摘要]（[TIML](https://help.clickup.com/hc/en-us/articles/6309958824727-Tasks-in-Multiple-Lists)）：
  - 任务有一个 home List，可以再加进其他 List。
  - 关闭这个功能时，任务会从所有附加 List 中移除，而且不可撤销。
- 依赖挂在任务上，分 Waiting on 和 Blocking 两种，另有 link 关系；API 用 `depends_on`、`dependency_of` 表示（[relationships](https://help.clickup.com/hc/en-us/articles/6304528030743-Intro-to-Relationships) [摘要]；[add dependency](https://developer.clickup.com/reference/adddependency) [API]）。
  - 前置任务改日期时，可以自动顺延后续任务 [摘要]（[rescheduling dependencies](https://help.clickup.com/hc/en-us/articles/6304547785367-Rescheduling-dependencies)）。
  - 依赖没有 FS、SS 这类类型区分。

**生命周期**
- 状态可以在 Space、Folder、Subfolder、List 任一级定义，下级默认继承上级 [摘要]（[statuses FAQ](https://help.clickup.com/hc/en-us/articles/6309465975063-Statuses-FAQ)）。状态分 open、custom、done、closed 四类 [API]（get folder）。Closed 状态不能新建，只能改名 [摘要]（[manage statuses](https://help.clickup.com/hc/en-us/articles/6309452618647-Manage-task-statuses)）。
- List 自身的 `status` 只是一个项目级的标签，没有类型含义 [API]（get list）。没有找到独立于状态的项目健康度字段。
- Folder、List、Task 都可以归档和恢复 [摘要]（[archive](https://help.clickup.com/hc/en-us/articles/6308811160599-Archive-or-restore-Folders-Subfolders-and-Lists)）。归档时下属任务怎么处理，未能从一手来源确认。
- Space、Folder、List、Task 都可以存为模板，模板包含层级、视图和自动化 [摘要]（[templates](https://help.clickup.com/hc/en-us/articles/6326066114455-Create-a-template)）。

**视图**
- 视图类型：List（主视图）、Board、Calendar、Gantt（含依赖和关键路径）、Timeline、Table、Workload（按日期看成员的容量）、Team（原名 Box）、Map、Activity、Mind Map、Dashboard [摘要]（[intro to views](https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views)；[gantt](https://help.clickup.com/hc/en-us/articles/6310249474967-Create-and-share-a-Gantt-view)；[workload](https://help.clickup.com/hc/en-us/articles/6310449699735-Use-Workload-view)）。
- API 可以创建的视图类型有 List、Board、Calendar、Table、Timeline、Workload、Activity、Map、Gantt [API]（[create view](https://developer.clickup.com/reference/createteamview)）。
- 各视图的默认排序和分组，未能从一手来源确认。

**进度与跟踪**
- Progress 是一个自定义字段。Auto 模式按子任务、checklist 和指派评论的完成情况自动计算 [摘要]（[custom fields for PM](https://help.clickup.com/hc/en-us/articles/9757601359895-Use-Custom-Fields-for-project-management)）。Manual 模式和 Goal 进度的规则，未能从一手来源确认。
- Sprint Points 对应 API 中任务的 `points` 字段 [摘要]（[sprint points](https://help.clickup.com/hc/en-us/articles/6303883602327-Use-Sprint-Points)）。
- AI StandUp 用 AI 汇总自己一段时间的工作，可以定期生成 [摘要]（[AI StandUp](https://help.clickup.com/hc/en-us/articles/21021454281239-Use-the-AI-StandUp-card-in-My-Tasks)）。
- 有一个显示任务在当前状态停留了多久的功能（Total time in Status）[摘要]（[time in status](https://help.clickup.com/hc/en-us/articles/6304185469719-Display-Total-time-in-Status)）。有没有"状态 N 天没变"这样的自动化触发器，未能从一手来源确认。

**核心功能**：
- Goals：Target 类型有数值、是/否、金额、任务 [摘要]（[goals](https://help.clickup.com/hc/en-us/articles/6325733579671-Create-a-Goal)）。
- Milestone：一种任务类型 [摘要]（[milestones](https://help.clickup.com/hc/en-us/articles/6304458574615-Milestones)）。
- Automations [摘要]（[automations](https://help.clickup.com/hc/en-us/articles/30241682127127-Create-an-Automation)）。
- 位置级权限 [摘要]（[permissions](https://help.clickup.com/hc/en-us/articles/6309225399703-Intro-to-permissions)）。
- 其他：Workload、Dashboards、自定义字段、任务 watchers、模板。

### 3.6 Monday.com

来源说明：support.monday.com 拒绝抓取（403），标 [摘要] 的内容来自官方域名的搜索摘要；标 [API] 的来自 developer.monday.com 的文档全文。

**数据结构**
- 层级：Account → Workspace → Folder → Board → Group → Item → Subitem [摘要]（[structural hierarchy](https://support.monday.com/hc/en-us/articles/7278527605906-Understanding-monday-com-s-structural-hierarchy)）。
- 子项层数：multi-level board 支持多层 subitem，所有层共用一套 column；classic board 只有一层 subitem [API]（[multi-level boards](https://developer.monday.com/api-reference/docs/working-with-multi-level-boards)）。最多几层，帮助中心写 4 层，API 写 5 层，两边不一致。
- "项目"有两种表达，都基于 board：
  - 一个 board 就是一个项目。
  - Portfolio 方案（Enterprise）：portfolio 本身是一个 board，每个项目是其中的一个 item。系统同时为每个项目自动建一个 Tasks board，带 Planning、Execution、Launch 三个 group [API]（[portfolio](https://developer.monday.com/api-reference/docs/portfolio-agent-skills)）。
- Board 的字段 [API]（[boards](https://developer.monday.com/api-reference/reference/boards)）：`name`、`description`、`columns`、`groups`、`owners`、`subscribers`、`state`（active、archived、deleted）、`board_kind`、`hierarchy_type`、`workspace`。Board 本身没有状态、日期字段，这些都是 item 上的 column。
- Item 的字段 [API]（[items](https://developer.monday.com/api-reference/reference/items)）：`name`、`group`、`column_values`、`parent_item`、`subitems`、`linked_items`、`state`。
- 列类型 [API]（[column types](https://developer.monday.com/api-reference/reference/column-types-reference)）：`status`、`timeline`、`people`、`dependency`、`board_relation`（Connect boards）、`date`、`numbers`、`tags` 等，以及只读的 `mirror`、`progress`、`formula`、`last_updated`。
- 一个 item 只属于一个 board，没有找到"属于多个 board"的原生支持。Connect boards 列用来关联其他 board 的 item，Mirror 列显示被关联 item 的值 [API]（[mirror](https://developer.monday.com/api-reference/reference/mirror)）。
- 依赖列只能连接同一 board 内的 item。界面上可以给每条依赖选 FS、SS、FF、SF 四种类型 [摘要]（[dependencies](https://support.monday.com/hc/en-us/articles/360007402599-Dependencies-on-monday-com)）。API 不暴露依赖类型，只返回 `linked_item_ids`。依赖模式有 flexible、strict、no_action 三种 [API]（[dependency](https://developer.monday.com/api-reference/reference/dependency)）。

**生命周期**
- 项目状态就是一个 status 列，标签可以自定义；每个 board 可以指定哪个标签算 done [摘要]（[status column](https://support.monday.com/hc/en-us/articles/360001269685-The-Status-Column)）。管理员可以用 managed columns 在全账户统一标签 [API]（[managed columns](https://developer.monday.com/api-reference/reference/managed-columns)）。
- Portfolio board 上，健康度和阶段是两个独立的 status 列，项目进度是只读的 mirror 列 [API]（[update project status](https://developer.monday.com/api-reference/docs/portfolio-skill-update-project-status)）：
  - `portfolio_project_rag`：Project Health，取值 On track、At risk、Off track。
  - `portfolio_project_step`：Stage。
- board、group、item 都可以归档和恢复 [摘要]（[archive](https://support.monday.com/hc/en-us/articles/115005314609-How-to-Archive-and-Unarchive-a-Board-Group-Item-or-Subitem)）。对完成的任务，官方建议用"状态改成某值时归档 item"的自动化处理 [摘要]（[done tasks](https://support.monday.com/hc/en-us/articles/360000012129-What-should-I-do-with-my-done-tasks)）。
- 有模板中心和 templates API [API]（[templates](https://developer.monday.com/api-reference/reference/templates)）。

**视图**
- Main Table：默认视图，可以按任意列分组 [摘要]（[group by](https://support.monday.com/hc/en-us/articles/4452237638546-Group-your-board-by-anything)）。
- Kanban [摘要]（[kanban](https://support.monday.com/hc/en-us/articles/360000661379-The-Kanban-View)）。
- Gantt：左侧是 item 列表，右侧是时间条，用箭头画依赖 [摘要]（[gantt](https://support.monday.com/hc/en-us/articles/360015643840-The-Gantt-Chart-View-and-Widget)）。
- Timeline [摘要]（[timeline](https://support.monday.com/hc/en-us/articles/360017206280-The-Timeline-View)）。
- Calendar、Chart、Workload [摘要]（[workload](https://support.monday.com/hc/en-us/articles/360010166559-Resource-Management-with-monday-com)）。
- Dashboard 小部件：Battery 统计 status 为 done 的 item 占比 [API]（[widgets schema](https://developer.monday.com/api-reference/reference/all-widgets-schema)）；Overview 跨 board 汇总进度 [摘要]（[overview widget](https://support.monday.com/hc/en-us/articles/360007078739-The-Overview-Widget)）。

**进度与跟踪**
- Progress tracking 列把一个 item 的多个 status 列合成一条进度条 [摘要]（[progress column](https://support.monday.com/hc/en-us/articles/360001150365-The-Progress-Tracking-Column)）。
- multi-level board 上，status 列可以向上汇总，父 item 的汇总值是只读的 [API]（multi-level boards）。
- 状态更新靠 item 的 Updates 讨论区 [摘要]（[updates](https://support.monday.com/hc/en-us/articles/115005900249-The-Updates-Section)）。Portfolio 有 AI 风险分析（Risk Insights）[摘要]（[risk insights](https://support.monday.com/hc/en-us/articles/22551628427666-The-portfolio-Risk-Insights)）。
- 停滞提示：自动化不能直接从活动日志触发。"N 天后"类的触发要用官方给的变通做法 [摘要]（[trigger after days](https://support.monday.com/hc/en-us/articles/36118127125778-Trigger-an-automation-after-a-set-number-of-days)）。没有找到原生的停滞提示。

**核心功能**：自动化（含跨 board）、Goal 小部件、Portfolio、依赖、Workload、board 级和列级权限、通知、模板。没有找到专门的 Milestone 对象。

### 3.7 Wrike

**数据结构**
- 层级：Space → Folder → Project → Task，另有 Custom items（[fundamentals](https://help.wrike.com/hc/en-us/articles/210325165-Step-2-Learn-the-Fundamentals)）。
- Project 的必填字段是 `ownerIds` 和 `status`，此外还有 `authorId`、`customStatusId`、`startDate`/`endDate`（只记日期）、`completedDate`、`createdDate`、`contractType`、`finance` 等（[API: folders & projects](https://developers.wrike.com/api/v4/folders-projects/)）。
- 一个任务可以同时在多个 folder 或 project 里，靠 `parentIds` 数组实现。帮助中心说这些位置"像标签"，任务本身只有一份，不会复制（[API: tasks](https://developers.wrike.com/api/v4/tasks/)；[adding tasks to folders](https://help.wrike.com/hc/en-us/articles/1500005121001-Adding-Tasks-to-Folders-Projects-and-Spaces)）。
- 任务有父子关系（`superTaskIds`/`subTaskIds`）。`dates.type` 取 Planned、Backlog、Milestone 之一，里程碑是任务的一种日期类型（API: tasks）。
- 项目可以嵌套成 subproject，一个 subproject 可以同时挂在多个父级下（[creating subprojects](https://help.wrike.com/hc/en-us/articles/1500005120741-Creating-Subprojects)）。
- 依赖挂在任务上：`predecessorId`、`successorId`、`relationType`（FinishToStart、StartToStart、FinishToFinish、StartToFinish）、`lagTime`（[API: dependencies](https://developers.wrike.com/api/v4/dependencies/)）。高级套餐还支持项目之间的依赖（[programme & portfolio timelines](https://help.wrike.com/hc/en-us/articles/39230471408786-Creating-and-Managing-Programme-and-Portfolio-Timelines-in-Gantt-Chart)）。

**生命周期**
- API 中 ProjectStatus 的枚举有 Green、Yellow、Red、Completed、OnHold、Cancelled、Custom（API: folders & projects）。帮助中心给出的默认项目状态是 New、In Progress、Completed、On Hold、Cancelled（[project status](https://help.wrike.com/hc/en-us/articles/1500005217622-Project-Status)）。两套取值怎么对应，未能从一手来源确认。
- 可以自定义 workflow，但每个状态必须归入四个组之一：Active、Completed、Deferred、Cancelled。同一套 workflow 可以同时用于任务和项目（[workflows](https://help.wrike.com/hc/en-us/articles/1500005219382-Default-vs-Custom-Workflows)）。
- 健康度（Project Health）由系统计算，和状态是两回事。有任务逾期、任务截止日晚于项目结束日、进度偏差超过 25%，都算风险；按风险多少显示 Green、Amber、Red。项目处于 Completed、Cancelled、On Hold，或者缺少开始或结束日期时，显示 Gray。这个功能正在被 AI 风险预测取代（[project health](https://help.wrike.com/hc/en-us/articles/1500005217682-Project-Health)）。
- 处于 On Hold、Deferred、Cancelled 的任务不进入 To-Do 和 Overdue 小部件（[changing task status](https://help.wrike.com/hc/en-us/articles/209603789-Changing-a-Task-s-Status)）。项目完成时其中未完成任务怎么处理，未能从一手来源确认。
- 项目模板叫 Blueprints（[blueprints](https://help.wrike.com/hc/en-us/articles/360013445394-Blueprints-in-Wrike)）。

**视图**：Table、Board、Gantt（可显示关键路径，可切成只显示里程碑）、Calendar、Workload（以人或项目为视角，超出容量时标红）、Dashboards（KPI、图表、表格小部件），可以在 space 层面建项目组合时间线（fundamentals；[gantt](https://help.wrike.com/hc/en-us/articles/210323585-Gantt-Chart-in-Wrike)；[workload](https://help.wrike.com/hc/en-us/articles/1500005226342-Customizing-Workload-Charts)；[metrics](https://help.wrike.com/hc/en-us/articles/30784360823831-Understanding-Metrics-in-Wrike)）。

**进度与跟踪**：进度自动计算，三种口径可选：按已完成任务数、按已完成任务的工期、两者平均（[project progress](https://help.wrike.com/hc/en-us/articles/360010428113-Project-Progress)）。没有专门的停滞提示；逾期和进度偏差反映在健康度上。

**核心功能**：一个任务可以在多个位置、子项目、四类依赖加 lag、项目之间的依赖、自定义 workflow、Blueprints、Gantt 与关键路径、Workload、Dashboards、自动进度、健康度、财务字段。

### 3.8 Basecamp

**数据结构**
- 项目是一组工具（dock）的容器。工具有 `message_board`、`todoset`、`vault`、`schedule`、`chat`、`kanban_board`（Card Table）、`questionnaire`（Automatic Check-ins）、`inbox`（[bc3-api: projects](https://github.com/basecamp/bc3-api/blob/master/sections/projects.md)）。
- Project 的字段有 `id`、`status`、`name`、`description`、`purpose`、`dock`。起止日期通过 `schedule_attributes[start_date]` 和 `[end_date]` 设置（bc3-api: projects）。
- 待办的层级是 todoset → todolist（可以分 group）→ todo → steps（子步骤）。todolist 带 `completed_ratio` 字段，例如 "2/5"（[todolists](https://github.com/basecamp/bc3-api/blob/master/sections/todolists.md)；[todos](https://github.com/basecamp/bc3-api/blob/master/sections/todos.md)）。
- 一个待办只属于一个项目。官方页面没有提到项目嵌套，也没有提到依赖功能。

**生命周期**
- 项目状态只有 `active`、`archived`、`trashed` 三个，归档后可以恢复（bc3-api: projects；[archiving & trash](https://5.basecamp-help.com/article/1133-archiving-trash-and-restoring)）。回收站保留多少天，API 文档写 30 天，帮助中心写 25 天，两处不一致。
- 没有"进行中、已完成"这类项目状态。健康度靠 Gauge 由人手工报告：指针位置 0–100，颜色分绿、黄、红，每次更新留一个快照；有跨项目的报表，按风险排序（[gauges](https://github.com/basecamp/bc3-api/blob/master/sections/gauges.md)）。
- 模板分 Project、To-do List、Card Table 三类。从模板建项目时，日期按相对于项目开始日的偏移重算（[templates](https://5.basecamp-help.com/article/1094-project-and-list-templates)）。

**视图**
- Hill Chart：每个 to-do list 是坡上的一个点，由人手动拖动。上坡表示还在摸索做法，下坡表示只剩执行。每次拖动都留快照（[hill charts](https://basecamp.com/hill-charts)；[API](https://github.com/basecamp/bc3-api/blob/master/sections/hill_charts.md)）。
- Lineup：13 周滚动时间线，显示有起止日期的项目（[lineup](https://5.basecamp-help.com/article/1164-lineup)）。
- Card Table：看板，固定有 Triage、Done、Not Now 三列（[card tables](https://5.basecamp-help.com/article/1063-card-tables)）。
- 此外还有 Schedule（日程），以及待办列表上的进度饼图（[to-dos](https://5.basecamp-help.com/article/1077-to-dos)）。

**进度与跟踪**
- 进度有三种来源：Hill Chart，官方原话是"human generated, not computer generated"；待办列表按完成数算的 `completed_ratio`；手工的 Gauge。
- 状态报告靠 Automatic Check-ins：按每天、每周、每月等频率定时提问，回答全项目可见（[check-ins](https://5.basecamp-help.com/article/1051-automatic-check-ins)；[questions API](https://github.com/basecamp/bc3-api/blob/master/sections/questions.md)）。
- Hill Chart 的 API 有 `stale` 字段，但语义没有文档说明。官方把"点长期不动"作为一个信号：这份清单该拆分了。

**核心功能**：dock 工具组合、待办列表与分组、Card Table、Hill Charts、Gauges、Lineup、Schedule、Automatic Check-ins、相对日期模板、归档与回收站。

### 3.9 Notion

**数据结构**
- 官方的 Projects & tasks 模板由两个数据库组成：Projects 和 Tasks，用 relation 双向关联，一个任务属于一个项目。Projects 库有 status、人员、关联的任务、完成百分比进度条（[projects & tasks guide](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks)）。
- Relation 可以是单向的，也可以是双向的；可以限制成只关联一页；可以关联到本库自己（self relation）。API 中分 `single_property` 和 `dual_property` 两种。属性类型包括 `status`、`rollup`、`formula`、`date`（可以是区间）、`people` 等（[relations & rollups](https://www.notion.com/help/relations-and-rollups)；[API: property object](https://developers.notion.com/reference/property-object)）。
- Sub-items 和 Dependencies 都是 self relation。Sub-items 用 Parent item / Sub-item 两个属性，可以多层嵌套。Dependencies 只在 timeline 上画，前置项改日期时，后续项可以按三种方式之一自动挪：只在重叠时挪、保持间隔一起挪、不挪（[tasks & dependencies](https://www.notion.com/help/tasks-and-dependencies)）。
- 没有专门的项目嵌套机制。在 Projects 库上开启 sub-items 可以得到嵌套效果，这一点是推断，官方文档没有写。

**生命周期**
- Status 属性的选项分 To-do、In progress、Complete 三个固定组，默认选项是 Not started、In progress、Done，选项可以增删（[API: property object](https://developers.notion.com/reference/property-object)；[database properties](https://www.notion.com/help/database-properties)）。
- 模板中项目的状态值有 Planning、In progress 等，Active 视图只显示这两种状态的项目（projects & tasks guide）。模板中 Status 的完整选项，因为模板页正文没有抓到，未能从一手来源确认。
- 没有内置的健康度，也没有"项目完成时任务怎么处理"的规则。

**视图**
- Table、Board、Timeline、Calendar、List、Gallery、Chart、Form（[views](https://www.notion.com/help/views-filters-and-sorts)）。
- Timeline 需要日期区间（[timelines](https://www.notion.com/help/timelines)）。Board 默认按 status 分组，可以加子分组（[boards](https://www.notion.com/help/boards)）。
- 模板自带的视图：Projects 库有 Active（看板）、Mine、All、Timeline；Tasks 库有 By project、Mine 等（projects & tasks guide）。

**进度与跟踪**
- 模板中项目的完成度按已完成任务的数量计算，显示成进度条（projects & tasks guide）。
- rollup 函数有 `percent_checked` 和 `percent_per_group`，后者按 status 分组计算比例（API: property object）。
- 没有内置的状态报告和停滞提示。

**核心功能**：双库 relation、rollup、formula、Status 分组、sub-items、dependencies 与自动挪日期、多种视图、模板库、按钮、Form、Chart。

### 3.10 GitHub Projects

下文 `…/` 指 `https://docs.github.com/en/issues/planning-and-tracking-with-projects/`，schema 指 [GraphQL schema](https://docs.github.com/public/fpt/schema.docs.graphql)。

**数据结构**
- Project 属于 user 或 organization。item 类型 `ProjectV2ItemType` 有 `ISSUE`、`PULL_REQUEST`、`DRAFT_ISSUE`、`REDACTED`。每个 project 最多 50,000 个 item（schema；[archiving items](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/archiving-items-from-your-project)）。
- `ProjectV2` 的字段：`title`、`shortDescription`、`readme`、`number`、`public`、`closed`、`closedAt`、`template`、`owner`、`creator`、`items`、`fields`、`views`、`statusUpdates`、`workflows`、`repositories`、`teams`。项目本身没有负责人、日期、优先级字段，日期只出现在 status update 上（schema）。
- 自定义字段类型 `ProjectV2CustomFieldType` 有 `TEXT`、`NUMBER`、`DATE`、`SINGLE_SELECT`、`ITERATION`、`MULTI_SELECT`，每个 project 最多 50 个字段（schema；[about projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)）。Iteration 字段按天或周设长度，可插入 break（[about iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields)）。
- 一个 issue 可以加入多个 project（`Issue.projectsV2`），在 item 上改字段会同步回 issue（schema；about projects）。
- project 不能嵌套。层级做在 issue 上：sub-issues 每个父 issue 最多 100 个子 issue，最多 8 层，可以跨仓库（[adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)）。
- 依赖只有 blocked by / blocking 一种，挂在 issue 上（`Issue.blockedBy`、`Issue.blocking`）。被阻塞的 issue 在 board 上显示 Blocked 图标（[creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)）。

**生命周期**
- project 只有 open 和 closed 两态。close 后从列表隐藏，可以 reopen（[closing and deleting](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/closing-and-deleting-your-projects)）。close 时 item 怎么处理，文档没写。
- status update 的 `status` 是固定枚举 `ProjectV2StatusUpdateStatus`：`ON_TRACK`、`AT_RISK`、`OFF_TRACK`、`COMPLETE`、`INACTIVE`。健康度和完成态混在同一个枚举里。每条 update 另有 `startDate`、`targetDate`、`body`（schema；[sharing project updates](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/sharing-project-updates)）。
- item 的 Status 是一个可以自定义的 single select 字段。内置 workflow 在 issue 关闭或 PR 合并时把它设成 Done（[built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)）。item 可以按 `is`、`reason`、`updated` 条件自动归档，可以恢复（[archiving items automatically](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/archiving-items-automatically)）。
- 组织可以把 project 设成模板，复制视图、字段、草稿、workflow 和 insights（[project templates](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-project-templates-in-your-organization)）。

**视图**
- 布局 `ProjectV2ViewLayout` 有 `TABLE_LAYOUT`、`BOARD_LAYOUT`、`ROADMAP_LAYOUT` 三种，都可以 filter、sort、group、slice（schema；about projects）。roadmap 用 date 或 iteration 字段定位 item，拖动可改日期（[roadmap layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout)）。
- 最新的 status update 显示在侧栏、project header 和 project 列表中（sharing project updates）。project 列表的默认排序未能从一手来源确认。

**进度与跟踪**
- Insights 分 current charts（按任意字段聚合）和 historical charts（默认 burn up），已归档的 item 不计入（[about insights](https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/about-insights-for-projects)）。
- `SUB_ISSUES_PROGRESS` 字段（`SubIssuesSummary { total, completed, percentCompleted }`）按子 issue 的数量算进度（schema）。
- 没有内置的停滞提示，只能用自动归档条件 `updated:<@today-14d` 近似处理（archiving items automatically）。

**核心功能**：一个 issue 可以加入多个 project、自定义字段（含 Iteration）、三种布局、sub-issues、blocked by、status updates、Insights、内置自动化与自动归档、组织模板、GraphQL API。

### 3.11 OpenProject

**数据结构**
- workspace 分三种：`portfolio`、`program`、`project`。project 的父可以是这三种中的任一种；program 的父只能是 portfolio；portfolio 没有父。portfolio 和 program 是 Enterprise 功能（[project.rb](https://raw.githubusercontent.com/opf/openproject/dev/app/models/project.rb)；[project lists](https://www.openproject.org/docs/user-guide/projects/project-lists/)）。
- API v3 中 Project 的字段：`id`、`identifier`、`name`、`active`（false 表示已归档）、`favorited`、`statusExplanation`、`public`、`description`、`createdAt`、`updatedAt`，以及项目自定义字段（project attributes）。`parent` 和 `status` 以链接形式给出（[API: projects](https://www.openproject.org/docs/api/endpoints/projects/)）。
- 源码中 `WorkPackage belongs_to :project`：一个 work package 只属于一个项目。项目通过 `parent` 嵌套（[work_package.rb](https://raw.githubusercontent.com/opf/openproject/dev/app/models/work_package.rb)）。
- 依赖挂在 work package 上。Relation 的 `type` 有 `relates`、`duplicates`/`duplicated`、`blocks`/`blocked`、`precedes`/`follows`（可以设 lag，界面上叫 Predecessor/Successor）、`includes`/`partof`、`requires`/`required`。父子关系是另一种 hierarchy。阻塞方关闭之前，被阻塞的 work package 不能关闭（[API: relations](https://www.openproject.org/docs/api/endpoints/relations/)；[relations & hierarchies](https://www.openproject.org/docs/user-guide/work-packages/work-package-relations-hierarchies/)）。

**生命周期**
- 项目状态 `status_code` 是固定枚举：`not_started`、`on_track`、`at_risk`、`off_track`、`finished`、`discontinued`。一个字段同时表达健康度和完成态，`statusExplanation` 写说明文字。需要别的状态时，只能另建项目属性（project.rb；[project information](https://www.openproject.org/docs/user-guide/projects/project-settings/project-information/)；[project status](https://www.openproject.org/docs/user-guide/projects/project-status/)）。
- 较新版本加入了 Project life cycle，由 phases 和 phase gates 组成。默认四个阶段 Initiating、Planning、Executing、Closing，基于 PM²。阶段在全局定义和排序，单个项目只能启用或停用。阶段之间不能重叠也不能留空档，改日期会顺延后续阶段。gate 位于阶段的起点或终点。子项目不受父项目阶段日期的约束（[admin: project life cycle](https://www.openproject.org/docs/system-admin-guide/projects/project-life-cycle/)；[project life cycle](https://www.openproject.org/docs/user-guide/projects/project-home/project-life-cycle/)）。
- 归档后 `active=false`，项目从导航中消失，在项目列表中关掉 Active 过滤仍能看到，也可以恢复。归档父项目时子项目和 work package 怎么处理，未能从一手来源确认（project information）。
- 可以把一个项目设成模板，新建项目时从它复制（[project templates](https://www.openproject.org/docs/user-guide/projects/project-templates/)）。

**视图**
- 项目列表：默认是 active 列表，按项目树的先序排列（`lft asc`）。列可配置，可以设多级排序、保存和共享，可以导出，可以一键切到跨项目 Gantt。列中可以显示状态、项目属性和生命周期阶段，相当于一个项目组合总览（[static.rb](https://raw.githubusercontent.com/opf/openproject/dev/app/models/project_queries/static.rb)；project lists）。
- 项目首页（Overview）有 status widget 和 life cycle 侧栏（project status）。
- work package 层面有表格、Gantt、Agile boards、Backlogs、Calendar、Team planner。这一条只依据文档目录，没有逐页核对。

**进度与跟踪**
- `% Complete` 由管理员在两种模式中选一种：Work-based，即（Work − Remaining work）/ Work；Status-based，即每个状态绑定一个固定百分比。父级汇总可以按 Work 加权，也可以对直接子项取简单平均。Spent time 不参与计算（[progress tracking](https://www.openproject.org/docs/user-guide/time-and-costs/progress-tracking/)）。
- 状态报告就是 project status 加 statusExplanation，显示在首页和项目列表。
- 停滞提示：未能从一手来源确认有内置功能。

**核心功能**：portfolio/program/project 三级嵌套、项目状态与说明、生命周期 phase 与 gate、项目属性、多种 relation、Gantt 与自动排程、看板与 Scrum、工时成本预算、% Complete、项目模板、API v3。

### 3.12 Plane

**数据结构**
- 层级为 Workspace → Project → Work item（源码中叫 Issue）。项目内另有 Cycle、Module、Milestone。workspace 级有 Initiative（Pro），把多个项目和工作项挂在一个目标下。Epic 是 work item type 的一种，比 Task 高一级，通过 Parent 关联（[initiatives](https://docs.plane.so/core-concepts/projects/initiatives)；[epics](https://docs.plane.so/core-concepts/issues/epics)）。
- Project 的字段：`name`、`description`、`identifier`（最长 12 位，存为大写）、`network`（Secret/Public）、`project_lead`、`default_assignee`、`default_state`、`estimate`、`archive_in`/`close_in`（0–12 个月）、`archived_at`、`timezone`（[project.py](https://raw.githubusercontent.com/makeplane/plane/preview/apps/api/plane/db/models/project.py)）。
- 一个工作项只属于一个项目，带 `parent` 字段，可以有子工作项。它可以同时在多个 Module 里，但同一时间只能在一个 Cycle 里，也只能在一个 milestone 里（[modules](https://docs.plane.so/core-concepts/modules)；[cycles](https://docs.plane.so/core-concepts/cycles)；[milestones](https://docs.plane.so/projects/milestones)）。
- 没有找到 project 的 parent 字段，跨项目的聚合靠 Initiative。
- 依赖挂在工作项上。`IssueRelationChoices` 有 `relates_to`、`duplicate`、`blocked_by`/`blocking`、`start_before`、`finish_before`、`implemented_by`；在 Timeline 上分别画成 FS、SS、FF，违反依赖的连线显示为红色（[issue.py](https://raw.githubusercontent.com/makeplane/plane/preview/apps/api/plane/db/models/issue.py)；[timeline dependency](https://docs.plane.so/core-concepts/issues/timeline-dependency)）。

**生命周期**
- 工作项的状态可以自定义，但每个状态必须归入固定的 group：`backlog`、`unstarted`、`started`、`completed`、`cancelled`，另有系统保留的 `triage`。是否完成、进度怎么算都按 group 判断（[states](https://docs.plane.so/core-concepts/issues/states)）。
- Module 的状态是固定的：`backlog`、`planned`、`in-progress`、`paused`、`completed`、`cancelled`（modules）。
- Project States（Pro）可以自定义，默认有 Draft、Planning、Execution、Monitoring、Completed、Cancelled，即阶段加完成态，不含健康度（[project states](https://docs.plane.so/core-concepts/projects/project-states)）。健康度放在 Project Updates（Pro）里，取值 On Track、At Risk、Off Track，随每条更新发布（[project updates](https://docs.plane.so/communication-and-collaboration/project-updates)）。
- Initiative 的状态：Drafts、Planned、Active、Completed、Closed（initiatives）。
- 项目归档后离开侧栏和搜索，可以恢复（[projects overview](https://docs.plane.so/core-concepts/projects/overview)）。自动化可以把处于 completed 或 cancelled 超过设定时长的工作项自动归档，也可以把长期不动的 backlog、unstarted、started 工作项自动关闭（[automations](https://docs.plane.so/automations/overview)）。Cycle 结束时，未完成的工作项可以转到其他 cycle（cycles）。
- 项目模板（Business）可以预设属性、States、Labels、工作项类型和初始工作项（[project templates](https://docs.plane.so/templates/project-templates)）。

**视图**
- 工作项有 List、Board、Calendar、Table、Gantt/Timeline 五种布局，可以保存为项目级或 workspace 级的 View（[layouts](https://docs.plane.so/core-concepts/issues/layouts)；[views](https://docs.plane.so/core-concepts/views)）。
- Module 有 List、Gallery、Timeline 三种布局。Initiative 有 List、Board、Timeline。Milestone 列表按 target date 升序（modules；initiatives；milestones）。
- 项目卡片显示 State、Priority、Lead、Members 和起止日期（project states）。项目列表的默认排序：后端模型为 `-created_at`，前端实际怎么排未能从一手来源确认。

**进度与跟踪**
- Module 的进度是已完成工作项数的占比。Cycle 有 burn-down，结束时冻结进度快照。Milestone 的进度把 completed 和 cancelled 都算作完成（modules；cycles；milestones）。
- Analytics 分 workspace、project、cycle/module 三级，含 Projects by status 图（[analytics](https://docs.plane.so/core-concepts/analytics)）。
- 状态报告是 Project Updates。长期不动的工作项可以被自动关闭，但没有针对项目的停滞提示（automations）。

**核心功能**：状态分组、Cycles、Modules、Milestones、Epics、Initiatives、Project States、Project Updates、保存的 Views、Timeline 依赖、Intake/Triage、Analytics、自动归档与自动关闭、模板。

### 3.13 国内工具

国内五家的帮助中心大多抓不到正文：有的前端渲染只回标题，有的 404，有的跳到登录页或超时。能从一手来源确认的内容很少。本节标注三种来源：[一手] 是官方页面原文，[摘要] 是官方页面在搜索结果里的摘要，[线索] 是非官方来源。

**飞书项目（Meegle）**：中文帮助中心没有抓到，以下来自海外版 Meegle 和官方 CLI。
- 数据结构 [一手]：官方 CLI 用 `project`/`project_key` 指代空间。工作项类型由 `workitem meta-types` 列出，字段由 `workitem meta-fields` 查询。CLI 有 `wbs edit-draft` 命令，可以编辑 owner 和 schedule（[meegle-cli README](https://raw.githubusercontent.com/larksuite/meegle-cli/main/README.md)）。
- 生命周期 [一手]：同一份 README 区分两种流程，节点流（`workflow transition`，可以流转或回滚节点）和状态流（`workflow transition-state`）。流转时可以校验必填字段（`workflow list-state-required`）。官网称流程可以拆成节点和连线 [摘要]（[Meegle features](https://project-jp.meegle.com/meegle_features)）。
- 视图 [摘要]：表格、看板、甘特、成员排期（[pricing](https://www.meegle.com/pricing)）。CLI 另有跨项目的全景视图 `view list-multi-project-workitems` [一手]。
- 进度 [一手]：CLI 有图表（`chart`）、成员排期和工时（`workhour`）相关命令。
- 未能从一手来源确认：依赖关系、项目健康度、归档、模板、进度如何计算。

**Teambition**：帮助中心和开放平台都没有抓到正文。
- [摘要] App Store 官方描述：用任务看板掌握项目进展，任务可以多级分配；可以从多个统计维度分析项目状况（[App Store](https://apps.apple.com/jp/app/teambition/id656664814)）。
- 其余内容都未能从一手来源确认：任务分组、任务类型、项目状态与进展、项目集、模板、归档、甘特。

**PingCode**：帮助文档没有抓到。以下来自产品页 [一手]（[Project 产品页](https://pingcode.com/product/project)）。
- 需求、缺陷和工作流都可以自定义，需求可以分级。项目集用来集中管理多个项目。
- 项目类型有 Scrum、Kanban、瀑布、混合四种。
- 甘特图用于计划、拆分和里程碑确定。可以为某个版本建基线，与实际进度对比。有效能度量（评估项目的健康程度）、定时报告、成员工作饱和度。
- 未能从一手来源确认：项目状态枚举、阶段、归档、停滞提示、进度公式。

**TAPD**：以下来自腾讯云文档中心的 TAPD 官方文档 [一手]。
- 数据结构：应用包括需求、发布计划、迭代、任务、测试计划与用例、缺陷、故事墙、甘特图、报表、文档等（[44285](https://www.cloud.tencent.com/document/product/624/44285)）。需求即 User Story，可以有父子需求（[44284](https://www.cloud.tencent.com/document/product/624/44284)）。迭代是固定时长的 Timebox；父需求不能规划进迭代；需求移入或移出迭代时，下面的任务跟着移动（[44290](https://www.cloud.tencent.com/document/product/624/44290)）。
- 生命周期：新建项目时从项目模板中选，模板包括敏捷、缺陷跟踪、研发全生命周期等，可以自定义。文档中默认模板的数量前后不一致（[44586](https://cloud.tencent.com/document/product/624/44586)）。需求和缺陷的工作流可以配置。
- 视图：系统视图和个人视图（[44287](https://www.cloud.tencent.com/document/product/624/44287)），故事墙，甘特图（分普通和资源两种）。
- 进度：迭代内有需求状态分布、需求个数燃尽、规模燃尽、工时燃尽、累积流图。项目经理可以设定时报告，按邮件发送（[44324](https://www.cloud.tencent.com/document/product/624/44324)；44284）。
- 未能从一手来源确认：项目状态、健康度、归档、里程碑、项目集、停滞提示。

**Worktile**：帮助中心超时或 404。官网首页只有"以项目化的方式管理企业任务""不同的项目模板"两句（[worktile.com](https://worktile.com)）。阶段、里程碑、项目进展、项目集、视图都未能从一手来源确认。

五家都没有找到"项目停滞"类提示的一手资料。

## 4. 横向对比

表中内容来自第 3 节，来源见各节。"?" 表示未能从一手来源确认。

### 4.1 数据层级与项目字段

| 工具 | 项目之上的层级 | 项目之下的层级 | "项目"是什么 | 项目可嵌套 | 任务可属于多个项目 | 项目有日期 | 项目有优先级 | 依赖挂在 | 依赖类型 |
|---|---|---|---|---|---|---|---|---|---|
| Jira | 站点；Plans 的自定义层级（Initiative 等）；Home 的 Goals | Epic → 标准 issue → subtask | 独立对象（`Project`），另有 Home project | 否（?） | 否（?） | Jira project 无；Home 有 | 无 | issue（issue link） | 链接类型，默认 Blocks 等，无 FS/SS |
| Asana | workspace → team → portfolio（可嵌套）；goals | section → task → subtask；milestone 是 task 的子类型 | 独立对象 | 否；靠 portfolio 嵌套 | 是 | 是 | 自定义字段 | task | FS/FF/SS/SF（界面；API 无类型字段） |
| Linear | workspace → team；initiative（可嵌套） | milestone → issue → sub-issue | 独立对象 | 否 | 否 | 是（可选粒度） | 是 | issue；项目之间也可以 | issue：blocks 等；项目：end→start |
| MS Project / Planner | group（Planner）；Roadmap 汇集 | 摘要任务（大纲）→ 任务；里程碑为零工期任务 | Planner：plan；Project：项目 = 摘要任务 | 大纲层级 | 否 | 是 | 任务有 | 任务 | FS/SS/FF/SF + lag |
| ClickUp | workspace → space | List → task → subtask（最多 7 层）→ checklist | Folder 或 List | Subfolder | 是（TIML） | List 有 | List 有 | task | waiting on / blocking |
| Monday | account → workspace → folder；Portfolio board | group → item → subitem | board，或 portfolio board 上的 item | 否 | 否（只能用 connect 关联） | timeline 列 | status 列 | item（同 board） | FS/SS/FF/SF（界面） |
| Wrike | space → folder | task → subtask | folder 的一种 | 是（subproject 可以多父） | 是 | 是 | ? | task；项目之间也可以 | FS/SS/FF/SF + lag |
| Basecamp | 账户 | todoset → todolist → todo → step | 工具容器 | 否 | 否 | 是 | 无 | 无 | 无 |
| Notion | workspace | 由 relation 定义 | Projects 数据库的一页 | 可用 sub-items | 视 relation 设置 | 自定义属性 | 自定义属性 | 页（self relation） | 一种，自动顺延日期 |
| GitHub Projects | user / org | item（issue）→ sub-issue（8 层） | 一个 board 或表格 | 否 | 是 | 只在 status update 上 | 自定义字段 | issue | blocked by |
| OpenProject | portfolio → program | work package（父子） | 独立对象 | 是（parent） | 否 | 生命周期阶段日期 | ? | work package | precedes/follows（含 lag）、blocks、relates 等 |
| Plane | workspace；initiative | cycle、module、milestone → work item → 子项 | 独立对象 | 否 | 否（但可以进多个 module） | ? | 是 | work item | blocked_by、start_before、finish_before（FS/SS/FF） |

### 4.2 生命周期状态与健康度

| 工具 | 项目状态 | 可自定义 | 健康度 | 状态与健康度分开 | 归档 | 模板 |
|---|---|---|---|---|---|---|
| Jira | Jira project：只有 archived/deleted；Home：`phase` pending / in progress / paused / done | Home 否（?） | Home `status`：On track / At risk / Off track | 是（Home） | 是（Premium），issue 只读 | ? |
| Asana | 无工作流状态，只有 `completed`、`archived`；终态在 status update 里选：on_hold / complete / dropped | 否 | status update：on_track / at_risk / off_track | 否（健康度和终态同在一个 `status_type` 里） | 是（与完成相互独立） | 是 |
| Linear | 类别：backlog / planned / started / paused / completed / canceled | 名称可自定义，类别固定 | On track / At risk / Off track（随 update） | 是 | 自动（完成或取消后） | 是 |
| MS Project / Planner | Project Online：EPT 的 phase/stage + workflow（已退役）；Planner：无 | Project Online 可以 | 任务 Status（On Schedule / Late …）、自定义红黄绿 | — | Planner：? | 是 |
| ClickUp | List 有状态；任务状态分类 open / custom / done / closed | 是，可以按层级设 | 无 | — | 是 | 是 |
| Monday | status 列 | 是 | Portfolio：Health 列 On track / At risk / Off track | 是（Stage 和 Health 两列） | 是 | 是 |
| Wrike | 默认 New / In Progress / Completed / On Hold / Cancelled；分组 Active / Completed / Deferred / Cancelled | 是（Business 以上） | 系统计算 Green / Amber / Red / Gray | 是 | ? | Blueprints |
| Basecamp | active / archived / trashed | 否 | Gauge 手工报绿 / 黄 / 红 | 是 | 是 | 是 |
| Notion | Status 属性，三个固定组 To-do / In progress / Complete | 选项可自定义 | 无（需自己做） | — | 无内置 | 是 |
| GitHub Projects | open / closed | 否 | status update：On track / At risk / Off track / Complete / Inactive | 否（同一个枚举） | close | 组织模板 |
| OpenProject | `not_started / on_track / at_risk / off_track / finished / discontinued`；另有 phases 与 gates | 状态否；阶段可以（Enterprise） | 混在状态里 | 否 | 是 | 是 |
| Plane | Project States：Draft / Planning / Execution / Monitoring / Completed / Cancelled（Pro） | 是 | Project Updates：On Track / At Risk / Off Track | 是 | 是 | 是（Business） |

### 4.3 视图类型

"✓"表示官方文档写明有，"—"表示没有找到。Monday、ClickUp 的大部分视图只核对到官方域名的搜索摘要。

| 工具 | 项目列表 / 组合 | 项目概览页 | 列表 / 表格 | 看板 | 时间线 / 甘特 | 日历 | 工作量 | 仪表盘 / 报表 | 燃尽 / 燃起 | 定期状态更新 | 停滞提示 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Jira | ✓ | ✓（Summary） | ✓ | ✓ | ✓ | ✓ | ✓（报表） | ✓ | ✓ | ✓（Home） | ✓（dormant / stale） |
| Asana | ✓（portfolio） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓（burnup） | ✓（每周提醒） | — |
| Linear | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓（project graph） | ✓ | ✓（Update Missing） |
| MS Project / Planner | ✓（Project Home、Roadmap） | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓（desktop） | ✓（Project Online） | ✓（Late / Slipping） |
| ClickUp | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓（AI StandUp） | — |
| Monday | ✓（Portfolio） | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Wrike | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓（健康度） |
| Basecamp | ✓（Lineup） | ✓ | ✓ | ✓ | ✓（Lineup） | ✓ | — | ✓（gauges 报表） | — | ✓（check-ins） | — |
| Notion | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓（Chart） | — | — | — |
| GitHub Projects | ✓ | ✓（README / 侧栏） | ✓ | ✓ | ✓ | — | — | ✓（Insights） | ✓ | ✓ | — |
| OpenProject | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓（Team planner） | — | — | ✓（status 加说明） | — |
| Plane | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓（Analytics） | ✓（cycle） | ✓ | 部分（自动关闭） |

## 5. 对本项目的启示

本插件只给一个人用，运行在 Orca 里。插件里的一切都由块、标签、标签属性和块引用构成。插件已有的能力包括：任务的六种状态、下一步行动、依赖与顺序执行、评分沿父链继承、重复任务、我的一天、回顾（含回顾周期）、提醒、自定义属性、统计视图。父子关系只来自块层级（ADR 0003）；页面可以是任务（ADR 0013）；阻塞向后代任务传递（ADR 0015）。

本节只列选项和各自的取舍，不做决定。

### 5.1 适用与不适用

| 业界功能 | 对本插件 | 理由 |
|---|---|---|
| 项目对象（负责人以外的字段）、项目列表 | 适用 | 个人也需要知道"我手上有哪些项目" |
| 项目状态与健康度两分 | 部分适用 | 状态有用；健康度在团队里是写给别人看的信号，一个人用时可以并进"停滞检测"，也可以作为可选的手填项 |
| 定期项目更新（Asana status update、Linear project update、Atlassian Home、Basecamp check-in） | 部分适用 | 本质是"定期看一眼这个项目"。插件的回顾周期已经能表达这一点，可以复用 |
| 项目停滞检测（Linear 的 Update Missing、Jira 的 dormant、Plane 的自动关闭） | 适用 | 这正是 GTD 每周回顾中"每个项目都有下一步行动吗"的那个问题 |
| 进度条（按子项数量计算） | 适用 | 实现成本低，信息量足 |
| 里程碑 | 可选 | 个人项目通常不需要；需要时也可以用一个子任务加截止日期来表达 |
| 阶段与阶段关口（PRINCE2、OpenProject、Project Online EPT） | 大多不适用 | 关口是组织审批节点，个人项目没有审批方 |
| 项目组合、项目集、Initiative、Goal | 暂不适用 | 层级多出来的那一层在个人场景里收益低。如果需要，块层级本身就能把项目放在更大的项目下面 |
| 资源分配、工作量视图、容量 | 不适用 | 只有一个人，没有资源可分配 |
| 成员、权限、关注者、通知 | 不适用 | 单用户，没有协作方 |
| 甘特图、关键路径、FS/SS/FF/SF 依赖与 lag | 不适用或另议 | 插件的依赖只有"完成后放行"加依赖延迟，大致相当于 FS 加 lag。甘特图属于另一类可视化，已在"待排期的想法"里（依赖视图） |
| 燃尽、速度、累积流图 | 不适用 | 依赖迭代和估算点数，个人 GTD 不按迭代工作 |
| 自动化规则、表单、审批 | 不适用 | 团队流程的工具 |
| 项目模板 | 可选，另议 | Orca 自身有模板能力，插件未必需要另做一套 |

### 5.2 待决定的问题

**Q1：项目在 Orca 中怎么表达**

业界有三种表达方式：
- 项目是独立对象，任务属于它（Asana、Linear、Jira、Plane、OpenProject）。
- 项目是一个容器，任务就在容器里（ClickUp 的 Folder/List、Monday 的 board、Basecamp）。
- 项目只是一种更大的任务（MS Project 的摘要任务、Wrike 的 project 也是 folder 的一种、Notion 的 sub-items、OmniFocus 一类的 GTD 工具）。

本插件可选的做法：

| 选项 | 做法 | 优点 | 代价 |
|---|---|---|---|
| A. 任务标签上加一个属性，标记"这是项目" | 在任务标签上新增一个布尔或单选属性（例如"类型：任务/项目"），项目仍然是任务 | 不新增标签；项目自动享有状态、依赖、评分继承、回顾、提醒；父子关系仍只来自块层级（ADR 0003）；页面任务天然可以当项目（ADR 0013） | 项目字段和任务字段共用一套属性；"项目"只是任务的一个标记，项目的状态集合就是任务的六种状态 |
| B. 新建一个单独的项目标签 | 一个插件管理的项目标签，带自己的属性。项目块下的任务通过块层级归入项目 | 项目可以有自己的属性和状态集合；在 Orca 里能一眼区分 | 项目块不是任务，得另外决定它能不能被依赖、有没有评分、要不要回顾；如果一个块同时打两个标签，语义要定义；改名、对齐属性的逻辑（ADR 0002、0008）要再做一份 |
| C. 不做标记，由结构推导 | 有子任务的顶层任务就是项目（GTD 的定义：需要多于一步的结果） | 零新增数据，不需要用户做任何操作 | 用户无法把"只有一步的项目"或"暂时没有子任务的项目"标成项目；大一点的任务也会被当成项目 |
| D. 项目属性是一个块引用，任务指向项目 | 任务上加一个"所属项目"的块引用属性（Asana、Linear、Notion relation 的做法） | 任务可以分散在任何地方 | 和 ADR 0003 冲突：会出现块层级之外的第二种归属关系，ADR 0003 中被否决的"用块引用属性指定父任务"就是这种做法。采用它需要先修改 ADR |

取舍的要点：
- A 和 C 完全落在现有的任务模型里，B 和 D 引入新的概念。
- 选 B 时还要决定项目内的任务是怎么归入项目的：块层级，还是块引用。块层级与 ADR 0003 一致。

**Q2：项目字段**

业界项目字段的共同部分：名称、负责人、状态、健康度、开始日期、目标日期、优先级、描述、进度，加上自定义字段。

本插件的情况：
- 任务已经有开始日期、截止日期、重要性、紧急度、备注、自定义属性。
- 负责人、成员、团队在单用户场景下不适用。

可选的做法：
- 完全复用任务字段，不新增（与 Q1 的 A、C 配合）。
- 新增少数几个项目专属字段，例如"目标/成功标准"（Atlassian Home 的 About、Basecamp 的 purpose），或者手填的健康度。
- 新增字段要遵守 ADR 0008（只增不改）。是否开放成自定义属性，由 ADR 0023 决定。

**Q3：项目的状态和任务的六种状态是什么关系**

业界的情况：
- 项目状态集合多为"规划、进行中、暂停、完成、取消"，分类固定、名称可以自定义（Linear、Plane、Wrike）。
- 健康度另放一个字段，或者放在状态更新里（Linear、Asana、Atlassian Home、Plane、Monday Portfolio）。
- 也有把两者混在一个字段里的（OpenProject、GitHub status update）。

可选的做法：
- 项目直接用任务的六种状态。大致对应关系：收集箱 ≈ 草稿；待开始 ≈ planned；进行中 ≈ started；等待中 ≈ 取决于外部；将来/也许 ≈ paused 或 backlog；已完成 = completed。
  - 本插件没有"取消"状态，对应的是"放弃"（Drop）。放弃一个项目时，项目块下面的任务怎么办，需要单独决定。
  - 这个做法的好处是，已有规则直接生效：将来/也许、等待中的项目整棵子树进入搁置子树；已完成的项目让子树退出下一步行动（ADR 0017）。
- 项目另设一套状态，例如 planning、active、on hold、completed。代价是要定义它和子任务的阻塞、搁置规则怎么交互。
- 健康度：不做；或者手填一个三值的字段；或者由插件计算（参照 Wrike 的系统健康度：有逾期任务、截止日期超出、长期没有进展）。

**Q4：项目视图做哪些**

各工具都有的视图：
- 项目列表或项目组合：每行一个项目，显示状态、健康度、进度、目标日期、最近一次更新。
- 单个项目的概览页：属性、描述、进度、里程碑、最近的更新。
- 项目内的任务列表或看板。

团队工具另有时间线（甘特）、工作量、仪表盘。

本插件可选的做法：
- 新增一个项目视图，列出项目，显示状态、进度、下一步行动的数量、截止日期、停滞标记。点开一个项目，看它的任务树。
- 不新增视图，在现有视图里增强：
  - 全部任务视图按项目过滤，或给项目加上视觉标识。
  - 回顾里加一步"项目"，逐个检视项目。
  - 下一步行动按项目分组或筛选。
- 列表的排序：业界常见的有按状态分组、按目标日期排序、按优先级排序（Linear 的优先级组内可以手动排序）。插件可以复用现有的评分，也可以按截止日期排序。
- 要考虑窄档宽度：插件面板日常在窄档下使用，卡片区优先。

**Q5：进度怎么算**

业界的口径：
- 按子项数量：GitHub、Plane、Notion 模板、Monday 的 battery、Jira 按数量统计的模式。
- 按估算或工时加权：Linear 用 estimate，进行中的算 0.25；OpenProject 按工时；MS Project 按工期。
- 手工填写：Basecamp 的 Hill Chart 和 Gauge、MS Project 的 Physical % Complete。

本插件可选的做法：
- 已完成的后代任务数 / 后代任务总数。还要决定：
  - 只算直接子任务，还是算全部后代任务。Jira Plans 两种都提供。
  - 将来/也许的任务算不算在分母里。Linear 把 canceled 的移出 scope；本插件的子任务阻塞规则不把将来/也许算作阻塞，可以和这条保持一致。
- 按工作量加权：已完成的工作量之和 / 全部工作量之和，工作量取 1–7 档。好处是大任务权重更高；代价是工作量本身是主观估计。
- 只显示数字（例如 3/8），不显示百分比。
- 重复任务子项怎么算：它完成后会安排下一次，会回到待开始，进度可能"倒退"。

**Q6：里程碑和阶段要不要做**

业界的做法：
- 里程碑多数是"任务的一种类型或一个标记"：Asana 的 resource_subtype、ClickUp 的任务类型、MS Project 的零工期任务、Wrike 的日期类型。
- 少数是独立对象：Linear 的 project milestone、Plane 的 milestone、Jira 的 version。
- 阶段：MS Project 用摘要任务表达阶段；OpenProject 有全局的 phase 与 gate；Monday Portfolio 有 Stage 列。

可选的做法：
- 不做。需要时用户用"子任务 + 截止日期"或"顺序执行的父任务"来表达阶段。顺序执行已经能表达"阶段依次推进"。
- 做成任务上的一个标记，例如"里程碑"布尔属性，在项目视图里突出显示。
- 留到以后的步骤。

**Q7：长期没有进展的项目怎么检测**

业界的信号：
- 定期更新缺失：Linear 的 Update Missing 和灰色状态、Atlassian Home 的提醒、Basecamp 的 check-in。
- 一段时间内没有活动：Jira Summary 的 dormant 和 stale work、Plane 自动关闭长期不动的工作项。
- 逾期或进度偏差：Wrike 的健康度、MS Project 的 Late 和 Slipping 报表。
- Basecamp 认为 Hill Chart 上的点长期不动，就说明这块工作该拆分了。

可选的判断条件，可以组合使用：
1. 项目没有下一步行动：未完成、也不在搁置子树中，但没有任何后代任务是下一步行动。这是 GTD 每周回顾的经典检查，完全由已有的派生概念算出，不需要新数据。
2. 项目在 N 天里没有完成任何后代任务：要读完成历史。在 Orca 原生界面里改成已完成的任务没有记录，会被误判为停滞。
3. 项目在 N 天里块没有变动：要用块的修改时间。改错别字也算"有进展"，信号偏弱。
4. 复用回顾周期：给项目设回顾周期，到期时出现在"需要回顾的任务"里。不需要新的机制，但它只表示"该看一眼了"，不表示"没有进展"。
5. 项目已逾期，或者有逾期的后代任务。

需要另外决定：
- 停滞信号显示在哪里：项目视图的标记、回顾里新增的一步、统计视图页头的数字。
- N 是写死，还是在设置中修改。

**Q8：其他需要顺带决定的问题**
- 项目完成时，项目块下未完成的任务怎么处理：
  - 业界多数不自动处理（Linear 不自动关闭，Monday 建议用自动化）。
  - 本插件已有规则：已完成的祖先任务会让子树退出下一步行动（ADR 0017），所以未完成的子任务实际已被"冻结"。要决定是否在完成项目时提示用户。
- 项目能否嵌套：业界有的允许（OpenProject、Wrike、ClickUp Subfolder），有的不允许（Linear、Jira、GitHub）。本插件用块层级，嵌套天然存在。要决定的是项目下的项目在项目列表里怎么显示：平铺，还是成树。
- 一个任务能否属于多个项目：Asana、Wrike、GitHub、ClickUp TIML 允许；Linear、Jira、Plane、OpenProject 不允许。本插件以块层级为唯一的父子关系，一个任务只有一个父任务，天然只属于一个项目。Orca 的镜像块不会改变这一点：镜像块在入口统一解析成源块。
- 评分继承（ADR 0019）已经让项目的重要性和紧急度影响子任务的排序，这正是"项目轻重体现在下一步行动里"。项目功能要不要在此之外再做什么，需要决定。

## 6. 来源

全部访问于 2026-10-15。每条事实性陈述的具体页面已在正文中行内给出，这里只按工具列出主要入口，方便查找。

- Jira：[OpenAPI 规范](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json)；[Jira Software Cloud 帮助](https://support.atlassian.com/jira-software-cloud/)；[Jira Cloud 管理](https://support.atlassian.com/jira-cloud-administration/)；[Atlassian Home（platform experiences）](https://support.atlassian.com/platform-experiences/)；[Analytics schema](https://support.atlassian.com/analytics/docs/schema-for-atlassian-projects/)
- Asana：[developers.asana.com](https://developers.asana.com/reference/rest-api-reference)；[help.asana.com](https://help.asana.com/)
- Linear：[linear.app/docs](https://linear.app/docs)；[changelog](https://linear.app/changelog)；[GraphQL schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)
- Microsoft：[Graph Planner API](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0)；[Project schedule API](https://learn.microsoft.com/en-us/dynamics365/project-operations/project-management/schedule-api-preview)；[Project for the web](https://learn.microsoft.com/en-us/project-for-the-web/)；[Project Online](https://learn.microsoft.com/en-us/projectonline/)；[support.microsoft.com/project](https://support.microsoft.com/en-us/project)
- ClickUp：[developer.clickup.com](https://developer.clickup.com/reference)；help.clickup.com（只用到搜索摘要）
- Monday：[developer.monday.com](https://developer.monday.com/api-reference)；support.monday.com（只用到搜索摘要）
- Wrike：[developers.wrike.com API v4](https://developers.wrike.com/api/v4/)；[help.wrike.com](https://help.wrike.com/)
- Basecamp：[bc3-api](https://github.com/basecamp/bc3-api)；[Basecamp 帮助](https://5.basecamp-help.com/)；[Hill Charts](https://basecamp.com/hill-charts)
- Notion：[notion.com/help](https://www.notion.com/help)；[developers.notion.com](https://developers.notion.com/reference/property-object)
- GitHub Projects：[docs.github.com Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)；[GraphQL schema](https://docs.github.com/public/fpt/schema.docs.graphql)
- OpenProject：[用户指南与 API v3](https://www.openproject.org/docs/)；[源码](https://github.com/opf/openproject)
- Plane：[docs.plane.so](https://docs.plane.so/)；[源码](https://github.com/makeplane/plane)
- 飞书项目：[meegle-cli](https://github.com/larksuite/meegle-cli)；[Meegle](https://www.meegle.com/)
- PingCode：[产品页](https://pingcode.com/product/project)
- TAPD：[腾讯云文档中心 TAPD](https://cloud.tencent.com/document/product/624)
- Teambition、Worktile：帮助中心没有抓到，只用到 App Store 描述和官网首页
- PMI：[PMI 学习库](https://www.pmi.org/learning/library/gates-success-tollgate-methodology-6842)（只用到搜索摘要）
- PRINCE2（非官方线索）：[prince2.com](https://www.prince2.com/usa/prince2-processes)；[prince2.wiki](https://prince2.wiki/)

### 抓取受限说明

- help.clickup.com、support.monday.com、techcommunity.microsoft.com、pmi.org：返回 403，只用到搜索摘要。
- 国内工具的帮助中心多数抓不到正文。
- AXELOS 和 PeopleCert 的官方原文没有检索到。
- 部分研究过程中 WebFetch 不可用，改用 curl 直接抓取官方页面和源码。
