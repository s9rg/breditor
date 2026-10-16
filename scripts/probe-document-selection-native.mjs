/** Actual local Wasm boundary and original-runtime compatibility; not DOM/SDK/shared integration. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {coverageSeed} from "./fixtures/editor-consumer/coverage-seed.mjs";
async function runtime(path){const bytes=readFileSync(resolve(path,"breditor_wasm_bg.wasm")),m=await import(pathToFileURL(resolve(path,"breditor_wasm.js")));await m.default({module_or_path:bytes});return {m,sha256:createHash("sha256").update(bytes).digest("hex")};}
function read(r){try{const value=r.takeValue();assert.equal(typeof value,"string","Native read failed");return value;}finally{r.free();}}
function refuses(r){try{assert.equal(r.takeValue(),undefined);}finally{r.free();}}
function refusesFactory(r){try{assert.equal(r.takeEditor(),undefined);}finally{r.free();}}
function profile(m){const r=m.BreditorRichProfile.fromStandardLayoutBootstrapJsonV3(JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/document-native-probe",version:1},extensions:[]}));try{const p=r.takeProfile();assert.ok(p);return p;}finally{r.free();}}
function create(p,source){const r=p.createEditor(source,"100");try{const a=r.takeEditor();assert.ok(a);return a;}finally{r.free();}}
function restore(p,bytes,natural){const r=natural?p.restoreDocumentTypingEditor(bytes):p.restoreDocumentEditor(bytes);try{const a=r.takeEditor();assert.ok(a);return a;}finally{r.free();}}
function mutation(a,method,arg,expected){const observation=a.observe();let r,next;try{r=arg===undefined?a[method](observation):a[method](observation,arg);assert.equal(r.status,expected);next=r.takeObservation();if(expected!=="error")assert.ok(next);else assert.equal(next,undefined);}finally{next?.free();r?.free();observation.free();}}
function run(a,command,expected){mutation(a,"execute",JSON.stringify(command),expected);}
function view(a){const o=a.observe();try{return JSON.parse(read(o.documentViewJson()));}finally{o.free();}}
function enableNatural(a){const o=a.observe();try{assert.equal(read(a.enableTypingHistory(o)),"true");}finally{o.free();}}

export async function probeDocumentSelectionNative(directory,previousDirectory){
 const current=await runtime(directory),previous=await runtime(previousDirectory),p=profile(current.m),old=profile(previous.m);
 let trials=0,restores=0,future=0,originalBytes=0,oldFamilyRefusals=0;
 try{
  const seed=coverageSeed(JSON.parse(read(p.descriptorJson())));
  for(const natural of [false,true])for(const hidden of [false,true])for(const text of ["","Q🙂"]){
   const source=JSON.parse(seed);if(hidden)source.root.children=source.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");
   let a,b;
   try{
    a=create(p,JSON.stringify(source));assert.equal(a.documentSelectionVersion(),"1");assert.equal(p.documentSelectionVersion(),"1");if(natural)enableNatural(a);
    mutation(a,"selectDocument",undefined,"selection");assert.deepEqual(view(a).selection,{kind:"document"});assert.equal(view(a).undoDepth,0);
    const before=view(a).documentJson,o=a.observe();try{const transfer=JSON.parse(read(o.generalClipboardJson()));assert.equal(transfer.kind,"flow");}finally{o.free();}
    mutation(a,"replaceDocumentPlainText",JSON.stringify({paragraph:"replacement",text}),"content");assert.equal(view(a).undoDepth,1);refuses(a.checkpointJson());oldFamilyRefusals++;
    const bytes=read(a.documentCheckpointJson());refusesFactory(old.restoreEditor(bytes));
    b=restore(p,bytes,natural);assert.equal(read(b.documentCheckpointJson()),bytes);restores++;
    for(const command of ["undo","redo","undo","redo"]){run(a,{kind:command},command);run(b,{kind:command},command);assert.equal(read(a.documentCheckpointJson()),read(b.documentCheckpointJson()));future++;if(command==="undo"){assert.deepEqual(view(a).selection,{kind:"document"});assert.equal(view(a).documentJson,before);}}
    trials++;
   }finally{a?.free();b?.free();}
  }
  // New scope is explicit. When unused, actual previous runtime checkpoint bytes must stay exact.
  for(const natural of [false,true]){
   const a=create(p,seed),b=create(old,seed);
   try{
    if(natural){enableNatural(a);enableNatural(b);}
    for(const [command,status]of [[{kind:"setSelection",selection:{kind:"text",anchor:{block:"q1",offset:"1",affinity:"after"},focus:{block:"q1",offset:"1",affinity:"after"}}},"selection"],[{kind:"insertPlainText",text:"X🙂"},"content"],[{kind:"undo"},"undo"],[{kind:"redo"},"redo"],[{kind:"setSelection",selection:{kind:"node",block:"image"}},"selection"],[{kind:"setSelection",selection:{kind:"grid",anchor:{table:"t",row:"r1",column:"c1"},focus:{table:"t",row:"r1",column:"c1"}}},"selection"]]){run(a,command,status);run(b,command,status);assert.equal(read(a.checkpointJson()),read(b.checkpointJson()));originalBytes++;}
   }finally{a.free();b.free();}
  }
 }finally{p.free();old.free();}
 assert.equal(trials,8);assert.equal(restores,8);assert.equal(future,32);assert.equal(originalBytes,12);assert.equal(oldFamilyRefusals,8);
 return {format:"breditor/document-selection-native-probe",formatVersion:1,currentLocalWasmSha256:current.sha256,previousLocalWasmSha256:previous.sha256,trials,exactDocumentFamilyRestores:restores,exactFutureCheckpoints:future,byteIdenticalOriginalCheckpoints:originalBytes,originalFamilyRefusals:oldFamilyRefusals,passed:true,scope:"Direct real Wasm native document selection, semantic Copy, plain deletion/replacement, hidden-only documents and exact explicit/natural history. Byte comparisons with previous actual runtime cover original text/node/grid selection histories. Shared lowering, SDK/storage/controller/React routing and whole-document rich paste remain required; no release acceptance inferred."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected current and preserved previous local release Wasm directories");console.log(JSON.stringify(await probeDocumentSelectionNative(...args),null,2));}
