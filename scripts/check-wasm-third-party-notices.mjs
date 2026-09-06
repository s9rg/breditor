import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = join(
  repositoryRoot,
  "packages",
  "breditor-wasm",
  "THIRD_PARTY_NOTICES.md",
);
const vendoredNoticeRoot = join(
  repositoryRoot,
  "packages",
  "breditor-wasm",
  "third-party",
);
const manifestPath = join(repositoryRoot, "Cargo.toml");
const target = "wasm32-unknown-unknown";
const registrySource = "registry+https://github.com/rust-lang/crates.io-index";

const expectedPackages = Object.freeze([
  ["bumpalo", "3.20.3", "MIT OR Apache-2.0"],
  ["cfg-if", "1.0.4", "MIT OR Apache-2.0"],
  ["itoa", "1.0.18", "MIT OR Apache-2.0"],
  ["memchr", "2.8.3", "Unlicense OR MIT"],
  ["once_cell", "1.21.4", "MIT OR Apache-2.0"],
  ["proc-macro2", "1.0.107", "MIT OR Apache-2.0"],
  ["quote", "1.0.47", "MIT OR Apache-2.0"],
  ["rustversion", "1.0.23", "MIT OR Apache-2.0"],
  ["serde", "1.0.229", "MIT OR Apache-2.0"],
  ["serde_core", "1.0.229", "MIT OR Apache-2.0"],
  ["serde_derive", "1.0.229", "MIT OR Apache-2.0"],
  ["serde_json", "1.0.151", "MIT OR Apache-2.0"],
  ["syn", "2.0.119", "MIT OR Apache-2.0"],
  ["syn", "3.0.4", "MIT OR Apache-2.0"],
  ["thiserror", "2.0.20", "MIT OR Apache-2.0"],
  ["thiserror-impl", "2.0.20", "MIT OR Apache-2.0"],
  ["unicode-ident", "1.0.24", "(MIT OR Apache-2.0) AND Unicode-3.0"],
  ["unicode-segmentation", "1.13.3", "MIT OR Apache-2.0"],
  ["wasm-bindgen", "0.2.127", "MIT OR Apache-2.0"],
  ["wasm-bindgen-macro", "0.2.127", "MIT OR Apache-2.0"],
  ["wasm-bindgen-macro-support", "0.2.127", "MIT OR Apache-2.0"],
  ["wasm-bindgen-shared", "0.2.127", "MIT OR Apache-2.0"],
  ["zmij", "1.0.23", "MIT"],
]);

