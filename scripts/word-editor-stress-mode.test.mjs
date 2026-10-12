import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";
const repository=fileURLToPath(new URL("../",import.meta.url));
test("word editor stress rejects unknown flags and conflicting instrumentation before artifact admission",()=>{
  for(const [overrides,message] of [
    [{BREDITOR_PERF_WORD_CANDIDATE:"2"},"AssertionError"],
    [{BREDITOR_PERF_WORD_CANDIDATE:"1",BREDITOR_PERF_BROWSER:"webkit",BREDITOR_PERF_QUEUE_DIAGNOSTICS:"1"},"word candidate cannot combine"],
    [{BREDITOR_PERF_WORD_CANDIDATE:"1",BREDITOR_PERF_BROWSER:"chromium",BREDITOR_PERF_CPU_PROFILE:"1"},"word candidate cannot combine"],
  ]){
    const result=spawnSync(process.execPath,["scripts/measure-nested-list-performance.mjs","target/not-admitted/qualification.json"],{cwd:repository,encoding:"utf8",env:{...process.env,...overrides}});
    assert.notEqual(result.status,0);assert.ok(result.stderr.includes(message),result.stderr);assert.ok(!result.stderr.includes("ENOENT"),"must reject before reading the missing artifact");
  }
});
