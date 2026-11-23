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
  bob.core.select(range("intro",0));
  check(bob.core.type("offline "),"Disconnected peer must durably author its edit");
  await Promise.all([alice.flush(),bob.flush()]);
  legacy=[alice.core.checkpointJson(),bob.core.checkpointJson()];
  await close();
  segmented=true;
  await open();
  check(JSON.parse(alice.core.checkpointJson()).rootCheckpoint===legacy[0]&&
   JSON.parse(bob.core.checkpointJson()).rootCheckpoint===legacy[1],"Exact legacy journals must become immutable roots");
  const first=[alice.core.checkpointJson(),bob.core.checkpointJson()];
  await close();
  await open();
  check(alice.recovered&&bob.recovered,"Both peers must reopen persisted storage");
  check(alice.core.checkpointJson()===first[0]&&bob.core.checkpointJson()===first[1],"Reopen must preserve exact rollover bytes");
  check(alice.core.undo(),"Pre-boundary Undo must survive the generation and reopen");
  await sync();
  check(alice.core.documentJson().includes("offline SDK heading"),"Other peer's offline edit must arrive");
  check(!alice.core.documentJson().includes("xNested idea"),"Pre-boundary Undo must be delivered");
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
  await Promise.all([alice.sealGeneration("two"),bob.sealGeneration("two")]);
  while(completed<115)await round();
  await Promise.all([alice.flush(),bob.flush()]);
  const retained=[alice.core.checkpointJson(),bob.core.checkpointJson()];
  await close();
  await open();
  check(alice.recovered&&bob.recovered,"Both final checkpoints must reopen");
  check(alice.core.checkpointJson()===retained[0]&&bob.core.checkpointJson()===retained[1],"Both final reopen checkpoints must match byte-for-byte");
  await close();
  segmented=false;
  await open();
  check(alice.recovered&&bob.recovered&&alice.core.checkpointJson()===legacy[0]&&bob.core.checkpointJson()===legacy[1],
   "The original databases must remain available for exact recovery");
  return {passed:true,rounds:completed,exactLegacyRoots:2,explicitSeals:2,exactPeerReopens:4,legacyDatabasesReopened:2,
   legacyBytes:legacy.map(value=>new TextEncoder().encode(value).length),
   offlineEditPreserved:true,preBoundaryUndoAndRedoPreserved:true,
   archiveBytes:retained.map(value=>new TextEncoder().encode(value).length)};
 }finally{
  await Promise.all([alice?.discardAndClose(),bob?.discardAndClose()]);
  peer.free();
 }
}
const result=await verify().catch(error=>({passed:false,reason:String(error).slice(0,250)}));
document.querySelector("#result").textContent=JSON.stringify(result);
