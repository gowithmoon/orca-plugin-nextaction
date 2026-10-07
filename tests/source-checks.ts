// Source static checks behind tests/architecture.test.ts and
// tests/translations.test.ts. A lightweight source scan, not the TypeScript
// compiler API (ADR 0010): a set of source files goes in, a list of violations
// comes out.
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

export interface SourceFile {
  /** Relative to the scanned root with "/" separators, e.g. "src/domain/task.ts". */
  path: string;
  text: string;
}

export interface Violation {
  file: string;
  /** 1-based; absent when the violation is not tied to a line. */
  line?: number;
  rule: string;
  /** What to do instead. */
  allowed: string;
}

export interface LayerRule {
  /** Path prefix of the layer's files, e.g. "src/domain/". */
  files: string;
  /** Other layers, or package groups from `packages`, this layer may import. */
  mayDependOn: string[];
  /**
   * Layers from `mayDependOn` this layer may import only under a path prefix,
   * e.g. `{ application: "src/application/ports/" }`.
   */
  onlyUnder?: Record<string, string>;
  allowed: string;
}

export interface UsageRule {
  /** Completes "<layer> …", e.g. "uses the global orca". */
  name: string;
  /** Matched against code with comments and string contents blanked out. */
  pattern: RegExp;
  forbiddenIn: string[];
  allowed: string;
}

export interface ArchitectureRules {
  layers: Record<string, LayerRule>;
  /** Package groups that layers may depend on, e.g. `{ react: ["react", "react-dom"] }`. */
  packages: Record<string, string[]>;
  usages: UsageRule[];
  /**
   * Rules from the documented table that a source scan cannot check, listed so
   * every documented rule has a row here. The scanner ignores them.
   */
  notChecked: { rule: string; reason: string }[];
}

/**
 * Reads every .ts/.tsx file under `root`/src, skipping declarations and test
 * files (see `notChecked` in tests/architecture.test.ts for why test files are
 * exempt). Paths are relative to `root`, so they start with "src/".
 */
export function readSourceFiles(root: URL): SourceFile[] {
  const base = fileURLToPath(root);
  return readdirSync(`${base}/src`, { recursive: true, encoding: "utf8" })
    .map((name) => `src/${name.split("\\").join("/")}`)
    .filter(
      (path) =>
        /\.tsx?$/.test(path) &&
        !path.endsWith(".d.ts") &&
        !/\.test\.tsx?$/.test(path),
    )
    .sort()
    .map((path) => ({ path, text: readFileSync(`${base}/${path}`, "utf8") }));
}

export function formatViolation(violation: Violation): string {
  const where =
    violation.line === undefined
      ? violation.file
      : `${violation.file}:${violation.line}`;
  return `${where} ${violation.rule}. Allowed: ${violation.allowed}`;
}

export interface Dictionary {
  /** Where the dictionary lives, e.g. "src/shared/l10n/zh-cn.ts". */
  file: string;
  entries: Record<string, string>;
}

export function checkTranslations(
  files: SourceFile[],
  dictionary: Dictionary,
): Violation[] {
  const violations: Violation[] = [];
  const used = new Set<string>();
  for (const file of files) {
    const code = maskSource(file.text);
    // Calls of t(), not its declaration and not methods such as `x.t(`.
    for (const match of code.matchAll(/(?<![\w$.]|function\s+)t\s*\(\s*/g)) {
      const line = lineAt(file.text, match.index);
      const key = literalArgument(
        file.text,
        code,
        match.index + match[0].length,
      );
      if (key === undefined) {
        violations.push({
          file: file.path,
          line,
          rule: "t() key is not a string literal",
          allowed:
            'pass the English source text as a plain string, e.g. t("Save"), with values passed as named placeholders in the second argument',
        });
        continue;
      }
      used.add(key);
      if (Object.hasOwn(dictionary.entries, key)) continue;
      violations.push({
        file: file.path,
        line,
        rule: `${JSON.stringify(key)} has no zhCN translation`,
        allowed: `add the key with its Chinese text to ${dictionary.file}`,
      });
    }
  }
  for (const key of Object.keys(dictionary.entries)) {
    if (used.has(key)) continue;
    violations.push({
      file: dictionary.file,
      rule: `${JSON.stringify(key)} is translated but no t() call uses it`,
      allowed: `remove the entry from ${dictionary.file}, or use the key in t()`,
    });
  }
  return violations;
}

/**
 * The text of a plain "…" or '…' string starting at `offset` that makes up the
 * whole argument, or undefined for anything else (identifiers, template
 * literals, concatenations). "${…}" inside a plain string is kept as written.
 */
function literalArgument(
  text: string,
  code: string,
  offset: number,
): string | undefined {
  const quote = code.charAt(offset);
  if (quote !== '"' && quote !== "'") return undefined;
  const close = code.indexOf(quote, offset + 1);
  if (close < 0) return undefined;
  const after = code.slice(close + 1).match(/^\s*([,)])/);
  return after ? text.slice(offset + 1, close) : undefined;
}

