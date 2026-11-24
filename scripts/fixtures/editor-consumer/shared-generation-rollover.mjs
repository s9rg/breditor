import {createSharedProfile} from "@breditor/editor/collaboration";
import {SharedPersistentSession,SharedSegmentedPersistentSession,restoreSharedSegmentedEditor} from "@breditor/collaboration";
import {seed,range} from "./seed.mjs";

const check=(ok,stage)=>{if(!ok)throw new Error(stage);};
async function verify(){
 const peer=await createSharedProfile();
 const document=seed(JSON.parse(peer.descriptor_json()));
 let alice,bob;
 let completed=0, segmented=false, legacy;
 let segmentedDatabase="native-rollover-";
 const options=writer=>({
  database:(segmented?segmentedDatabase:"original-before-rollover-")+writer,room:"room",writer,richLanguage:1,history:"explicit",
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
 const restore=(writer,recovery,overrides={})=>SharedSegmentedPersistentSession.restoreRecovery({
  ...options(writer),database:"restored-rollover-"+writer,recovery,writerRecovery:"host-reacquired",...overrides,
 });
 const expectRestoreRefusal=async(writer,recovery,expected)=>{
  let replayed=false,error;
  try{
   const session=await restore(writer,recovery,{restoreSegmented:()=>{
    replayed=true;
    throw new Error("A refused restore must stop before native replay");
   }});
   await session.discardAndClose();
  }catch(caught){error=caught;}
  check(!replayed&&error?.code===expected,`Restore of writer ${writer} must stop with ${expected} before replay, got ${error?.code}`);
 };
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
  alice.core.select(range("deep-head",0));
  check(alice.core.type("w"),"The third legacy edit must commit");
  const thirdEdit=alice.core.documentJson();
  check(alice.core.undo()&&alice.core.documentJson()===secondEdit,"Undo must place the third edit on the legacy Redo stack");
  check(alice.core.undo()&&alice.core.documentJson()===firstEdit,"Undo must place the second edit ahead of the third Redo");
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
  check(preCutFrontier[0]>0&&preCutFrontier[1]===2,"The recovered legacy cut must have an Undo and both Redo items");
  for(const [index,next] of ["two","three"].entries()){
   // Populate each segment without touching the deeper Redo or delivering the offline edit.
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
  const sourceCut=await reopenExactly();
  check(frontier().every((count,index)=>count===preCutFrontier[index]),"Cold open after two seals must preserve the pre-cut frontier");
  check(alice.core.documentJson()===firstEdit&&bob.core.documentJson()===offlineEdit,"The peer must still be offline after the second seal");
  const recovery=structuredClone([alice.exportRecovery(),bob.exportRecovery()]);
  check(recovery.every((backup,index)=>backup.checkpoint===sourceCut[index]),"Portable backups must carry both exact source cuts");
  await expectRestoreRefusal("101",recovery[0],"writer_in_use");
  await expectRestoreRefusal("202",recovery[1],"writer_in_use");
  await close();
  alice=await restore("101",recovery[0]);
  bob=await restore("202",recovery[1]);
  segmentedDatabase="restored-rollover-";
  check([alice,bob].every((session,index)=>session.recovered&&
   JSON.stringify(session.exportRecovery())===JSON.stringify(recovery[index])),"Each fresh destination must restore the entire exact recovery record");
  check(frontier().every((count,index)=>count===preCutFrontier[index]),"Portable recovery must preserve the exact history frontier");
  check(alice.core.documentJson()===firstEdit&&bob.core.documentJson()===offlineEdit,"Portable recovery must preserve each offline document");
  check(await alice.core.receiveFrame(offlineFrame),"The exact pre-cut frame must deliver after two seals");
  check(alice.core.documentJson()===offlineEdit,"The pre-cut frame must restore the offline edit");
  const afterDelivery=alice.core.checkpointJson();
  check(!await alice.core.receiveFrame(offlineFrame)&&alice.core.checkpointJson()===afterDelivery,
   "Repeating the exact frame must leave the complete checkpoint unchanged");
  await sync();
  const withOffline=document=>document.replace('"SDK heading"','"offline SDK heading"');
  check(withOffline(original)!==original,"The seeded heading must be present");
  check(alice.core.redo(),"The pre-cut Redo must survive both sealed segments and a cold open");
  await sync();
  check(bob.core.documentJson()===withOffline(secondEdit),"Pre-cut Redo must restore the second edit without changing the offline edit");
  check(alice.core.redo(),"The untouched pre-cut Redo must survive both sealed segments and a cold open");
  await sync();
  check(bob.core.documentJson()===withOffline(thirdEdit),"The untouched Redo must restore the third edit alongside the offline edit");
  check(alice.core.undo(),"Undo must reverse the third edit");
  await sync();
  check(bob.core.documentJson()===withOffline(secondEdit),"Undo of the third edit must leave both other edits intact");
  check(alice.core.undo(),"Undo must reverse the second edit");
  await sync();
  check(bob.core.documentJson()===offlineEdit,"Undo of the second edit must leave the rest of the shared document intact");
  check(alice.core.undo(),"Pre-boundary Undo must survive the generation and reopen");
  await sync();
  check(alice.core.documentJson()===withOffline(original),"Pre-cut Undo must keep the other author's offline edit");
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
  check(retained.every((checkpoint,index)=>checkpoint!==sourceCut[index]),"Both restored destinations must have newer contents");
  await expectRestoreRefusal("101",recovery[0],"segmented_destination_exists");
  await expectRestoreRefusal("202",recovery[1],"segmented_destination_exists");
  await open();
  check([alice,bob].every((session,index)=>session.recovered&&session.core.checkpointJson()===retained[index]),
   "Refusing overwrites must preserve each newer recovery destination byte-for-byte");
  await close();
  segmentedDatabase="native-rollover-";
  await open();
  check([alice,bob].every((session,index)=>session.recovered&&session.core.checkpointJson()===sourceCut[index]),
   "Recovering into new destinations must preserve both segmented source databases byte-for-byte");
  await close();
  segmented=false;
  await open();
  check(alice.recovered&&bob.recovered&&alice.core.checkpointJson()===legacy[0]&&bob.core.checkpointJson()===legacy[1],
   "The original databases must remain available for exact recovery");
  return {passed:true,rounds:completed,exactLegacyRoots:2,explicitSeals:4,exactPeerReopens:6,legacyDatabasesReopened:2,
   portableRecoveryRestores:2,heldWriterRefusals:2,occupiedDestinationRefusals:2,unchangedSegmentedSources:2,
   legacyBytes:legacy.map(value=>new TextEncoder().encode(value).length),
   offlineEditPreserved:true,preCutRedoItemsRestored:2,preBoundaryUndoAndRedoPreserved:true,
   archiveBytes:retained.map(value=>new TextEncoder().encode(value).length)};
 }finally{
  await Promise.all([alice?.discardAndClose(),bob?.discardAndClose()]);
  peer.free();
 }
}
const result=await verify().catch(error=>({passed:false,reason:String(error).slice(0,250)}));
document.querySelector("#result").textContent=JSON.stringify(result);
