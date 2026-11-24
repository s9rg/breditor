import {createSharedProfile} from "@breditor/editor/collaboration";
import {SharedPersistentSession,SharedSegmentedPersistentSession,restoreSharedSegmentedEditor} from "@breditor/collaboration";
import {seed,range} from "./seed.mjs";

const check=(ok,stage)=>{if(!ok)throw new Error(stage);};
async function verify(){
 const peer=await createSharedProfile();
 const document=seed(JSON.parse(peer.descriptor_json()));
 let alice,bob;
 let completed=0, segmented=false, legacy;
 const options=writer=>({
  database:(segmented?"native-rollover-":"original-before-rollover-")+writer,room:"room",writer,richLanguage:1,history:"explicit",
  rangeEditing:"original",selectionEditing:"original",searchHistory:null,reviewedHistory:null,
  readOnly:false,initialGenerations:{root:"root",active:"one"},
  create:()=>segmented?peer.restore("room",legacy[writer==="101"?0:1]):
   writer==="101"?peer.create(document,writer):peer.join_frame("room",writer,alice.core.updateFrame()),
  restore:s=>peer.restore("room",s),
  restoreSegmented:s=>restoreSharedSegmentedEditor(peer,"room",s),
 });
 const sync=async()=>{
  const outgoingA=alice.core.updateFrame(),outgoingB=bob.core.updateFrame();
  await alice.core.receiveFrame(outgoingB);
  await bob.core.receiveFrame(outgoingA);
  check(alice.core.documentJson()===bob.core.documentJson(),"Peered documents must converge");
 };
 const open=async()=>{
  const store=segmented?SharedSegmentedPersistentSession:SharedPersistentSession;
  alice=await store.open(options("101"));
  bob=await store.open(options("202"));
 };
 const close=async()=>{await Promise.all([alice.close(),bob.close()]);};
 const reopenExactly=async()=>{
  await Promise.all([alice.flush(),bob.flush()]);
  const saved=[alice.core.checkpointJson(),bob.core.checkpointJson()];
  await close();
  await open();
  check(alice.recovered&&bob.recovered,"Both peers must reopen persisted storage");
  check(alice.core.checkpointJson()===saved[0]&&bob.core.checkpointJson()===saved[1],"Both reopen checkpoints must match byte-for-byte");
  return saved;
 };
 try{
  await open();
  const original=alice.core.documentJson();
  const edit=async()=>{
   alice.core.select(range("deep-head",0));
   check(alice.core.type("x"),"Native edit must commit");
   await sync();
   check(bob.core.documentJson().includes("xNested idea"),"Peer must receive edit");
  };
  const round=async()=>{
   await edit();
   check(alice.core.undo(),"Native Undo must commit");
   await sync();
   check(alice.core.documentJson()===original,"Native Undo must recover the complete original document");
   completed++;
  };
  while(completed<105)await round();
  await edit();
  const firstEdit=alice.core.documentJson();
  alice.core.select(range("first-head",0));
  check(alice.core.type("y"),"The second legacy edit must commit");
  const secondEdit=alice.core.documentJson();
  check(alice.core.undo()&&alice.core.documentJson()===firstEdit,"The original cut must have a Redo ahead of its Undo");
  bob.core.select(range("intro",0));
  check(bob.core.type("offline "),"Disconnected peer must durably author its edit");
  const offlineEdit=bob.core.documentJson();
  const offlineFrame=bob.core.updateFrame();
  await Promise.all([alice.flush(),bob.flush()]);
  legacy=[alice.core.checkpointJson(),bob.core.checkpointJson()];
  await close();
  segmented=true;
  await open();
  check(JSON.parse(alice.core.checkpointJson()).rootCheckpoint===legacy[0]&&
   JSON.parse(bob.core.checkpointJson()).rootCheckpoint===legacy[1],"Exact legacy journals must become immutable roots");
  await reopenExactly();
  const frontier=()=>{
   const {undoItems,redoItems}=alice.core.segmentedHistoryInfo();
   return [undoItems,redoItems];
  };
  const preCutFrontier=frontier();
  check(preCutFrontier.every(count=>count>0),"The recovered legacy cut must have both an Undo and a Redo");
  for(const [index,next] of ["two","three"].entries()){
   // Author records in each active segment without delivering the offline edit.
   check(alice.core.redo()&&alice.core.documentJson()===secondEdit,"The pre-cut Redo must replay the second edit");
   check(alice.core.undo()&&alice.core.documentJson()===firstEdit,"Undo must restore the pre-cut Redo frontier");
   bob.core.select(range("second-head",0));
   check(bob.core.type("z")&&bob.core.undo()&&bob.core.documentJson()===offlineEdit,"The peer keeps its unsubmitted edit while filling its segment");
   await Promise.all([alice.sealGeneration(next),bob.sealGeneration(next)]);
   for(const {core} of [alice,bob]){
    const info=core.segmentedHistoryInfo();
    check(info.activeGeneration===next&&info.sealedGenerations===index+2,"Both owners must seal the actual active segment");
   }
  }
  await reopenExactly();
  check(frontier().every((count,index)=>count===preCutFrontier[index]),"Cold open after two seals must preserve the pre-cut frontier");
  check(alice.core.documentJson()===firstEdit&&bob.core.documentJson()===offlineEdit,"The peer must still be offline after the second seal");
  check(await alice.core.receiveFrame(offlineFrame),"The exact pre-cut frame must deliver after two seals");
  check(alice.core.documentJson()===offlineEdit,"The pre-cut frame must restore the offline edit");
  const afterDelivery=alice.core.checkpointJson();
  check(!await alice.core.receiveFrame(offlineFrame)&&alice.core.checkpointJson()===afterDelivery,
   "Repeating the exact frame must leave the complete checkpoint unchanged");
  await sync();
  const redoWithOffline=secondEdit.replace('"SDK heading"','"offline SDK heading"');
  check(redoWithOffline!==secondEdit,"The seeded heading must be present");
  check(alice.core.redo(),"The pre-cut Redo must survive both sealed segments and a cold open");
  await sync();
  check(bob.core.documentJson()===redoWithOffline,"Pre-cut Redo must restore the second edit without changing the offline edit");
  check(alice.core.undo(),"Undo must reverse the second edit");
  await sync();
  check(bob.core.documentJson()===offlineEdit,"Undo of the second edit must leave the rest of the shared document intact");
  check(alice.core.undo(),"Pre-boundary Undo must survive the generation and reopen");
  await sync();
  check(alice.core.documentJson()===original.replace('"SDK heading"','"offline SDK heading"'),"Pre-cut Undo must keep the other author's offline edit");
  check(bob.core.undo(),"The offline edit must retain author-local Undo across rollover");
  await sync();
  check(alice.core.documentJson()===original,"Both author-local Undos must restore the original document");
  check(alice.core.redo(),"Pre-boundary Redo must survive the generation and reopen");
  await sync();
  check(bob.core.documentJson().includes("xNested idea"),"Peer must receive cross-boundary Redo");
  check(alice.core.undo(),"Completing the cross-boundary round must preserve Undo");
  await sync();
  check(alice.core.documentJson()===original,"Cross-boundary Undo must recover the original document");
  completed++;
  while(completed<115)await round();
  const retained=await reopenExactly();
  await close();
  segmented=false;
  await open();
  check(alice.recovered&&bob.recovered&&alice.core.checkpointJson()===legacy[0]&&bob.core.checkpointJson()===legacy[1],
   "The original databases must remain available for exact recovery");
  return {passed:true,rounds:completed,exactLegacyRoots:2,explicitSeals:4,exactPeerReopens:6,legacyDatabasesReopened:2,
   legacyBytes:legacy.map(value=>new TextEncoder().encode(value).length),
   offlineEditPreserved:true,preCutRedoPreserved:true,preBoundaryUndoAndRedoPreserved:true,
   archiveBytes:retained.map(value=>new TextEncoder().encode(value).length)};
 }finally{
  await Promise.all([alice?.discardAndClose(),bob?.discardAndClose()]);
  peer.free();
 }
}
const result=await verify().catch(error=>({passed:false,reason:String(error).slice(0,250)}));
document.querySelector("#result").textContent=JSON.stringify(result);
