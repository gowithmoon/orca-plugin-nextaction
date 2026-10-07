// Builds output into a local Orca plugins directory for manual testing.
// The target comes from ORCA_PLUGINS_DIR (usually set in .env.local); the
// plugin folder name is the package name, which Orca uses as pluginName.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pluginsDir = process.env.ORCA_PLUGINS_DIR;
if (!pluginsDir) {
  console.error(
    [
      "ORCA_PLUGINS_DIR is not set.",
      "Create .env.local in the repo root with a line like:",
      "  ORCA_PLUGINS_DIR=/mnt/c/Users/<you>/Documents/orca/plugins",
    ].join("\n"),
  );
  process.exit(1);
}
// Refuse to create the plugins directory itself: a missing one is most likely a typo.
if (!existsSync(pluginsDir)) {
  console.error(`ORCA_PLUGINS_DIR does not exist: ${pluginsDir}`);
  process.exit(1);
}
if (!existsSync("dist/index.js")) {
  console.error("dist/index.js not found. Run pnpm build first.");
  process.exit(1);
}

const { name } = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
};
const target = join(pluginsDir, name);

mkdirSync(target, { recursive: true });
// Replace dist wholesale so files dropped from the build do not linger.
rmSync(join(target, "dist"), { recursive: true, force: true });
cpSync("dist", join(target, "dist"), { recursive: true });
cpSync("icon.png", join(target, "icon.png"));
cpSync("package.json", join(target, "package.json"));

console.log(`Deployed ${name} to ${target}`);
console.log("Disable and re-enable the plugin in Orca to load the new build.");
