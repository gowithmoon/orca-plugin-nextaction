# 用 Biome 做 lint 和格式化，不用 ESLint

项目使用 TypeScript 7（Go 原生编译器）。截至 2026-10，typescript-eslint 要求的 TypeScript 版本为 `<6.1.0`，在 TypeScript 7 下会直接崩溃（typescript-eslint #12518），因为 TypeScript 7 没有提供它依赖的编译器 API。Biome 自带解析器，不受这个问题影响，所以用它做 lint 和格式化。分层依赖规则则由仓库内一个扫描 import 的架构测试来检查（见 ADR 0004），不依赖任何 lint 插件。等 typescript-eslint 正式支持 TypeScript 7 后，可以重新评估这个选择。
