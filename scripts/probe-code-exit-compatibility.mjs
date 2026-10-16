/** Actual pre-feature/current Wasm: new code-exit histories retain the original codecs and future edits. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const root=canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-code-exit-root.json",import.meta.url),"utf8")));
const schema={name:"example/code-exit-compat",version:1};
const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:7,schema,extensions:[]});
const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:2,schema,extensions:[]});
const selection=block=>({kind:"text",anchor:{block,offset:"1",affinity:"after"},focus:{block,offset:"1",affinity:"after"}});
const guarded=(a,run)=>{const o=a.observe();try{return run(o);}finally{o.free();}};
const read=r=>{try{assert.equal(r.status,"value");return r.takeValue();}finally{r.free();}};
const take=(r,kind)=>{try{assert.equal(r.status,kind);return r[kind==="profile"?"takeProfile":"takeEditor"]();}finally{r.free();}};
async function load(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
function localRun(a,request){return guarded(a,o=>{const r=a.execute(o,JSON.stringify(request));try{assert.notEqual(r.status,"error");return r.status;}finally{r.free();}});}
const localCheckpoint=a=>read(a.checkpointJson());
const localView=a=>guarded(a,o=>read(o.viewJson()));
const document=binding=>JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:binding.schemaFingerprint,root});
/** The old runtime must truly predate code-exit capability; no JS inverse or request fallback is used. */
export async function probeCodeExitCompatibility(oldLocalDir,oldSharedDir,newLocalDir,newSharedDir){
 const oldLocal=await load(oldLocalDir,"breditor_wasm"),oldShared=await load(oldSharedDir,"breditor_shared"),currentLocal=await load(newLocalDir,"breditor_wasm"),currentShared=await load(newSharedDir,"breditor_shared");
 let restores=0,comparisons=0,legacyLocalRejections=0,legacySharedAbsent=0,guardedSharedRejections=0;
 for(const typing of [false,true])for(const block of ["code-root","code-cell","code-task"]){
  const owned=[];
  try{
   const op=take(oldLocal.module.BreditorRichProfile.fromStructuralBootstrapJsonV2(bootstrap),"profile"),np=take(currentLocal.module.BreditorRichProfile.fromStructuralBootstrapJsonV2(bootstrap),"profile");owned.push(op,np);
   const binding=JSON.parse(read(np.descriptorJson()));assert.equal(read(op.descriptorJson()),JSON.stringify(binding));
   const input=document(binding),a=take(np.createEditor(input,"100"),"editor"),legacy=take(op.createEditor(input,"100"),"editor");owned.push(a,legacy);
   assert.equal(a.codeExitVersion(),"1");assert.equal(legacy.codeExitVersion,undefined);
   localRun(a,{kind:"setSelection",selection:selection(block)});localRun(legacy,{kind:"setSelection",selection:selection(block)});
   if(typing){guarded(a,o=>read(a.enableTypingHistory(o)));guarded(legacy,o=>read(legacy.enableTypingHistory(o)));}
   const prior=localCheckpoint(legacy);guarded(legacy,o=>{const r=legacy.execute(o,JSON.stringify({kind:"exitCodeBlock",data:{paragraph:"fresh"}}));try{assert.equal(r.status,"error");}finally{r.free();}});assert.equal(localCheckpoint(legacy),prior);legacyLocalRejections++;
   localRun(a,{kind:"exitCodeBlock",data:{paragraph:"fresh"}});const saved=localCheckpoint(a),b=take(op[typing?"restoreTypingEditor":"restoreEditor"](saved),"editor");owned.push(b);assert.equal(localCheckpoint(b),saved);restores++;
   const requests=[{kind:"undo"},{kind:"redo"},...(typing?[{kind:"insertTypingText",data:{text:"Q",clockMs:"17"}},{kind:"insertTypingText",data:{text:"R",clockMs:"18"}}]:[{kind:"insertPlainText",text:"Q"},{kind:"insertPlainText",text:"R"}]),{kind:"undo"},{kind:"redo"}];
   for(const request of requests){assert.equal(localRun(a,request),localRun(b,request));assert.equal(localCheckpoint(a),localCheckpoint(b));assert.equal(localView(a),localView(b));comparisons++;}
   const c=take(np[typing?"restoreTypingEditor":"restoreEditor"](localCheckpoint(b)),"editor");owned.push(c);assert.equal(localCheckpoint(c),localCheckpoint(b));restores++;
   for(const kind of ["undo","redo"]){assert.equal(localRun(b,{kind}),localRun(c,{kind}));assert.equal(localCheckpoint(b),localCheckpoint(c));comparisons++;}

   const osp=oldShared.module.SharedRichProfile.from_configuration_json_v2(configuration),nsp=currentShared.module.SharedRichProfile.from_configuration_json_v2(configuration);owned.push(osp,nsp);assert.equal(osp.descriptor_json(),nsp.descriptor_json());
   const sharedInput=document(JSON.parse(nsp.descriptor_json())),x=nsp.create(sharedInput,"101");owned.push(x);assert.equal(x.code_exit_version(),"1");
   if(typing)guarded(x,o=>x.enable_typing_history(o));const stale=x.observe();guarded(x,o=>x.set_selection(o,JSON.stringify(selection(block))));
   const checkpoint=()=>typing?x.typing_checkpoint():x.checkpoint(),initial=checkpoint();assert.throws(()=>x.exit_code_block(stale,""));stale.free();assert.equal(checkpoint(),initial);guardedSharedRejections++;
   assert.throws(()=>guarded(x,o=>x.exit_code_block(o,"p")));assert.equal(checkpoint(),initial);guardedSharedRejections++;
   assert.equal(guarded(x,o=>x.exit_code_block(o,"fresh")),true);const cp=checkpoint(),y=osp[typing?"restore_typing":"restore"]("room",cp);owned.push(y);assert.equal(y.exit_code_block,undefined);assert.equal(y.code_exit_version,undefined);legacySharedAbsent++;
   const savedShared=owner=>typing?owner.typing_checkpoint():owner.checkpoint();assert.equal(savedShared(y),cp);restores++;
   const sharedRun=(owner,kind)=>guarded(owner,o=>kind==="Q"||kind==="R"?typing?owner.insert_typing_text(o,JSON.stringify({text:kind,clockMs:kind==="Q"?"17":"18"})):owner.insert_plain_text(o,kind):owner[`${kind}_observed`](o));
   for(const kind of ["undo","redo","Q","R","undo","redo"]){assert.equal(sharedRun(x,kind),sharedRun(y,kind));assert.equal(savedShared(x),savedShared(y));assert.equal(x.view_json(),y.view_json());comparisons++;}
   const z=nsp[typing?"restore_typing":"restore"]("room",savedShared(y));owned.push(z);assert.equal(savedShared(z),savedShared(y));restores++;
   for(const kind of ["undo","redo"]){assert.equal(sharedRun(y,kind),sharedRun(z,kind));assert.equal(savedShared(y),savedShared(z));comparisons++;}
  }finally{for(const value of owned.reverse())value.free();}
 }
 return {format:"breditor/code-exit-interoperability",formatVersion:1,before:{local:oldLocal.sha256,shared:oldShared.sha256},after:{local:currentLocal.sha256,shared:currentShared.sha256},contexts:["code-root","code-cell","code-task"],history:["explicit","typing-v1"],crossVersionRestores:restores,exactFutureComparisons:comparisons,legacyLocalCommandRejections:legacyLocalRejections,legacySharedCapabilityAbsent:legacySharedAbsent,guardedSharedRejections,originalProtocolsRetained:true,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==4){console.error("Usage: node scripts/probe-code-exit-compatibility.mjs <old-local> <old-shared> <new-local> <new-shared>");process.exitCode=2;}else console.log(JSON.stringify(await probeCodeExitCompatibility(...args),null,2));
}
