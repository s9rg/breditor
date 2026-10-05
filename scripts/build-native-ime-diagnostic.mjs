// Build an isolated diagnostic variant using the already-qualified Wasm.
// Invocation: BREDITOR_FLAT_LIST_BINDINGS=target/<candidate> node scripts/build-native-ime-diagnostic.mjs [--minify]
import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve, basename} from "node:path";
import {build, loadConfigFromFile} from "vite";
import {instrumentCompositionModule} from "./composition-failure-diagnostics.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--minify"), "only --minify is supported");
const minify = process.argv[2] === "--minify";
const loaded = await loadConfigFromFile({command: "build", mode: "qualification"}, resolve(repository, "vite.lists.config.ts"));
assert.ok(loaded, "missing list fixture configuration");
const base = loaded.config;
const output = await mkdtemp(resolve(repository, "target/native-ime-diagnostic-"));
const runtime = resolve(repository, "scripts/fixtures/native-ime-diagnostics/runtime.ts");
const transformed = new Set();
const expected = ["composition_controller.ts", "wasm_command_adapter.ts", "command_queue.ts"];
await build({...base, configFile: false, plugins: [...base.plugins, {name: "isolated-ime-diagnostics", enforce: "pre", transform(code, id) {
  const name = basename(id);
  if (id.startsWith(resolve(repository, "packages/breditor-browser/src/") + "/") && expected.includes(name)) {
    assert.ok(!transformed.has(name), "duplicate diagnostic transform"); transformed.add(name);
    return `import {recordImeDiagnostic} from ${JSON.stringify(runtime)};\n` + instrumentCompositionModule(code, name);
  }
}}], build: {...base.build, outDir: output, emptyOutDir: false, minify, sourcemap: false}});
assert.deepEqual([...transformed].sort(), expected.sort());
console.log(JSON.stringify({output, minify, diagnostic: true, publishable: false}));
