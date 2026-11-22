import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {gzipSync} from "node:zlib";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {candidateRuntimeSizeReport,measureCandidateRuntimeSize} from "./measure-candidate-runtime-size.mjs";

test("the two runtime pairs are measured independently, with no partial report",()=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-size-report-"));
 try{
  const files=[
   "packages/breditor-experimental-rich-content/dist/breditor_wasm.js",
   "packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm",
   "packages/breditor-collaboration/dist/runtime/breditor_shared.js",
   "packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm",
  ];
  const contents=Buffer.alloc(512,2);
  const wasm=Buffer.from("0061736d01000000","hex");
  for(const file of files.slice(0,-1)){
   mkdirSync(dirname(join(root,file)),{recursive:true});
   writeFileSync(join(root,file),file.endsWith(".wasm")?wasm:contents);
  }
  assert.throws(()=>measureCandidateRuntimeSize(root),{code:"ENOENT"});
  writeFileSync(join(root,files[3]),"");
  assert.throws(()=>measureCandidateRuntimeSize(root),/Empty runtime artifact/);
  writeFileSync(join(root,files[3]),contents);
  assert.throws(()=>measureCandidateRuntimeSize(root),/Invalid Wasm module header/);
  writeFileSync(join(root,files[3]),wasm);
  const result=measureCandidateRuntimeSize(root);
  assert.deepEqual(result.profiles.map(profile=>profile.profile),["local","shared"]);
  assert.deepEqual(result.profiles.flatMap(profile=>profile.files.map(file=>file.path)),files);
  for(const profile of result.profiles){
   assert.equal(profile.rawBytes,contents.length+wasm.length);
   assert.equal(profile.gzipBytes,gzipSync(contents,{level:9}).length+gzipSync(wasm,{level:9}).length);
   for(const file of profile.files)assert.match(file.sha256,/^[0-9a-f]{64}$/);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("both profiles record fresh size evidence only after both paired runtimes",()=>{
 for(const profile of ["functional","full"]){
  const {checks}=candidateReleasePlan({profile});
  const index=checks.findIndex(check=>check.id==="paired-runtime-download-size");
  for(const name of ["paired-local-runtime","paired-shared-runtime"])assert.ok(checks.slice(0,index).some(check=>check.id===name));
  assert.deepEqual(checks[index].artifacts,[{path:candidateRuntimeSizeReport,fresh:true,retain:true}]);
 }
});
