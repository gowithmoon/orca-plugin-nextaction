import { describe, expect, it } from "vitest";
import zhCN from "../src/shared/l10n/zh-cn";
import {
  checkTranslations,
  formatViolation,
  readSourceFiles,
} from "./source-checks";

const samples = readSourceFiles(
  new URL("./violation-samples/translations/", import.meta.url),
);
const sampleDictionary = {
  file: "src/shared/l10n/zh-cn.ts",
  entries: {
    Translated: "已翻译",
    "Hello ${name}": "你好，${name}",
    "No longer used": "不再使用",
  },
};

describe("translation completeness", () => {
  it("every t() key in src/ has a zhCN translation and every translation is used", () => {
    const source = readSourceFiles(new URL("../", import.meta.url));
    const dictionary = { file: "src/shared/l10n/zh-cn.ts", entries: zhCN };

    expect(Object.keys(zhCN)).toContain("Failed to load: ${reason}");
    expect(checkTranslations(source, dictionary).map(formatViolation)).toEqual(
      [],
    );
  });

  it.each([
    [
      "src/ui/missing-translation.ts",
      ['"Not translated" has no zhCN translation'],
    ],
    [
      "src/ui/non-literal-key.ts",
      [
        "t() key is not a string literal",
        "t() key is not a string literal",
        "t() key is not a string literal",
        "t() key is not a string literal",
      ],
    ],
    [
      "src/shared/l10n/zh-cn.ts",
      ['"No longer used" is translated but no t() call uses it'],
    ],
  ])("reports %s as %j", (file, expected) => {
    const violations = checkTranslations(samples, sampleDictionary);

    expect(
      violations.filter((v) => v.file === file).map((v) => v.rule),
    ).toEqual(expected);
  });

  it("says where the violation is, which rule it breaks and what is allowed", () => {
    const messages = checkTranslations(samples, sampleDictionary)
      .filter((v) => v.file === "src/ui/missing-translation.ts")
      .map(formatViolation);

    expect(messages).toEqual([
      'src/ui/missing-translation.ts:4 "Not translated" has no zhCN translation. Allowed: add the key with its Chinese text to src/shared/l10n/zh-cn.ts',
    ]);
  });
});