const expectedEdges = Object.freeze([
  "breditor-core@workspace -> serde@1.0.229 [normal]",
  "breditor-core@workspace -> serde_json@1.0.151 [normal]",
  "breditor-core@workspace -> thiserror@2.0.20 [normal]",
  "breditor-core@workspace -> unicode-segmentation@1.13.3 [normal]",
  "breditor-wasm@workspace -> breditor-core@workspace [normal]",
  "breditor-wasm@workspace -> serde_json@1.0.151 [normal]",
  "breditor-wasm@workspace -> wasm-bindgen@0.2.127 [normal]",
  "proc-macro2@1.0.107 -> unicode-ident@1.0.24 [normal]",
  "quote@1.0.47 -> proc-macro2@1.0.107 [normal]",
  "serde@1.0.229 -> serde_core@1.0.229 [normal]",
  "serde@1.0.229 -> serde_derive@1.0.229 [normal]",
  "serde_derive@1.0.229 -> proc-macro2@1.0.107 [normal]",
  "serde_derive@1.0.229 -> quote@1.0.47 [normal]",
  "serde_derive@1.0.229 -> syn@3.0.4 [normal]",
  "serde_json@1.0.151 -> itoa@1.0.18 [normal]",
  "serde_json@1.0.151 -> memchr@2.8.3 [normal]",
  "serde_json@1.0.151 -> serde_core@1.0.229 [normal]",
  "serde_json@1.0.151 -> zmij@1.0.23 [normal]",
  "syn@2.0.119 -> proc-macro2@1.0.107 [normal]",
  "syn@2.0.119 -> quote@1.0.47 [normal]",
  "syn@2.0.119 -> unicode-ident@1.0.24 [normal]",
  "syn@3.0.4 -> proc-macro2@1.0.107 [normal]",
  "syn@3.0.4 -> quote@1.0.47 [normal]",
  "syn@3.0.4 -> unicode-ident@1.0.24 [normal]",
  "thiserror-impl@2.0.20 -> proc-macro2@1.0.107 [normal]",
  "thiserror-impl@2.0.20 -> quote@1.0.47 [normal]",
  "thiserror-impl@2.0.20 -> syn@3.0.4 [normal]",
  "thiserror@2.0.20 -> thiserror-impl@2.0.20 [normal]",
  "wasm-bindgen-macro-support@0.2.127 -> bumpalo@3.20.3 [normal]",
  "wasm-bindgen-macro-support@0.2.127 -> proc-macro2@1.0.107 [normal]",
  "wasm-bindgen-macro-support@0.2.127 -> quote@1.0.47 [normal]",
  "wasm-bindgen-macro-support@0.2.127 -> syn@2.0.119 [normal]",
  "wasm-bindgen-macro-support@0.2.127 -> wasm-bindgen-shared@0.2.127 [normal]",
  "wasm-bindgen-macro@0.2.127 -> quote@1.0.47 [normal]",
  "wasm-bindgen-macro@0.2.127 -> wasm-bindgen-macro-support@0.2.127 [normal]",
  "wasm-bindgen-shared@0.2.127 -> unicode-ident@1.0.24 [normal]",
  "wasm-bindgen@0.2.127 -> cfg-if@1.0.4 [normal]",
  "wasm-bindgen@0.2.127 -> once_cell@1.21.4 [normal]",
  "wasm-bindgen@0.2.127 -> rustversion@1.0.23 [build]",
  "wasm-bindgen@0.2.127 -> wasm-bindgen-macro@0.2.127 [normal]",
  "wasm-bindgen@0.2.127 -> wasm-bindgen-shared@0.2.127 [normal]",
]);

const requiredNotices = Object.freeze([
  Object.freeze({
    package: "memchr",
    version: "2.8.3",
    sourceName: "UNLICENSE",
    packagePath: "memchr-2.8.3/UNLICENSE",
    sha256: "7e12e5df4bae12cb21581ba157ced20e1986a0508dd10d0e8a4ab9a4cf94e85c",
  }),
  Object.freeze({
    package: "unicode-ident",
    version: "1.0.24",
    sourceName: "LICENSE-APACHE",
    packagePath: "unicode-ident-1.0.24/LICENSE-APACHE",
    sha256: "62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a",
  }),
  Object.freeze({
    package: "unicode-ident",
    version: "1.0.24",
    sourceName: "LICENSE-UNICODE",
    packagePath: "unicode-ident-1.0.24/LICENSE-UNICODE",
    sha256: "f7db81051789b729fea528a63ec4c938fdcb93d9d61d97dc8cc2e9df6d47f2a1",
  }),
  Object.freeze({
    package: "zmij",
    version: "1.0.23",
    sourceName: "LICENSE-MIT",
    packagePath: "zmij-1.0.23/LICENSE-MIT",
    sha256: "23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3",
  }),
  Object.freeze({
    package: "unicode-segmentation",
    version: "1.13.3",
    sourceName: "COPYRIGHT",
    packagePath: "unicode-segmentation-1.13.3/COPYRIGHT",
    sha256: "23860c2a7b5d96b21569afedf033469bab9fe14a1b24a35068b8641c578ce24d",
  }),
]);

const rustRelease = "1.98.0";
const rustNoticeName = "COPYRIGHT-library.html";
const rustNoticeSha256 =
  "68129500b616d5838629e68f55ff3aed5e096dacf60ce9eb41bbe599a563afa6";

