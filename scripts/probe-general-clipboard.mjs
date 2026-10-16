/** Real release Wasm/native facade functionality. No browser or OS clipboard qualification implied. */
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
export async function probeGeneralClipboard(localDirectory,sharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared"),schema={name:"example/general-clipboard-probe",version:1},configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]});
 const localProfile=compileStandardLayoutRichProfileV3(local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]})),sharedProfile=shared.module.SharedRichProfile.from_standard_configuration_json_v3(configuration),source=coverageSeed(localProfile.descriptor());
 const donor=localProfile.createEditor(source),canonicalSource=donor.documentJson();let inline,flow,partialTable;
 try{
  assert.equal(donor.supportsGeneralCopy(),true);assert.equal(donor.supportsGeneralInlinePaste(),true);assert.equal(donor.supportsGeneralFlowPaste(),true);
  donor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"breditor/strong",properties:{}}])},targets:[{block:"q1",start:"1",end:"3"}]}});
  donor.execute({kind:"setSelection",selection:range("q1",1,"q1",3)});inline=donor.generalClipboard().structuredJson;
  assert.match(inline,/breditor\/strong/);
  donor.execute({kind:"setSelection",selection:{kind:"node",block:"image"}});flow=donor.generalClipboard().structuredJson;
  donor.execute({kind:"setSelection",selection:range("p-0-0",1,"p-1-1",3)});partialTable=donor.generalClipboard();assert.doesNotMatch(partialTable.structuredJson,/Diagram|asset-generation/);
  const table=JSON.parse(partialTable.structuredJson).document.root.children[0];assert.equal(table.children.length,3);assert.ok(table.children.every(r=>r.children.length===4));assert.equal(table.children[2].children[1].children[0].children.length,0);
 }finally{donor.dispose();}
 let trials=0,documents=0,restores=0,future=0,originalRefusals=0;
 try{for(const natural of [false,true])for(const backward of [false,true])for(const crossCells of [false,true])for(const kind of ["text","flow"]){
  let a,b,ar,br;
  try{
   a=new SharedRichEditor(sharedProfile.create(canonicalSource,"101"));b=localProfile.createEditor(canonicalSource);a.enableGeneralRanges();if(natural){a.enableTypingHistory();b.enableTypingHistory();}
   const actual=range("q2",1,"q2",1),pending=[{type:"breditor-inline/italic",properties:{}}];a.select(actual);b.execute({kind:"setSelection",selection:actual});a.setPendingFormats(pending);b.execute({kind:"setPendingFormats",formats:pending});
   const target=crossCells?range("p-0-0",1,"p-1-1",3):range("z-intro",1,"code",1);if(backward)[target.anchor,target.focus]=[target.focus,target.anchor];
   const prefix=`clipboard-${trials}`,right=`clipboard-right-${trials}`,clipboardJson=kind==="text"?inline:flow;
   if(kind==="text"){a.pasteGeneralInlineClipboard(target,clipboardJson,prefix,a.view().revision);b.execute({kind:"pasteGeneralInlineClipboard",data:{selection:target,clipboardJson,prefix}});}
   else {a.pasteGeneralFlowClipboard(target,clipboardJson,right,prefix,a.view().revision);b.execute({kind:"pasteGeneralFlowClipboard",data:{selection:target,clipboardJson,prefix,right,allocation:{prefix,replica:"101",counter:"1",lamport:"1"}}});}
   assert.equal(a.documentJson(),b.documentJson());documents++;assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);
   const savedA=a.checkpointJson(),savedB=b.checkpointJson();ar=new SharedRichEditor(restoreSharedGeneralEditor(sharedProfile,"room",savedA,natural?"typing-v1":"explicit"));br=natural?localProfile.restoreTypingEditor(savedB):localProfile.restoreEditor(savedB);assert.equal(ar.checkpointJson(),savedA);assert.equal(br.checkpointJson(),savedB);restores+=2;
   assert.throws(()=>sharedProfile.restore("room",savedA));originalRefusals++;
   for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();b.execute({kind:command});br.execute({kind:command});assert.equal(a.documentJson(),b.documentJson());documents++;assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());future+=2;if(command==="undo"){assert.equal(a.documentJson(),canonicalSource);assert.deepEqual(a.view().selection,actual);assert.deepEqual(b.view().selection,actual);assert.deepEqual(JSON.parse(a.view().pendingFormatsJson),pending);assert.deepEqual(JSON.parse(b.view().pendingFormatsJson),pending);}}
   trials++;
  }finally{ar?.dispose();br?.dispose();a?.dispose();b?.dispose();}
 }
 }finally{localProfile.dispose();sharedProfile.free();}
 assert.equal(trials,16);assert.equal(documents,80);assert.equal(restores,32);assert.equal(future,128);
 return {format:"breditor/general-clipboard-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,trials,exactLocalSharedDocuments:documents,exactRestores:restores,exactFutureCheckpoints:future,originalFamilyRefusals:originalRefusals,partialTableShapeAndNoOutsideContent:true,passed:true,scope:"Native rich Copy, inline/flow paste and exact local/shared explicit/natural history using actual paired release Wasm; not installed/browser/OS clipboard, caption/code flow-paste or full release acceptance."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected candidate local/shared release Wasm directories");console.log(JSON.stringify(await probeGeneralClipboard(...args),null,2));}
