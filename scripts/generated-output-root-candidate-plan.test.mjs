import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

test("generated package qualification refuses a redirected output root before compiling",()=>{
 const fixture=mkdtempSync(join(tmpdir(),"breditor-generated-output-root-"));
 try{
  const output=join(fixture,"packages/breditor-browser"),actual=join(fixture,"redirected");
  const args=join(fixture,"scripts/check-generated-package-output.mjs");
  for(const path of [output,actual,join(fixture,"scripts")])mkdirSync(path,{recursive:true});
  copyFileSync(new URL("./check-generated-package-output.mjs",import.meta.url),args);
  symlinkSync(actual,join(output,"dist"),"junction");
  const result=spawnSync(process.execPath,[args],{encoding:"utf8"});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Generated package output root cannot traverse a link/);
 }finally{rmSync(fixture,{recursive:true,force:true});}
});
