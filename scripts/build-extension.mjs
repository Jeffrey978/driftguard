// Packs the unpacked extension into site/public/downloads/driftguard-extension.zip.
// Every entry lives under a top-level "DriftGuard/" folder with forward-slash
// paths, so the zip unpacks cleanly with Finder, Explorer, ditto or unzip.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "site", "public", "downloads");
const OUT_FILE = join(OUT_DIR, "driftguard-extension.zip");
const TOP_FOLDER = "DriftGuard";

const INCLUDE = ["manifest.json", "src", "assets", "fonts", "icons", "README.md", "DriftGuard_Tester_Guide.md"];

// Design-only files the extension never loads.
const EXCLUDE = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /(^|\/)\./,
  /^assets\/mascot\/portraits\//,
  /^assets\/mascot\/preview\.html$/
];

function walk(path) {
  const stats = statSync(path);
  if (stats.isFile()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((name) => walk(join(path, name)));
}

const files = {};
let totalBytes = 0;
const mtime = new Date();

for (const entry of INCLUDE) {
  const abs = join(ROOT, entry);
  if (!existsSync(abs)) {
    console.error(`build:ext: missing ${entry}`);
    process.exit(1);
  }
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (EXCLUDE.some((pattern) => pattern.test(rel))) continue;
    const data = readFileSync(file);
    totalBytes += data.length;
    // Already-compressed formats are stored as-is.
    const level = /\.(png|jpe?g|woff2?|zip)$/i.test(rel) ? 0 : 9;
    files[`${TOP_FOLDER}/${rel}`] = [data, { level, mtime }];
  }
}

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const zipped = zipSync(files);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, zipped);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `build:ext: DriftGuard ${manifest.version} -> ${relative(ROOT, OUT_FILE)} ` +
    `(${Object.keys(files).length} files, ${kb(totalBytes)} -> ${kb(zipped.length)})`
);
