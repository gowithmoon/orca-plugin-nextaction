# 分层架构，依赖方向由测试强制

代码分为五层，只允许上层依赖下层：`ui`（React 视图与面板）→ `application`（用例）→ `domain`（纯 TypeScript 的任务模型、状态、阻塞判断、评分、重复规则）；`application` 通过接口使用 `infra`（Orca 适配器：仓储、查询构建、属性编解码）；所有 Orca 注册集中在 `platform`（注册表，`unload` 时自动逆序注销）。`domain` 禁止引用全局 `orca` 和 React，因此可以完整地做单元测试。Orca 的属性名、类型码、内部字段约定只出现在 `infra` 的编解码层。依赖方向由一个扫描 import 的架构测试强制检查，不依赖人工自觉。

## Consequences

- 业务规则（下一步行动、评分、重复）可以脱离 Orca 运行和测试。
- Orca API 变化时只需修改 `infra` 和 `platform`。
- 新增一个功能通常要跨多层各写一点，代价是文件数量更多。
