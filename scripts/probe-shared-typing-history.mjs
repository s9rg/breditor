/** Actual pre-capability/current application Wasm, strict typed input and exact grouped replay. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedTypingEditor} from "../packages/breditor-collaboration/dist/profile.js";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const range=(block,start,end=start)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function load(directory){const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
const guarded=(raw,work)=>{const o=raw.observe();try{return work(o);}finally{o.free();}};
export async function probeSharedTypingHistory(beforeDirectory,afterDirectory){
 const before=await load(beforeDirectory),after=await load(afterDirectory);let defaultStates=0,strictRejects=0,futureStates=0,invisiblePublications=0;
 for(const language of [1,2]){
  const profiles=[],owners=[];const own=raw=>{const e=new SharedRichEditor(raw);owners.push(e);return e;};
  try{
   const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:"example/shared-typing-interop",version:1},extensions:[]}),factory=language===1?"from_configuration_json":"from_configuration_json_v2";
   const oldProfile=before.module.SharedRichProfile[factory](configuration),profile=after.module.SharedRichProfile[factory](configuration);profiles.push(oldProfile,profile);assert.equal(oldProfile.descriptor_json(),profile.descriptor_json());
   const binding=JSON.parse(profile.descriptor_json()),document=JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(JSON.parse(readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),"utf8")))});
   const old=own(oldProfile.create(document,"101")),raw=profile.create(document,"101"),current=own(raw),initial=current.documentJson();
   assert.equal(old.supportsTypingHistory(),false);const unchanged=old.checkpointJson();assert.throws(()=>old.enableTypingHistory(),e=>e.code==="typing_history_unavailable");assert.throws(()=>restoreSharedTypingEditor(oldProfile,"room",unchanged),e=>e.code==="typing_history_unavailable");assert.equal(old.checkpointJson(),unchanged);
   for(const work of [e=>e.select(range("p",1)),e=>e.type("A"),e=>e.type("🙂"),e=>e.undo(),e=>e.redo(),e=>e.undo(),e=>e.undo()]){work(old);work(current);assert.equal(old.checkpointJson(),current.checkpointJson());assert.deepEqual(old.view(),current.view());defaultStates++;}
   current.enableTypingHistory();current.select(range("p",1));
   const typed=["9007199254740993","9007199254741743","9007199254742494"];
   for(const [i,clock]of typed.entries())current.typeUser("ABC"[i],clock);assert.equal(current.view().undoDepth,2);assert.equal(current.view().historyStepCount,3);
   const saved=current.checkpointJson();assert.equal(JSON.parse(saved).format,"breditor/shared-typing-session");assert.throws(()=>profile.restore("room",saved));assert.throws(()=>oldProfile.restore("room",saved));assert.throws(()=>restoreSharedTypingEditor(oldProfile,"room",saved));
   for(const input of ['{"text":"X","clockMs":1}','{"text":"X","clockMs":"01"}','{"text":"X","clockMs":"+1"}','{"text":"X","clockMs":"18446744073709551616"}','{"text":"X","clockMs":"1","unknown":true}','{"text":"X","clockMs":"1","clockMs":"2"}']){assert.throws(()=>guarded(raw,o=>raw.insert_typing_text(o,input)));assert.equal(current.checkpointJson(),saved);strictRejects++;}
   for(const input of [JSON.stringify({selection:range("p",3,4),direction:"sideways",clockMs:"1"}),JSON.stringify({selection:range("p",3,4),direction:"backward",clockMs:1}),JSON.stringify({selection:range("p",3,4),direction:"backward",clockMs:"1",extra:0})]){assert.throws(()=>guarded(raw,o=>raw.delete_typing_range(o,input)));assert.equal(current.checkpointJson(),saved);strictRejects++;}
   const stale=raw.observe();current.closeTypingGroup();assert.throws(()=>raw.insert_typing_text(stale,"bad"),/observation|publication|stale/i);stale.free();
   // Read-only is a live policy, intentionally not part of a recovered journal.
   const readonlyRaw=profile.create(document,"505"),readonly=own(readonlyRaw);readonly.enableTypingHistory();readonly.setReadOnly(true);const readonlyCheckpoint=readonly.checkpointJson();assert.throws(()=>guarded(readonlyRaw,o=>readonlyRaw.insert_typing_text(o,"bad")),/read.only/i);assert.equal(readonly.checkpointJson(),readonlyCheckpoint);
   const checkpoint=current.checkpointJson(),restored=own(restoreSharedTypingEditor(profile,"room",checkpoint));assert.equal(restored.checkpointJson(),checkpoint);
   for(const work of [e=>e.undo(),e=>e.redo(),e=>e.typeUser("Future","1"),e=>e.undo(),e=>e.redo()]){assert.equal(work(current),work(restored));assert.equal(current.checkpointJson(),restored.checkpointJson());assert.deepEqual(current.view(),restored.view());futureStates++;}
   // A partially invisible native burst may not spill into an older unrelated unit.
   for(const fully of [false,true]){
    const a=own(profile.create(initial,"303")),b=own(profile.join_frame("room","404",a.updateFrame()));if(!fully)a.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Older "}}]});a.enableTypingHistory();a.select(range("caption",1));a.typeUser("A","1");a.typeUser("B","2");await b.receiveFrame(a.updateFrame());b.dispatch({commands:[{kind:"delete_text",data:{block:"caption",offset:1,length:fully?2:1}},{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer "}}]});await a.receiveFrame(b.updateFrame());
    const replay=own(restoreSharedTypingEditor(profile,"room",a.checkpointJson())),publications=[];a.subscribe(event=>publications.push(event));assert.equal(a.undo(),!fully);assert.equal(replay.undo(),!fully);assert.equal(a.checkpointJson(),replay.checkpointJson());assert.equal(publications.length,1);if(fully)invisiblePublications++;assert.equal(a.documentJson().includes("Older "),!fully);assert.ok(a.documentJson().includes("Peer "));assert.equal(a.view().undoDepth,fully?0:1);
    for(const work of [e=>e.redo(),e=>e.undo(),e=>e.redo()]){assert.equal(work(a),work(replay));assert.equal(a.checkpointJson(),replay.checkpointJson());futureStates++;}
   }
  }finally{for(const e of owners.reverse())e.dispose();for(const p of profiles.reverse())p.free();}
 }
 return {format:"breditor/shared-typing-history-interoperability",formatVersion:1,languages:[1,2],beforeWasmSha256:before.sha256,afterWasmSha256:after.sha256,oldCapabilityRejected:true,exactDefaultStates:defaultStates,strictRejects,exactGroupedFutureStates:futureStates,invisiblePublications,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==2)throw Error("Usage: node scripts/probe-shared-typing-history.mjs <before-runtime> <after-runtime>");console.log(JSON.stringify(await probeSharedTypingHistory(...args),null,2));
}
