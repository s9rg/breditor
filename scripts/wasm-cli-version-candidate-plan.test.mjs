import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

test("the public Wasm producer accepts the exact Rolldown version with its CI log prefix",()=>{
 const fixture=mkdtempSync(join(tmpdir(),"breditor-wasm-cli-"));
 try{
  const rolldown=join(fixture,"rolldown"),bindgen=join(fixture,"wasm-bindgen");
  const build=fileURLToPath(new URL("./build-wasm-package.sh",import.meta.url));
  writeFileSync(bindgen,"#!/bin/sh\nprintf '%s\\n' 'wasm-bindgen 0.0.0'\n",{mode:0o700});
  const cases=[
   ["rolldown v1.2.7",true],
   ["[log] rolldown v1.2.7",true],
   ["rolldown v1.2.8",false],
   ["[log] rolldown v1.2.8",false],
   ["[log] [log] rolldown v1.2.7",false],
  ];
  for(const [line,accepted] of cases){
   writeFileSync(rolldown,`#!/bin/sh\nprintf '%s\\n' '${line}'\n`,{mode:0o700});
   const result=spawnSync("bash",[build],{encoding:"utf8",env:{
    ...process.env,CI:"true",CARGO_BIN:process.execPath,CARGO_HOME:join(fixture,"registry"),
    CARGO_TARGET_DIR:join(fixture,"target"),WASM_BINDGEN_BIN:bindgen,ROLLDOWN_BIN:rolldown,
   }});
   assert.equal(result.status,1,line);
   assert.match(result.stderr,accepted?/expected wasm-bindgen 0\.2\.127/:/expected rolldown v1\.2\.7/,line);
  }
 }finally{rmSync(fixture,{recursive:true,force:true});}
});
