import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const wasmUrl = import.meta.resolve("@breditor/wasm/wasm");
initSync({ module: readFileSync(fileURLToPath(wasmUrl)) });
assert.equal(breditorWasmAbiVersion(), "1");
assert.equal(breditorVersion(), "0.0.58");