const copyFlag = "--copy-rust-notice";
let rustNoticeDestination;
if (process.argv.length === 4 && process.argv[2] === copyFlag) {
  rustNoticeDestination = resolve(process.argv[3]);
} else if (process.argv.length !== 2) {
  throw new Error(
    `usage: check-wasm-third-party-notices.mjs [${copyFlag} <destination>]`,
  );
}

const cargoMetadata = runJson(process.env.CARGO_BIN ?? "cargo", [
  "metadata",
  "--format-version",
  "1",
  "--locked",
  "--filter-platform",
  target,
  "--manifest-path",
  manifestPath,
]);
const packagesById = new Map(
  cargoMetadata.packages.map((entry) => [entry.id, entry]),
);
const nodesById = new Map(
  cargoMetadata.resolve.nodes.map((entry) => [entry.id, entry]),
);
const root = cargoMetadata.packages.find(
  (entry) => entry.name === "breditor-wasm" && entry.source === null,
);
assert(root !== undefined, "cargo metadata did not contain breditor-wasm");

const reachable = new Set();
const edges = [];
const pending = [root.id];
while (pending.length > 0) {
  const id = pending.pop();
  if (reachable.has(id)) continue;
  reachable.add(id);

  const node = nodesById.get(id);
  assert(node !== undefined, `cargo metadata has no resolve node for ${id}`);
  for (const dependency of node.deps) {
    const includedKinds = dependency.dep_kinds.filter(
      ({ kind }) => kind === null || kind === "build",
    );
    if (includedKinds.length === 0) continue;

    for (const { kind, target: dependencyTarget } of includedKinds) {
      const targetSuffix =
        dependencyTarget === null ? "" : `, target=${dependencyTarget}`;
      edges.push(
        `${packageLabel(id)} -> ${packageLabel(dependency.pkg)} [${kind ?? "normal"}${targetSuffix}]`,
      );
    }
    pending.push(dependency.pkg);
  }
}

const actualPackages = [...reachable]
  .map((id) => packagesById.get(id))
  .filter((entry) => entry.source !== null)
  .map((entry) => [entry.name, entry.version, entry.license, entry.source])
  .sort(comparePackageRows);
const lockedPackages = expectedPackages
  .map(([name, version, license]) => [name, version, license, registrySource])
  .sort(comparePackageRows);
assert.deepEqual(
  actualPackages,
  lockedPackages,
  "the locked Wasm normal/build dependency inventory or Cargo license metadata drifted",
);
assert.deepEqual(
  [...edges].sort(),
  [...expectedEdges].sort(),
  "the locked Wasm normal/build dependency graph drifted",
);

const actualInventory = await readFile(inventoryPath, "utf8");
assert.equal(
  actualInventory,
  renderInventory(),
  "THIRD_PARTY_NOTICES.md is not the exact human-readable locked inventory",
);

const vendoredNoticeFiles = (await descendantFiles(vendoredNoticeRoot))
  .map((path) => relative(vendoredNoticeRoot, path))
  .sort();
const expectedNoticeFiles = requiredNotices
  .map(({ packagePath }) => packagePath)
  .sort();
assert.deepEqual(
  vendoredNoticeFiles,
  expectedNoticeFiles,
  "the vendored third-party notice file set differs from the reviewed allowlist",
);

for (const notice of requiredNotices) {
  const cargoPackage = [...reachable]
    .map((id) => packagesById.get(id))
    .find(
      (entry) =>
        entry.name === notice.package && entry.version === notice.version,
    );
  assert(
    cargoPackage !== undefined,
    `required notice owner ${notice.package}@${notice.version} is not reachable`,
  );
  const sourceNotice = await readFile(
    join(dirname(cargoPackage.manifest_path), notice.sourceName),
  );
  const vendoredNotice = await readFile(
    join(vendoredNoticeRoot, notice.packagePath),
  );
  assert.equal(
    sha256(sourceNotice),
    notice.sha256,
    `${notice.package}@${notice.version}/${notice.sourceName} changed upstream`,
  );
  assert.equal(
    sha256(vendoredNotice),
    notice.sha256,
    `vendored ${notice.packagePath} is not the reviewed exact notice`,
  );
  assert.deepEqual(
    vendoredNotice,
    sourceNotice,
    `vendored ${notice.packagePath} differs from the locked Cargo source`,
  );
}

