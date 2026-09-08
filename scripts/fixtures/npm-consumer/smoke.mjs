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
initSync({ module: readFileSync(fileURLToPath(wasmUrl)) });
assert.equal(breditorWasmAbiVersion(), "3");
assert.equal(breditorVersion(), "0.2.0");

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
