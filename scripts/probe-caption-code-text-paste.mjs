/** Actual paired release Wasm: explicit conversion before one guarded edit, exact future histories. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedGeneralEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed,range,grid} from "./fixtures/editor-consumer/coverage-seed.mjs";
async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:createHash("sha256").update(bytes).digest("hex")};}
export async function probeCaptionCodeTextPaste(localDirectory,sharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared"),schema={name:"example/text-paste-policy",version:1},lp=compileStandardLayoutRichProfileV3(local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]})),sp=shared.module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));
 let trials=0,documents=0,restores=0,future=0,pureReads=0,refusals=0;
 try{
  const donor=lp.createEditor(coverageSeed(lp.descriptor())),clips=[];
  try{
   donor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"breditor/strong",properties:{}}])},targets:[{block:"q1",start:"0",end:"2"}]}});
   for(const selection of [{kind:"node",block:"table"},{kind:"node",block:"image"},{kind:"node",block:"quote"},grid()]){donor.execute({kind:"setSelection",selection});const transfer=donor.generalClipboard();assert.ok(transfer);clips.push(transfer);}
  }finally{donor.dispose();}
  for(const natural of [false,true])for(const backward of [false,true])for(const caption of [false,true])for(const clipboard of clips){
   let a,b,ar,br;
   try{
    b=lp.createEditor(coverageSeed(lp.descriptor()));const source=b.documentJson();a=new SharedRichEditor(sp.create(source,"101"));a.enableGeneralRanges();if(natural){a.enableTypingHistory();b.enableTypingHistory();}assert.equal(a.supportsClipboardTextPolicy(),true);assert.equal(b.supportsClipboardTextPolicy(),true);
    const actual=range("q2",1),pending=[{type:"breditor-inline/italic",properties:{}}];a.select(actual);b.execute({kind:"setSelection",selection:actual});a.setPendingFormats(pending);b.execute({kind:"setPendingFormats",formats:pending});
    const target=caption?range("caption",1,"p-2-2",3):range("code",1,"code",3);if(backward)[target.anchor,target.focus]=[target.focus,target.anchor];
    const beforeA=a.checkpointJson(),beforeB=b.checkpointJson(),pa=a.projectClipboardText(target,clipboard.structuredJson,a.view().revision),pb=b.projectClipboardText(target,clipboard.structuredJson,b.view().revision);assert.deepEqual(pa,pb);assert.ok(pa);assert.equal(pa.text,clipboard.plainText);assert.equal(pa.target,caption?"caption":"code");assert.ok(pa.losses.includes("block-structure"));assert.equal(a.checkpointJson(),beforeA);assert.equal(b.checkpointJson(),beforeB);pureReads+=2;
    const prefix=`text-policy-${trials}`;a.replaceGeneralRangePlainText(target,pa.text,prefix,a.view().revision);b.execute({kind:"replaceGeneralRangePlainText",data:{selection:target,text:pb.text,prefix}});assert.equal(a.documentJson(),b.documentJson());assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);documents++;
    const ca=a.checkpointJson(),cb=b.checkpointJson();ar=new SharedRichEditor(restoreSharedGeneralEditor(sp,"room",ca,natural?"typing-v1":"explicit"));br=natural?lp.restoreTypingEditor(cb):lp.restoreEditor(cb);assert.equal(ar.checkpointJson(),ca);assert.equal(br.checkpointJson(),cb);restores+=2;
    for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();b.execute({kind:command});br.execute({kind:command});assert.equal(a.documentJson(),b.documentJson());assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());future+=2;documents++;if(command==="undo"){assert.equal(a.documentJson(),source);assert.deepEqual(a.view().selection,actual);assert.deepEqual(b.view().selection,actual);assert.deepEqual(JSON.parse(a.view().pendingFormatsJson),pending);assert.deepEqual(JSON.parse(b.view().pendingFormatsJson),pending);}}
    trials++;
   }finally{ar?.dispose();br?.dispose();a?.dispose();b?.dispose();}
  }
  const a=lp.createEditor(coverageSeed(lp.descriptor()));try{
   const rich=clips[0].structuredJson;assert.equal(a.projectClipboardText(range("q1",1),rich),null);a.setReadOnly(true);assert.equal(a.projectClipboardText(range("code",1),rich).target,"code");
   const before=a.checkpointJson();for(const raw of ["malformed",rich.replace('"formatVersion":1','"formatVersion":999')]){assert.throws(()=>a.projectClipboardText(range("code",1),raw));assert.equal(a.checkpointJson(),before);refusals++;}
   a.setReadOnly(false);a.execute({kind:"setSelection",selection:{kind:"node",block:"lead"}});const empty=a.generalClipboard().structuredJson;assert.throws(()=>a.projectClipboardText(range("code",1),empty));refusals++;
   const old=a.view().revision;a.setReadOnly(true);assert.throws(()=>a.projectClipboardText(range("code",1),rich,old));refusals++;
  }finally{a.dispose();}
 }finally{lp.dispose();sp.free();}
 assert.equal(trials,32);assert.equal(documents,160);assert.equal(restores,64);assert.equal(future,256);assert.equal(pureReads,64);assert.equal(refusals,4);
 return{format:"breditor/caption-code-text-paste-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,trials,exactLocalSharedDocuments:documents,exactRestores:restores,exactFutureCheckpoints:future,pureReads,guardedRefusals:refusals,passed:true,scope:"Actual native text/loss projection and atomic general replacement of table/grid/image/formatted quote clipboard into code or cross-cell captions, both directions and explicit/natural histories. No installed/native clipboard/browser/IME/accessibility/release qualification inferred."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected local/shared release Wasm directories");console.log(JSON.stringify(await probeCaptionCodeTextPaste(...args),null,2));}
