// Packs the built plugin into release/<name>-v<version>.zip for GitHub
// Releases and the Orca plugin marketplace. The zip holds one top-level
// folder named after the package, because Orca uses the folder name as
// pluginName. Written with node:zlib so it needs no zip binary.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  version: string;
};

const included = [
  "dist",
  "package.json",
  "icon.svg",
  "LICENSE",
  "README.md",
  "README.en.md",
];

if (!existsSync("dist/index.js")) {
  console.error("dist/index.js not found. Run pnpm build first.");
  process.exit(1);
}
for (const path of included) {
  if (!existsSync(path)) {
    console.error(`${path} not found.`);
    process.exit(1);
  }
}

function listFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((child) => listFiles(join(path, child)));
}

// MS-DOS date and time, the only timestamp format the zip headers carry.
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

const now = dosDateTime(new Date());
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
const localParts: Buffer[] = [];
const centralParts: Buffer[] = [];
let offset = 0;
let count = 0;

for (const file of included.flatMap(listFiles)) {
  const entryName = [name, ...relative(".", file).split(sep)].join("/");
  const nameBytes = Buffer.from(entryName, "utf8");
  const data = readFileSync(file);
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed to extract
  local.writeUInt16LE(UTF8_NAMES, 6);
  local.writeUInt16LE(DEFLATE, 8);
  local.writeUInt16LE(now.time, 10);
  local.writeUInt16LE(now.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28); // extra field length
  localParts.push(local, nameBytes, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed to extract
  central.writeUInt16LE(UTF8_NAMES, 8);
  central.writeUInt16LE(DEFLATE, 10);
  central.writeUInt16LE(now.time, 12);
  central.writeUInt16LE(now.date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  // Extra field, comment, disk number, internal and external attributes
  // stay zero.
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, nameBytes);

  offset += local.length + nameBytes.length + compressed.length;
  count += 1;
}

const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync("release", { recursive: true });
const target = join("release", `${name}-v${version}.zip`);
writeFileSync(target, Buffer.concat([...localParts, ...centralParts, end]));

console.log(`Packed ${count} files into ${target}`);
