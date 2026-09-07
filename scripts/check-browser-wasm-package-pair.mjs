import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);
const browserDirectory = join(repositoryRoot, "packages", "breditor-browser");
const wasmDirectory = join(repositoryRoot, "packages", "breditor-wasm");

const [browserPackage, wasmPackage, bootstrapSource] = await Promise.all([
  readJson(join(browserDirectory, "package.json")),
  readJson(join(wasmDirectory, "package.json")),
  readFile(join(browserDirectory, "src", "wasm_engine_bootstrap.ts"), "utf8"),
]);

assert.equal(
  browserPackage.version,
  wasmPackage.version,
  "@breditor/browser and @breditor/wasm must have the same exact version",
);
assert.equal(
  browserPackage.peerDependencies?.["@breditor/wasm"],
  wasmPackage.version,
  "@breditor/browser must require the exact paired @breditor/wasm version",
);

const literal = bootstrapSource.match(
  /export const BREDITOR_BROWSER_PACKAGE_VERSION = "([^"]+)" as const;/u,
);
assert.ok(literal, "browser runtime package-version literal was not found");
assert.equal(
  literal[1],
  browserPackage.version,
  "browser runtime compatibility probe must equal its package version",
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
