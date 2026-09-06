import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import initialize, {
  breditorVersion,
  breditorWasmAbiVersion,
  initSync,
} from "@breditor/wasm";
import { openBreditorBrowserEditor } from "@breditor/browser";
import { astPathsEqual } from "@breditor/browser/advanced";

assert.equal(typeof initialize, "function");
assert.equal(typeof openBreditorBrowserEditor, "function");
assert.equal(astPathsEqual([0, 1], [0, 1]), true);

const consumerDirectory = dirname(fileURLToPath(import.meta.url));
const consumerModulesPrefix = `${realpathSync(join(consumerDirectory, "node_modules"))}${sep}`;
const browserEntry = resolvedConsumerModule("@breditor/browser");
resolvedConsumerModule("@breditor/wasm");
resolvedConsumerModule("@breditor/wasm/wasm");
const browserRequire = createRequire(browserEntry);
assertInsideConsumer(realpathSync(browserRequire.resolve("parse5")), "parse5");

const wasmUrl = import.meta.resolve("@breditor/wasm/wasm");
initSync({ module: readFileSync(fileURLToPath(wasmUrl)) });
assert.equal(breditorWasmAbiVersion(), "2");
assert.equal(breditorVersion(), "0.0.59");

function resolvedConsumerModule(specifier) {
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(specifier)));
  assertInsideConsumer(resolved, specifier);
  return resolved;
}

function assertInsideConsumer(resolved, specifier) {
  assert.ok(
    resolved.startsWith(consumerModulesPrefix),
    `${specifier} resolved outside the isolated consumer: ${resolved}`,
  );
}
