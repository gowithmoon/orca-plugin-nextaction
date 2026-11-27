// Writes release/notes.md for the GitHub Release: the CHANGELOG.md section
// of the version in package.json, followed by installation instructions.
// Fails when CHANGELOG.md has no section for this version, so a release
// cannot go out without its changelog.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  version: string;
};

const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");
const start = lines.findIndex((line) =>
  new RegExp(`^## ${version.replaceAll(".", "\\.")}(\\s|$)`).test(line),
);
if (start === -1) {
  console.error(`CHANGELOG.md has no "## ${version}" section`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith("## "));
const section = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
if (section === "") {
  console.error(`The "## ${version}" section of CHANGELOG.md is empty`);
  process.exit(1);
}

const repo = "https://github.com/gowithmoon/orca-plugin-nextaction";
const install = [
  "### 安装",
  "",
  `在 Orca 插件市场搜索「今天干点啥」安装，或者下载下面的 \`${name}-v${version}.zip\`，解压到 \`Documents/orca/plugins\`，重启 Orca，在「设置 → 插件」中启用。解压后的文件夹名必须是 \`${name}\`。`,
  "",
  `详细用法见[用户手册](${repo}/blob/main/docs/guide/zh/README.md)。`,
  "",
  "---",
  "",
  `See the [English README](${repo}/blob/main/README.en.md) for features and installation.`,
].join("\n");

mkdirSync("release", { recursive: true });
writeFileSync("release/notes.md", `${section}\n\n${install}\n`);
console.log("Wrote release/notes.md");
