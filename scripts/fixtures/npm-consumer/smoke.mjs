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
import {
  DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
  DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS,
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  MAX_BROWSER_COMMAND_TEXT_UTF8,
  MAX_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
  MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS,
  MAX_TOOLBAR_CONTROLS,
  MAX_TOOLBAR_GROUP_UTF16,
  MAX_TOOLBAR_GROUP_UTF8,
  MAX_TOOLBAR_LABEL_UTF16,
  MAX_TOOLBAR_LABEL_UTF8,
  MAX_TOOLBAR_QUALIFIED_NAME_ASCII,
  MIN_TOOLBAR_CONTROLS,
  openBreditorBrowserEditor,
} from "@breditor/browser";
import { astPathsEqual } from "@breditor/browser/advanced";

assert.equal(typeof initialize, "function");
assert.equal(typeof openBreditorBrowserEditor, "function");
assert.equal(astPathsEqual([0, 1], [0, 1]), true);
assert.deepEqual(
  {
    autosaveDelay: DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
    autosaveMaximumLatency: DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS,
    autosaveMaximumDelay: MAX_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
    autosaveFlushWaiters: MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS,
    commandUtf16: MAX_BROWSER_COMMAND_TEXT_UTF16,
    commandUtf8: MAX_BROWSER_COMMAND_TEXT_UTF8,
    controlMinimum: MIN_TOOLBAR_CONTROLS,
    controlMaximum: MAX_TOOLBAR_CONTROLS,
    groupUtf16: MAX_TOOLBAR_GROUP_UTF16,
    groupUtf8: MAX_TOOLBAR_GROUP_UTF8,
    labelUtf16: MAX_TOOLBAR_LABEL_UTF16,
    labelUtf8: MAX_TOOLBAR_LABEL_UTF8,
    qualifiedNameAscii: MAX_TOOLBAR_QUALIFIED_NAME_ASCII,
  },
  {
    autosaveDelay: 250,
    autosaveMaximumLatency: 2_000,
    autosaveMaximumDelay: 60_000,
    autosaveFlushWaiters: 1_024,
    commandUtf16: 65_536,
    commandUtf8: 65_536,
    controlMinimum: 1,
    controlMaximum: 64,
    groupUtf16: 64,
    groupUtf8: 256,
    labelUtf16: 128,
    labelUtf8: 512,
    qualifiedNameAscii: 128,
  },
);

const consumerDirectory = dirname(fileURLToPath(import.meta.url));
const consumerModulesPrefix = `${realpathSync(join(consumerDirectory, "node_modules"))}${sep}`;
const browserEntry = resolvedConsumerModule("@breditor/browser");
resolvedConsumerModule("@breditor/wasm");
resolvedConsumerModule("@breditor/wasm/wasm");
const browserRequire = createRequire(browserEntry);
assertInsideConsumer(realpathSync(browserRequire.resolve("parse5")), "parse5");

const wasmUrl = import.meta.resolve("@breditor/wasm/wasm");
const wasmBytes = readFileSync(fileURLToPath(wasmUrl));
initSync({ module: wasmBytes });
assert.equal(breditorWasmAbiVersion(), "5");
assert.equal(breditorVersion(), "0.3.0-alpha.22");

const wasmModule = await WebAssembly.compile(wasmBytes);
await checkOverlappingInitializers(wasmModule, "async");
await checkOverlappingInitializers(wasmModule, "sync");

async function checkOverlappingInitializers(module, firstKind) {
  // A separate module evaluation starts with no runtime and shares the same
  // installed Wasm bytes. The promise controls completion without timing.
  const entry = new URL(import.meta.resolve("@breditor/wasm"));
  entry.searchParams.set("concurrent-initialization", firstKind);
  const {default: initialize, initSync: initializeSync, BreditorEngine} = await import(entry.href);
  const pending = Promise.withResolvers();
  const late = initialize({module_or_path: pending.promise});
  const first = firstKind === "sync"
    ? initializeSync({module})
    : await initialize({module_or_path: module});

  const documentJson = JSON.stringify({
    format: "breditor/document",
    formatVersion: 1,
    schema: {name: "breditor/base", version: 1},
    root: {
      kind: "element", type: "breditor/document", entityId: null, properties: {},
      children: [{
        kind: "element", type: "breditor/paragraph", entityId: null, properties: {},
        children: [{kind: "text", text: "Live runtime 🙂", formats: []}],
      }],
    },
  });
  const result = BreditorEngine.fromDocumentJson(`concurrent-${firstKind}`, documentJson, 10);
  const engine = result.takeEngine();
  result.free();
  assert.ok(engine, `${firstKind}: expected a live engine before the delayed initializer`);
  const before = readCheckpoint(engine);

  pending.resolve(module);
  assert.ok(await late === first, `${firstKind}: delayed initialization replaced the live Wasm runtime`);
  try {
    assert.equal(readCheckpoint(engine), before);
    assert.ok(initializeSync({module}) === first);
    assert.ok(await initialize({module_or_path: module}) === first);
  } finally {
    engine.free();
  }
}

function readCheckpoint(engine) {
  const result = engine.sessionCheckpointJson();
  try {
    assert.equal(result.status, "value");
    const checkpoint = result.takeValue();
    assert.equal(typeof checkpoint, "string");
    return checkpoint;
  } finally {
    result.free();
  }
}

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
