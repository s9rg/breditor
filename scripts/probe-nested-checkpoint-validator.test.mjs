import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import test from "node:test";

for(const flag of ["--skip-validation","--publish"]) {
  test(`validator-only probe rejects ${flag} before creating a report`,()=>{
    const result=spawnSync(process.execPath,[fileURLToPath(new URL("./probe-nested-checkpoint-validator.mjs",import.meta.url)),flag],{encoding:"utf8"});
    assert.equal(result.status,1);
    assert.match(result.stderr,/usage: node scripts\/probe-nested-checkpoint-validator\.mjs/u);
    assert.equal(result.stdout.includes('"record"'),false);
  });
}
