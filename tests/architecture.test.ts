import { describe, expect, it } from "vitest";
import {
  type ArchitectureRules,
  checkArchitecture,
  formatViolation,
  readSourceFiles,
} from "./source-checks";

// The table in docs/ARCHITECTURE.md section 2, row for row: each "may depend
// on" and "forbidden" entry is a layer rule, a usage rule, or listed under
// `notChecked` with the reason. Change both together. The register* and global
// React usage rules come from section 4 ("注册与清理", "React").
const rules: ArchitectureRules = {
  layers: {
    domain: {
      files: "src/domain/",
      mayDependOn: ["shared"],
      allowed: "domain may depend only on shared",
    },
    application: {
      files: "src/application/",
      mayDependOn: ["domain", "shared"],
      allowed: "application may depend only on domain and shared",
    },
    infra: {
      files: "src/infra/",
      mayDependOn: ["application", "domain", "shared"],
      onlyUnder: { application: "src/application/ports/" },
      allowed:
        "infra may depend only on application (ports), domain and shared",
    },
    ui: {
      files: "src/ui/",
      mayDependOn: ["application", "domain", "shared", "react"],
      allowed:
        "ui may depend only on application, domain (types and pure functions), shared and React",
    },
    platform: {
      files: "src/platform/",
      mayDependOn: ["domain", "application", "infra", "ui", "shared", "react"],
      allowed: "platform may depend on every layer",
    },
    shared: {
      files: "src/shared/",
      mayDependOn: [],
      allowed: "shared may not depend on any other layer",
    },
  },
  packages: {
    react: ["react", "react-dom", "valtio"],
  },
  usages: [
    {
      name: "uses the global orca",
      pattern: /\borca\s*[.[]/,
      forbiddenIn: ["domain", "application", "shared"],
      allowed:
        "access Orca only in infra (behind an application port) or platform",
    },
    {
      name: "reads the current time",
      pattern: /\bnew\s+Date\s*\(\s*\)|\bDate\s*\.\s*now\b/,
      forbiddenIn: ["domain", "application"],
      allowed:
        "get the current time from the Clock port; domain functions take `now` as a parameter",
    },
    {
      name: "calls orca.invokeBackend or orca.commands.invoke*",
      pattern:
        /\borca\s*\.\s*invokeBackend\b|\borca\s*\.\s*commands\s*\.\s*invoke\w*/,
      forbiddenIn: ["ui"],
      allowed:
        "read and write through use cases via ui/hooks; ui may use orca.components and read orca.state",
    },
    {
      name: "calls Orca register*/unregister* directly",
      pattern: /\borca\s*\.(?:\s*\w+\s*\.)*?\s*(?:un)?register\w*/,
      forbiddenIn: ["domain", "application", "infra", "ui", "shared"],
      allowed: "register through platform/registry.ts so unload releases it",
    },
    {
      name: "uses the global React",
      pattern: /\bwindow\s*\.\s*(?:React|ReactDOM|createRoot|Valtio)\b/,
      forbiddenIn: ["domain", "application", "infra", "shared"],
      allowed: "only ui and platform may use React",
    },
  ],
  notChecked: [
    {
      rule: "ui may use domain only for types and pure functions",
      reason:
        "whether an imported domain function is pure is not visible in the source text",
    },
    {
      rule: "ui may use only orca.components and read-only orca.state",
      reason:
        "only the invoke* calls are matched; a write to orca.state or another orca.* call looks like any other expression to a text scan",
    },
    {
      rule: "platform holds no business rules",
      reason: "a business rule has no syntactic signature to match",
    },
    {
      rule: "*.test.ts files are exempt from every rule",
      reason:
        "tests sit next to the code they test (section 3) and must reach the fake host and tests/ helpers outside every layer; they are not part of the bundle",
    },
  ],
};

const samples = readSourceFiles(
  new URL("./violation-samples/architecture/", import.meta.url),
);

describe("architecture rules", () => {
  it("src/ follows every rule", () => {
    const source = readSourceFiles(new URL("../", import.meta.url));

    expect(source.map((file) => file.path)).toContain(
      "src/platform/bootstrap.ts",
    );
    expect(checkArchitecture(source, rules).map(formatViolation)).toEqual([]);
  });

  it("says where the violation is, which rule it breaks and what is allowed", () => {
    const messages = checkArchitecture(samples, rules)
      .filter((v) => v.file === "src/application/reads-current-time.ts")
      .map(formatViolation);

    expect(messages).toEqual([
      "src/application/reads-current-time.ts:2 application reads the current time. Allowed: get the current time from the Clock port; domain functions take `now` as a parameter",
    ]);
  });

  it.each([
    ["src/domain/imports-infra.ts", ["domain depends on infra"]],
    ["src/domain/uses-global-orca.ts", ["domain uses the global orca"]],
    [
      "src/domain/reads-current-time.ts",
      ["domain reads the current time", "domain reads the current time"],
    ],
    [
      "src/application/reads-current-time.ts",
      ["application reads the current time"],
    ],
    [
      "src/ui/bypasses-use-cases.ts",
      [
        "ui depends on infra",
        "ui calls orca.invokeBackend or orca.commands.invoke*",
        "ui calls orca.invokeBackend or orca.commands.invoke*",
      ],
    ],
    [
      "src/infra/registers-directly.ts",
      [
        "infra calls Orca register*/unregister* directly",
        "infra calls Orca register*/unregister* directly",
      ],
    ],
    [
      "src/application/depends-on-react.ts",
      ["application depends on react", "application uses the global React"],
    ],
    ["src/application/imports-infra.ts", ["application depends on infra"]],
    [
      "src/domain/depends-on-react.ts",
      [
        "domain depends on react",
        "domain depends on application",
        "domain depends on platform",
      ],
    ],
    [
      "src/infra/depends-on-ui.ts",
      ["infra depends on react", "infra depends on ui", "infra depends on ui"],
    ],
    [
      "src/infra/imports-use-case.ts",
      ["infra depends on application outside src/application/ports/"],
    ],
    [
      "src/shared/depends-on-others.ts",
      [
        "shared depends on react",
        "shared depends on platform",
        "shared uses the global orca",
      ],
    ],
  ])("reports %s as %j", (file, expected) => {
    const violations = checkArchitecture(samples, rules);

    expect(
      violations.filter((v) => v.file === file).map((v) => v.rule),
    ).toEqual(expected);
  });
});
