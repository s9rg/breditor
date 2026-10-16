/** Real pre-policy/current Wasm checkpoint interoperability; no publication or protocol rewrite. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const point={block:"p",offset:"1",affinity:"after"},selection={kind:"text",anchor:point,focus:point};
const guarded=(owner,run)=>{const o=owner.observe();try{return run(o);}finally{o.free();}};
function read(result){try{assert.equal(result.status,"value");return result.takeValue();}finally{result.free();}}
function take(result,kind){try{assert.equal(result.status,kind);return result[kind==="profile"?"takeProfile":"takeEditor"]();}finally{result.free();}}
async function load(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
function localCommand(owner,request){return guarded(owner,o=>{const r=owner.execute(o,JSON.stringify(request));try{assert.notEqual(r.status,"error");}finally{r.free();}});}
const localView=owner=>guarded(owner,o=>JSON.parse(read(o.viewJson())));
const localCheckpoint=owner=>read(owner.checkpointJson());
/** Hosts restore content/history, never a saved permission; older peers see no new wire operation. */
export async function probeReadOnlyCompatibility(oldLocalDir,oldSharedDir,newLocalDir,newSharedDir){
 const oldLocal=await load(oldLocalDir,"breditor_wasm"),newLocal=await load(newLocalDir,"breditor_wasm"),oldShared=await load(oldSharedDir,"breditor_shared"),newShared=await load(newSharedDir,"breditor_shared");
 let comparisons=0,restores=0;
 for(const language of [1,2]){
  const owned=[];
  try{
   const schema={name:"example/read-only-interop",version:1},bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language===1?6:7,schema,extensions:[]}),factory=language===1?"fromBootstrapJson":"fromStructuralBootstrapJsonV2";
   const oldProfile=take(oldLocal.module.BreditorRichProfile[factory](bootstrap),"profile"),profile=take(newLocal.module.BreditorRichProfile[factory](bootstrap),"profile");owned.push(oldProfile,profile);
   const binding=JSON.parse(read(profile.descriptorJson())),content=JSON.parse(readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),"utf8")),document=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(content)});
   const a=take(profile.createEditor(document,"100"),"editor");owned.push(a);
   localCommand(a,{kind:"setSelection",selection});localCommand(a,{kind:"insertPlainText",text:"Q"});
   for(const value of [true,false,true])guarded(a,o=>assert.equal(read(a.setReadOnly(o,value)),"true"));
   const checkpoint=localCheckpoint(a);assert.equal(localView(a).readOnly,true);
   guarded(a,o=>{const r=a.execute(o,JSON.stringify({kind:"insertPlainText",text:"Blocked"}));try{assert.equal(r.status,"error");const e=r.error;try{assert.equal(e.code,"breditor_rich.read_only");}finally{e.free();}}finally{r.free();}});assert.equal(localCheckpoint(a),checkpoint);
   const old=take(oldProfile.restoreEditor(checkpoint),"editor"),current=take(profile.restoreEditor(checkpoint),"editor");owned.push(old,current);restores+=2;
   assert.equal(typeof old.setReadOnly,"undefined");assert.equal(localView(current).readOnly,undefined);assert.equal(localView(current).readOnlyRevision,undefined);
   assert.equal(localCheckpoint(old),checkpoint);assert.equal(localCheckpoint(current),checkpoint);
   for(const request of [{kind:"undo"},{kind:"redo"},{kind:"insertPlainText",text:"Future"},{kind:"undo"},{kind:"redo"}]){localCommand(old,request);localCommand(current,request);assert.equal(localCheckpoint(old),localCheckpoint(current));assert.deepEqual(localView(old),localView(current));comparisons++;}
   const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema,extensions:[]}),sharedFactory=language===1?"from_configuration_json":"from_configuration_json_v2";
   const oldSharedProfile=oldShared.module.SharedRichProfile[sharedFactory](configuration),sharedProfile=newShared.module.SharedRichProfile[sharedFactory](configuration);owned.push(oldSharedProfile,sharedProfile);
   const shared=sharedProfile.create(document,"101");owned.push(shared);
   guarded(shared,o=>shared.set_selection(o,JSON.stringify(selection)));guarded(shared,o=>shared.insert_plain_text(o,"Q"));
   for(const value of [true,false,true])guarded(shared,o=>assert.equal(shared.set_read_only(o,value),true));
   const journal=shared.checkpoint();assert.throws(()=>guarded(shared,o=>shared.insert_plain_text(o,"Blocked")));assert.equal(shared.checkpoint(),journal);
   const oldWriter=oldSharedProfile.restore("room",journal),writer=sharedProfile.restore("room",journal);owned.push(oldWriter,writer);restores+=2;
   assert.equal(typeof oldWriter.set_read_only,"undefined");assert.equal(JSON.parse(writer.view_json()).readOnly,undefined);assert.equal(JSON.parse(writer.view_json()).readOnlyRevision,undefined);
   assert.equal(oldWriter.checkpoint(),journal);assert.equal(writer.checkpoint(),journal);
   for(const action of ["undo_observed","redo_observed","insert_plain_text","undo_observed","redo_observed"]){assert.equal(guarded(oldWriter,o=>oldWriter[action](o,"Future")),guarded(writer,o=>writer[action](o,"Future")));assert.equal(oldWriter.checkpoint(),writer.checkpoint());assert.equal(oldWriter.view_json(),writer.view_json());comparisons++;}
  }finally{for(const owner of owned.reverse())owner.free();}
 }
 return {format:"breditor/read-only-interoperability",formatVersion:1,languages:[1,2],before:{local:oldLocal.sha256,shared:oldShared.sha256},after:{local:newLocal.sha256,shared:newShared.sha256},nativeWasmDenials:4,crossVersionRestores:restores,exactFutureHistoryComparisons:comparisons,permissionNotPersisted:true,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==4){console.error("Usage: node scripts/probe-read-only-compatibility.mjs <old-local> <old-shared> <new-local> <new-shared>");process.exitCode=2;}else console.log(JSON.stringify(await probeReadOnlyCompatibility(...args),null,2));
}
