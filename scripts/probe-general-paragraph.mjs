/** Actual release-Wasm paragraph Enter and exact histories; broad browser qualification is separate. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedGeneralEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed,range} from "./fixtures/editor-consumer/coverage-seed.mjs";
async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
export async function probeGeneralParagraph(localDirectory,sharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared"),schema={name:"example/general-paragraph-probe",version:1};
 const lp=compileStandardLayoutRichProfileV3(local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]})),sp=shared.module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));
 let trials=0,documents=0,restores=0,future=0;
 try{for(const natural of [false,true])for(const backward of [false,true])for(const [first,last,item]of [["p-0-0","p-1-1",false],["z-intro","code",false],["nested-text","task-head",true],["task-head","code",true]]){
  let a,b,ar,br;
  try{
   b=lp.createEditor(coverageSeed(lp.descriptor()));const source=b.documentJson();a=new SharedRichEditor(sp.create(source,"101"));assert.equal(b.supportsGeneralParagraph(),true);assert.equal(a.supportsGeneralParagraph(),true);a.enableGeneralRanges();if(natural){a.enableTypingHistory();b.enableTypingHistory();}
   const actual=range("q2",1,"q2",1),pending=[{type:"breditor-inline/italic",properties:{}}];a.select(actual);b.execute({kind:"setSelection",selection:actual});a.setPendingFormats(pending);b.execute({kind:"setPendingFormats",formats:pending});
   const target=range(first,1,last,1);if(backward)[target.anchor,target.focus]=[target.focus,target.anchor];const prefix=`enter-${trials}`;
   a.insertGeneralParagraph(target,prefix,a.view().revision);b.execute({kind:"insertGeneralParagraph",data:{selection:target,prefix}});assert.equal(a.documentJson(),b.documentJson());documents++;assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);assert.equal(a.documentJson().includes(`${prefix}:item`),item);assert.deepEqual(a.view().selection,range(`${prefix}:paragraph`,0));
   const ca=a.checkpointJson(),cb=b.checkpointJson();ar=new SharedRichEditor(restoreSharedGeneralEditor(sp,"room",ca,natural?"typing-v1":"explicit"));br=natural?lp.restoreTypingEditor(cb):lp.restoreEditor(cb);assert.equal(ar.checkpointJson(),ca);assert.equal(br.checkpointJson(),cb);restores+=2;
   for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();b.execute({kind:command});br.execute({kind:command});assert.equal(a.documentJson(),b.documentJson());documents++;assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());future+=2;if(command==="undo"){assert.equal(a.documentJson(),source);assert.deepEqual(a.view().selection,actual);assert.deepEqual(b.view().selection,actual);assert.deepEqual(JSON.parse(a.view().pendingFormatsJson),pending);assert.deepEqual(JSON.parse(b.view().pendingFormatsJson),pending);}}
   trials++;
  }finally{ar?.dispose();br?.dispose();a?.dispose();b?.dispose();}
 }}finally{lp.dispose();sp.free();}
 assert.equal(trials,16);assert.equal(documents,80);assert.equal(restores,32);assert.equal(future,128);
 return {format:"breditor/general-paragraph-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,trials,exactLocalSharedDocuments:documents,exactRestores:restores,exactFutureCheckpoints:future,passed:true,scope:"Atomic prose/cell/list/task Enter across general ranges in both directions and explicit/natural histories; actual before-caret/pending styles restored. No browser, physical input, whole-document or release acceptance inferred."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected local/shared release Wasm directories");console.log(JSON.stringify(await probeGeneralParagraph(...args),null,2));}
