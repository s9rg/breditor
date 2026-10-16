import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {requireStableSharedHistory} from "./probe-shared-history-clock.mjs";

const report=()=>({trials:["normal","frozen","backward"].map(clock=>({
 clock,batchUndoDepth:1,undoDepth:2,text:"2x1abc",
 history:[
  {direction:"undo",changed:true,text:"x1abc",undoDepth:1,redoDepth:1},
  {direction:"undo",changed:true,text:"abc",undoDepth:0,redoDepth:2},
  {direction:"redo",changed:true,text:"x1abc",undoDepth:1,redoDepth:1},
  {direction:"redo",changed:true,text:"2x1abc",undoDepth:2,redoDepth:0},
 ],restoredUndoDepth:2,restoredUndoChanged:true,restoredAfterUndo:"x1abc",
 restoredHistory:{text:"x1abc",undoDepth:1,redoDepth:1},
}))});
test("clock regression requires exact batch, dispatch, Undo/Redo and recovery boundaries",()=>{
 requireStableSharedHistory(report());
 for(const mutate of [
  value=>{value.batchUndoDepth=2;},value=>{value.undoDepth=1;},
  value=>{value.history[0].text="abc";},value=>{value.history[1].changed=false;},
  value=>{value.restoredUndoDepth=1;},value=>{value.restoredUndoChanged=false;},
  value=>{value.restoredAfterUndo="abc";},value=>{value.historyError="replay mismatch";},
  value=>{value.restoreError="replay mismatch";},
  value=>{value.historyRestoreError="replay mismatch";},value=>{value.restoredHistory.undoDepth=0;},
 ])for(let index=0;index<3;index++){
  const candidate=report();mutate(candidate.trials[index]);assert.throws(()=>requireStableSharedHistory(candidate));
 }
});
test("candidate SDK packaging runs the real clock regression after building Wasm in a child process",()=>{
 const source=readFileSync(new URL("./check-editor-package.mjs",import.meta.url),"utf8");
 const probe=source.indexOf('"scripts/probe-shared-history-clock.mjs","--require-stable"');
 assert.ok(probe>source.indexOf('"scripts/build-collaboration-runtime.mjs"'));
 assert.ok(probe<source.indexOf('"pack"'));
});
