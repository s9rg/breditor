import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

// Invalid configuration must stop before compilation or candidate creation.
for (const value of ["", "3", "invalid"]) {
  test(`rejects unsupported experimental optimization ${JSON.stringify(value)}`, () => {
    const result = spawnSync(process.execPath,
      [fileURLToPath(new URL("./build-experimental-nested-list.mjs", import.meta.url))],
      {env: {...process.env, BREDITOR_WASM_SIZE_OPT: value}, encoding: "utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BREDITOR_WASM_SIZE_OPT must be s or z/u);
    assert.doesNotMatch(result.stdout, /Experimental candidate:/u);
  });
}
