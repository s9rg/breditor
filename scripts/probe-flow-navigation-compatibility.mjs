/** Real pre-capability/current native flow histories; no JS placement or history inverse fallback. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const root=canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8")));
const schema={name:"example/flow-navigation-interop",version:1};
const caret={kind:"text",anchor:{block:"p",offset:"4",affinity:"after"},focus:{block:"p",offset:"4",affinity:"after"}};
const guarded=(a,work)=>{const o=a.observe();try{return work(o);}finally{o.free();}};
const read=r=>{try{assert.equal(r.status,"value");return r.takeValue();}finally{r.free();}};
const take=(r,kind)=>{try{assert.equal(r.status,kind);return r[kind==="profile"?"takeProfile":"takeEditor"]();}finally{r.free();}};
async function load(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
const localCommand=(a,command)=>guarded(a,o=>{const r=a.execute(o,JSON.stringify(command));try{assert.notEqual(r.status,"error");return r.status;}finally{r.free();}});
const localCheckpoint=a=>read(a.checkpointJson());
const localView=a=>guarded(a,o=>read(o.viewJson()));
const document=binding=>JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:binding.schemaFingerprint,root});

/** Compare both native selections and saved future effects across the actual Wasm builds. */
export async function probeFlowNavigationCompatibility(oldLocalDir,oldSharedDir,newLocalDir,newSharedDir){
 const oldLocal=await load(oldLocalDir,"breditor_wasm"),oldShared=await load(oldSharedDir,"breditor_shared"),newLocal=await load(newLocalDir,"breditor_wasm"),newShared=await load(newSharedDir,"breditor_shared");
 let restores=0,future=0,navigationStates=0,legacyRejections=0,guardedRejections=0,boundaryNoops=0;
 for(const language of [1,2])for(const typing of [false,true])for(const target of ["table-block","image-block"])for(const side of ["before","after"]){
  const owned=[];
  try{
   const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language===1?6:7,schema,extensions:[]}),factory=language===1?"fromBootstrapJson":"fromStructuralBootstrapJsonV2";
   const op=take(oldLocal.module.BreditorRichProfile[factory](bootstrap),"profile"),np=take(newLocal.module.BreditorRichProfile[factory](bootstrap),"profile");owned.push(op,np);assert.equal(read(op.descriptorJson()),read(np.descriptorJson()));
   const input=document(JSON.parse(read(np.descriptorJson()))),a=take(np.createEditor(input,"100"),"editor"),legacy=take(op.createEditor(input,"100"),"editor");owned.push(a,legacy);assert.equal(a.flowNavigationVersion(),"1");assert.equal(legacy.flowNavigationVersion,undefined);
   if(typing){guarded(a,o=>read(a.enableTypingHistory(o)));guarded(legacy,o=>read(legacy.enableTypingHistory(o)));}
   for(const owner of [a,legacy])localCommand(owner,{kind:"setSelection",selection:caret});
   const legacyBefore=localCheckpoint(legacy);guarded(legacy,o=>{const r=legacy.execute(o,JSON.stringify({kind:"navigateFlow",data:{movement:"after"}}));try{assert.equal(r.status,"error");}finally{r.free();}});assert.equal(localCheckpoint(legacy),legacyBefore);legacyRejections++;
   localCommand(a,{kind:"navigateFlow",data:{movement:"after"}});assert.deepEqual(JSON.parse(localView(a)).selection,{kind:"node",block:"image-block"});
   // Mirror only the native result through the old selection API. No JS destination planner.
   localCommand(legacy,{kind:"setSelection",selection:JSON.parse(localView(a)).selection});assert.equal(localCheckpoint(a),localCheckpoint(legacy));assert.equal(localView(a),localView(legacy));navigationStates++;
   localCommand(a,{kind:"setSelection",selection:{kind:"node",block:target}});
   if(target==="table-block"){const before=localCheckpoint(a);assert.equal(localCommand(a,{kind:"navigateFlow",data:{movement:side}}),"unchanged");assert.equal(localCheckpoint(a),before);boundaryNoops++;}
   localCommand(a,{kind:"insertParagraphAdjacent",data:{paragraph:"fresh",side}});
   const saved=localCheckpoint(a),b=take(op[typing?"restoreTypingEditor":"restoreEditor"](saved),"editor");owned.push(b);assert.equal(localCheckpoint(b),saved);restores++;
   const requests=[{kind:"undo"},{kind:"redo"},...(typing?[{kind:"insertTypingText",data:{text:"Q",clockMs:"1"}},{kind:"insertTypingText",data:{text:"R",clockMs:"2"}}]:[{kind:"insertPlainText",text:"Q"},{kind:"insertPlainText",text:"R"}]),{kind:"undo"},{kind:"redo"}];
   for(const request of requests){assert.equal(localCommand(a,request),localCommand(b,request));assert.equal(localCheckpoint(a),localCheckpoint(b));assert.equal(localView(a),localView(b));future++;}
   const c=take(np[typing?"restoreTypingEditor":"restoreEditor"](localCheckpoint(b)),"editor");owned.push(c);assert.equal(localCheckpoint(c),localCheckpoint(b));restores++;
   for(const kind of ["undo","redo"]){assert.equal(localCommand(b,{kind}),localCommand(c,{kind}));assert.equal(localCheckpoint(b),localCheckpoint(c));future++;}

   const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema,extensions:[]}),sharedFactory=language===1?"from_configuration_json":"from_configuration_json_v2";
   const osp=oldShared.module.SharedRichProfile[sharedFactory](configuration),nsp=newShared.module.SharedRichProfile[sharedFactory](configuration);owned.push(osp,nsp);assert.equal(osp.descriptor_json(),nsp.descriptor_json());
   const sharedInput=document(JSON.parse(nsp.descriptor_json())),x=nsp.create(sharedInput,"101"),old=osp.create(sharedInput,"101");owned.push(x,old);assert.equal(x.flow_navigation_version(),"1");assert.equal(old.flow_navigation_version,undefined);assert.equal(old.navigate_flow,undefined);
   if(typing)for(const owner of [x,old])guarded(owner,o=>owner.enable_typing_history(o));
   for(const owner of [x,old])guarded(owner,o=>owner.set_selection(o,JSON.stringify(caret)));
   const checkpoint=owner=>typing?owner.typing_checkpoint():owner.checkpoint(),frame=x.update_frame();
   assert.equal(guarded(x,o=>x.navigate_flow(o,"after")),true);assert.equal(x.update_frame(),frame);guarded(old,o=>old.set_selection(o,JSON.stringify(JSON.parse(x.view_json()).selection)));assert.equal(checkpoint(x),checkpoint(old));assert.equal(x.view_json(),old.view_json());navigationStates++;
   const stale=x.observe();guarded(x,o=>x.set_selection(o,JSON.stringify({kind:"node",block:target})));const before=checkpoint(x);assert.throws(()=>x.navigate_flow(stale,"invalid"));stale.free();assert.equal(checkpoint(x),before);guardedRejections++;
   assert.throws(()=>guarded(x,o=>x.insert_paragraph_adjacent(o,"p",side)));assert.equal(checkpoint(x),before);guardedRejections++;
   if(target==="table-block"){assert.equal(guarded(x,o=>x.navigate_flow(o,side)),false);assert.equal(checkpoint(x),before);boundaryNoops++;}
   assert.equal(guarded(x,o=>x.insert_paragraph_adjacent(o,"fresh",side)),true);const cp=checkpoint(x),y=osp[typing?"restore_typing":"restore"]("room",cp);owned.push(y);assert.equal(checkpoint(y),cp);restores++;
   const command=(owner,kind)=>guarded(owner,o=>kind==="Q"||kind==="R"?typing?owner.insert_typing_text(o,JSON.stringify({text:kind,clockMs:kind==="Q"?"1":"2"})):owner.insert_plain_text(o,kind):owner[`${kind}_observed`](o));
   for(const kind of ["undo","redo","Q","R","undo","redo"]){assert.equal(command(x,kind),command(y,kind));assert.equal(checkpoint(x),checkpoint(y));assert.equal(x.view_json(),y.view_json());future++;}
   const z=nsp[typing?"restore_typing":"restore"]("room",checkpoint(y));owned.push(z);assert.equal(checkpoint(z),checkpoint(y));restores++;
   for(const kind of ["undo","redo"]){assert.equal(command(y,kind),command(z,kind));assert.equal(checkpoint(y),checkpoint(z));future++;}
  }finally{for(const value of owned.reverse())value.free();}
 }
 return {format:"breditor/flow-navigation-interoperability",formatVersion:1,before:{local:oldLocal.sha256,shared:oldShared.sha256},after:{local:newLocal.sha256,shared:newShared.sha256},languages:[1,2],history:["explicit","typing-v1"],targets:["table-block","image-block"],sides:["before","after"],crossVersionRestores:restores,exactFutureComparisons:future,exactNavigationStates:navigationStates,legacyLocalCommandRejections:legacyRejections,guardedSharedRejections:guardedRejections,boundaryNoops,originalProtocolsRetained:true,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==4){console.error("Usage: node scripts/probe-flow-navigation-compatibility.mjs <old-local> <old-shared> <new-local> <new-shared>");process.exitCode=2;}else console.log(JSON.stringify(await probeFlowNavigationCompatibility(...args),null,2));
}
