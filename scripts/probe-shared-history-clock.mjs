/** Real Wasm history regression; changes only this Node process's Date.now, never the OS clock. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

function guarded(owner, callback) {
 const observation=owner.observe();try{return callback(observation);}finally{observation.free();}
}
function text(owner) {
 return JSON.parse(owner.document_json()).root.children[0].children.map(run=>run.text).join("");
}
function trial(module, clock) {
 const originalNow=Date.now,owned=[],configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/clock-history",version:1},extensions:[]});
 let now=originalNow();
 try{
  if(clock==="backward")Date.now=()=>now--;
  if(clock==="frozen")Date.now=()=>now;
  const profile=module.SharedRichProfile.from_configuration_json(configuration);owned.push(profile);
  const binding=JSON.parse(profile.descriptor_json());
  const document=JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[{kind:"text",text:"abc",formats:[]}]}]}});
  const owner=profile.create(document,"101");owned.push(owner);
  const command=value=>({kind:"insert_text",data:{block:"p",offset:0,text:value}});
  guarded(owner,o=>owner.dispatch(o,JSON.stringify({commands:[command("1"),command("x")]})));
  const result={clock,batchUndoDepth:owner.undo_count()};
  guarded(owner,o=>owner.dispatch(o,JSON.stringify({commands:[command("2")]})));
  Object.assign(result,{undoDepth:owner.undo_count(),text:text(owner)});
  const checkpoint=owner.checkpoint();
  result.history=[];let historyCheckpoint;
  try{
   for(const direction of ["undo","undo","redo","redo"]){
    const changed=guarded(owner,o=>direction==="undo"?owner.undo_observed(o):owner.redo_observed(o));
    result.history.push({direction,changed,text:text(owner),undoDepth:owner.undo_count(),redoDepth:owner.redo_count()});
    if(result.history.length===1)historyCheckpoint=owner.checkpoint();
   }
  }catch(error){result.historyError=String(error);}
  Date.now=originalNow;
  try{
   const restored=profile.restore("room",checkpoint);owned.push(restored);
   result.restoredUndoDepth=restored.undo_count();
   result.restoredUndoChanged=guarded(restored,o=>restored.undo_observed(o));
   result.restoredAfterUndo=text(restored);
  }catch(error){result.restoreError=String(error);}
  if(historyCheckpoint)try{
   const restored=profile.restore("room",historyCheckpoint);owned.push(restored);
   result.restoredHistory={text:text(restored),undoDepth:restored.undo_count(),redoDepth:restored.redo_count()};
  }catch(error){result.historyRestoreError=String(error);}
  return result;
 }finally{Date.now=originalNow;for(const value of owned.reverse())value.free();}
}
export async function probeSharedHistoryClock(directory){
 const module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));
 await module.default({module_or_path:readFileSync(resolve(directory,"breditor_shared_bg.wasm"))});
 return{format:"breditor/shared-history-clock-probe",formatVersion:1,trials:["normal","frozen","backward"].map(clock=>trial(module,clock))};
}
/** Two dispatches stay separate; commands inside one dispatch stay grouped, including after recovery. */
export function requireStableSharedHistory(report){
 assert.deepEqual(report.trials.map(value=>value.clock),["normal","frozen","backward"]);
 for(const trial of report.trials){
  assert.equal(trial.historyError,undefined,`${trial.clock}: history error`);
  assert.equal(trial.restoreError,undefined,`${trial.clock}: recovery error`);
  assert.equal(trial.historyRestoreError,undefined,`${trial.clock}: history recovery error`);
  assert.equal(trial.batchUndoDepth,1,`${trial.clock}: multi-command batch split`);
  assert.equal(trial.undoDepth,2,`${trial.clock}: separate dispatches merged`);
  assert.equal(trial.text,"2x1abc");
  assert.deepEqual(trial.history,[
   {direction:"undo",changed:true,text:"x1abc",undoDepth:1,redoDepth:1},
   {direction:"undo",changed:true,text:"abc",undoDepth:0,redoDepth:2},
   {direction:"redo",changed:true,text:"x1abc",undoDepth:1,redoDepth:1},
   {direction:"redo",changed:true,text:"2x1abc",undoDepth:2,redoDepth:0},
  ],`${trial.clock}: history boundaries`);
  assert.equal(trial.restoredUndoDepth,2);
  assert.equal(trial.restoredUndoChanged,true);
  assert.equal(trial.restoredAfterUndo,"x1abc");
  assert.deepEqual(trial.restoredHistory,{text:"x1abc",undoDepth:1,redoDepth:1});
 }
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),strict=args[0]==="--require-stable";
 if(strict)args.shift();
 if(args.length!==1)throw Error("Usage: node scripts/probe-shared-history-clock.mjs [--require-stable] WASM_DIRECTORY");
 const report=await probeSharedHistoryClock(args[0]);console.log(JSON.stringify(report,null,2));
 if(strict)requireStableSharedHistory(report);
}
