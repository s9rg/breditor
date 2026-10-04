import {createHash} from "node:crypto";
import {readFileSync, realpathSync, readdirSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {mergeConfig} from "vite";
import base from "./vite.browser.config.js";

// Run the unchanged browser harness against private, already-qualified packages.
// Never rebuild or replace the shipping dist trees to test a feature candidate.
const repository = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
const source = process.env["BREDITOR_BROWSER_PACKAGE_RECORD"];
if (!source) throw new Error("Set BREDITOR_BROWSER_PACKAGE_RECORD to a private package qualification record.");
const recordPath = realpathSync(resolve(repository, source));
const local = relative(resolve(repository, "target"), recordPath);
if (local === ".." || local.startsWith(`..${sep}`) || local.startsWith(sep)) throw new Error("Candidate record must be under repository target.");
const record = JSON.parse(readFileSync(recordPath, "utf8"));
if (record.status !== "passed" || record.publishable !== false) throw new Error("Expected a passed private package qualification.");
if (typeof record.staging !== "string" || typeof record.consumer !== "string" ||
    typeof record.browserPackage?.path !== "string" || typeof record.wasmPackage?.path !== "string" ||
    typeof record.tarballSha256?.browser !== "string" || typeof record.tarballSha256?.wasm !== "string") {
  throw new Error("Expected a private package record with staging, consumer and archive identities.");
}
const staging = dirname(recordPath);
if (realpathSync(record.staging) !== staging) throw new Error("Package staging identity differs.");
const consumer = realpathSync(record.consumer);
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function tree(path: string): string {
  return JSON.stringify(readdirSync(path, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => [entry.name, entry.isDirectory() ? tree(join(path, entry.name)) : hash(readFileSync(join(path, entry.name)))]));
}
const browser = join(consumer, "node_modules/@breditor/browser/dist");
const wasm = join(consumer, "node_modules/@breditor/wasm/dist");
for (const [name, path] of [["browser", browser], ["wasm", wasm]] as const) {
  if (realpathSync(path) !== path) throw new Error("Candidate packages must not be symlinks.");
  if (tree(path) !== tree(join(staging, name, "dist"))) throw new Error(`Installed ${name} differs from qualified staging.`);
  if (hash(readFileSync(record[`${name}Package`].path)) !== record.tarballSha256[name]) throw new Error(`Qualified ${name} archive changed.`);
}

export default mergeConfig(base, {
  cacheDir: resolve(staging, "browser-harness-vite-cache"),
  // The harness's internal probes must share private ownership maps with the
  // public entry points. Prebundling only those entry points creates two copies.
  optimizeDeps: {exclude: ["@breditor/browser", "@breditor/browser/advanced", "@breditor/wasm"]},
  resolve: {alias: [
    {find: /^@breditor\/browser$/, replacement: join(browser, "index.js")},
    {find: /^@breditor\/browser\/advanced$/, replacement: join(browser, "advanced.js")},
    {find: /^@breditor\/wasm$/, replacement: join(wasm, "breditor_wasm.js")},
    // Diagnostic harness probes also import internal modules. Keep their
    // module identity consistent with the public candidate entry points.
    {find: /^(?:\.\.\/)+packages\/breditor-browser\/dist\//, replacement: `${browser}/`},
  ]},
  server: {fs: {allow: [repository, consumer]}},
});