export function checkArchitecture(
  files: SourceFile[],
  rules: ArchitectureRules,
): Violation[] {
  const layerOf = (path: string) =>
    Object.entries(rules.layers).find(([, layer]) =>
      `${path}/`.startsWith(layer.files),
    );
  /** The layer or package group imported, and for a layer the resolved path. */
  const dependencyOf = (
    file: string,
    specifier: string,
  ): { target: string; path?: string } | undefined => {
    if (specifier.startsWith(".")) {
      const path = posix.join(posix.dirname(file), specifier);
      const target = layerOf(path)?.[0];
      return target === undefined ? undefined : { target, path };
    }
    const target = Object.entries(rules.packages).find(([, names]) =>
      names.some(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      ),
    )?.[0];
    return target === undefined ? undefined : { target };
  };

  const violations: Violation[] = [];
  for (const file of files) {
    const own = layerOf(file.path);
    if (!own) continue;
    const [ownName, ownRule] = own;
    const code = maskSource(file.text);

    for (const { specifier, offset } of importSpecifiers(file.text, code)) {
      const dependency = dependencyOf(file.path, specifier);
      if (dependency === undefined || dependency.target === ownName) continue;
      const { target, path } = dependency;
      const under = ownRule.onlyUnder?.[target];
      let rule: string | undefined;
      if (!ownRule.mayDependOn.includes(target)) {
        rule = `${ownName} depends on ${target}`;
      } else if (under !== undefined && !`${path}/`.startsWith(under)) {
        rule = `${ownName} depends on ${target} outside ${under}`;
      }
      if (rule === undefined) continue;
      violations.push({
        file: file.path,
        line: lineAt(file.text, offset),
        rule,
        allowed: ownRule.allowed,
      });
    }

    for (const usage of rules.usages) {
      if (!usage.forbiddenIn.includes(ownName)) continue;
      const pattern = new RegExp(usage.pattern.source, "g");
      for (const match of code.matchAll(pattern)) {
        violations.push({
          file: file.path,
          line: lineAt(file.text, match.index),
          rule: `${ownName} ${usage.name}`,
          allowed: usage.allowed,
        });
      }
    }
  }
  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
  );
}

/** Static, side-effect and dynamic import specifiers, plus `export … from`. */
function importSpecifiers(
  text: string,
  code: string,
): { specifier: string; offset: number }[] {
  // `code` keeps the quotes of string literals, so the specifier is read from
  // `text` between the same offsets.
  const pattern =
    /\b(?:import|export)\b[^;"'`]*?\bfrom\s*(["'])|\bimport\s*(["'])|\bimport\s*\(\s*(["'])/g;
  return [...code.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = code.indexOf(code.charAt(open), open + 1);
    return { specifier: text.slice(open + 1, close), offset: match.index };
  });
}

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

const regexKeywords = new Set([
  "return",
  "typeof",
  "instanceof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
]);

/**
 * Blanks out comments, the contents of string and template literals, and
 * regular expression literals, keeping every offset and line break in place.
 * Quotes stay, and so does the code inside template substitutions.
 */
export function maskSource(text: string): string {
  const out = text.split("");
  const n = text.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < Math.min(to, n); k++) {
      if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
    }
  };
  // Brace depth outside each open template substitution, innermost last.
  const substitutions: number[] = [];
  let depth = 0;
  // The previous token, to tell a regular expression from a division.
  let previous = "";

  /** Skips template text starting at `start`; stops after the closing "`" or after "${". */
  const templateText = (start: number): number => {
    let k = start;
    while (k < n) {
      const c = text[k];
      if (c === "\\") {
        k += 2;
      } else if (c === "`") {
        blank(start, k);
        previous = ")";
        return k + 1;
      } else if (c === "$" && text[k + 1] === "{") {
        blank(start, k);
        substitutions.push(depth);
        depth++;
        previous = "{";
        return k + 2;
      } else {
        k++;
      }
    }
    blank(start, n);
    return n;
  };

  let i = 0;
  while (i < n) {
    const c = text.charAt(i);
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const k = end < 0 ? n : end;
      blank(i, k);
      i = k;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const k = end < 0 ? n : end + 2;
      blank(i, k);
      i = k;
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && text[k] !== c && text[k] !== "\n") {
        k += text[k] === "\\" ? 2 : 1;
      }
      blank(i + 1, k);
      previous = ")";
      i = k + 1;
    } else if (c === "`") {
      i = templateText(i + 1);
    } else if (
      c === "/" &&
      (previous === "" ||
        /^[(,=:[!&|?{};+\-*%<>~^}]$/.test(previous) ||
        regexKeywords.has(previous))
    ) {
      let k = i + 1;
      let inClass = false;
      while (k < n && text[k] !== "\n") {
        const r = text[k];
        if (r === "\\") {
          k += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        k++;
      }
      blank(i, k + 1);
      k++;
      while (k < n && /[a-z]/i.test(text.charAt(k))) k++;
      previous = ")";
      i = k;
    } else if (c === "{") {
      depth++;
      previous = "{";
      i++;
    } else if (c === "}") {
      depth--;
      if (substitutions.at(-1) === depth) {
        substitutions.pop();
        i = templateText(i + 1);
      } else {
        previous = "}";
        i++;
      }
    } else if (/\s/.test(c)) {
      i++;
    } else if (/[\w$]/.test(c)) {
      let k = i;
      while (k < n && /[\w$]/.test(text.charAt(k))) k++;
      previous = text.slice(i, k);
      i = k;
    } else {
      previous = c;
      i++;
    }
  }
  return out.join("");
}