const rustc = process.env.RUSTC_BIN ?? process.env.RUSTC ?? "rustc";
const rustVersion = run(rustc, ["--version", "--verbose"]);
const releaseLine = rustVersion
  .split("\n")
  .find((line) => line.startsWith("release: "));
assert.equal(
  releaseLine,
  `release: ${rustRelease}`,
  `the Rust standard-library notice is locked to Rust ${rustRelease}`,
);
const rustSysroot = run(rustc, ["--print", "sysroot"]).trim();
const rustNoticePath = join(
  rustSysroot,
  "share",
  "doc",
  "rust",
  rustNoticeName,
);
const rustNotice = await readFile(rustNoticePath);
assert.equal(
  sha256(rustNotice),
  rustNoticeSha256,
  `Rust ${rustRelease} ${rustNoticeName} differs from the reviewed official file`,
);

if (rustNoticeDestination !== undefined) {
  await mkdir(dirname(rustNoticeDestination), { recursive: true });
  await copyFile(rustNoticePath, rustNoticeDestination);
}

console.log(
  `check-wasm-third-party-notices: ${actualPackages.length} dependencies, ${edges.length} graph edges, ${requiredNotices.length} exact crate notices, and Rust ${rustRelease} passed`,
);

function packageLabel(id) {
  const entry = packagesById.get(id);
  assert(entry !== undefined, `cargo metadata has no package for ${id}`);
  return entry.source === null
    ? `${entry.name}@workspace`
    : `${entry.name}@${entry.version}`;
}

function comparePackageRows(left, right) {
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);
}

function renderInventory() {
  const packageLines = expectedPackages
    .map(
      ([name, version, license]) =>
        `- \`${name} ${version}\` — Cargo license expression: \`${license}\``,
    )
    .join("\n");
  const edgeLines = expectedEdges.map((edge) => `- \`${edge}\``).join("\n");
  return `# Third-party notices for \`@breditor/wasm\`

This is the reviewed production dependency inventory for the locked
\`breditor-wasm\` Cargo graph on \`${target}\`. It is generated from
\`cargo metadata --locked --filter-platform ${target}\` and includes every
reachable normal and build dependency. Development-only dependencies are not
part of the published Wasm module and are excluded. The release check compares
this file, the package set, every edge below, Cargo's license metadata, and the
required notice bytes before replacing \`dist\`.

The workspace crates \`breditor-wasm\` and \`breditor-core\` are first-party.
The locked third-party package inventory is:

${packageLines}

For dependencies offering MIT or Apache-2.0, this distribution selects
Apache-2.0 unless a selection is stated below; the package root contains the
Apache-2.0 text. The additional exact texts shipped in \`third-party/\` are:

- \`memchr 2.8.3\`: Unlicense, selected from \`Unlicense OR MIT\`
- \`unicode-ident 1.0.24\`: Apache-2.0 plus the mandatory Unicode-3.0 license
- \`unicode-segmentation 1.13.3\`: upstream \`COPYRIGHT\` notice
- \`zmij 1.0.23\`: upstream MIT license

The compiled module also contains code from the Rust standard library. The
official Rust ${rustRelease} \`${rustNoticeName}\` is copied from the pinned
toolchain into \`dist/third-party/rust-${rustRelease}/\` during every package
build and is byte-locked by the release check.

## Locked normal/build dependency edges

${edgeLines}
`;
}

function run(executable, arguments_) {
  const result = spawnSync(executable, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${arguments_.join(" ")} failed (${result.status}):\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function runJson(executable, arguments_) {
  return JSON.parse(run(executable, arguments_));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function descendantFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const descendants = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? descendantFiles(path) : [path];
    }),
  );
  return descendants.flat();
}
