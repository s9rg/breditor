import {createSharedProfile} from "@breditor/editor/collaboration";
import {SharedIndependentHistoryPersistentSession,SharedPersistentSession,SharedSegmentedPersistentSession,restoreSharedSegmentedEditor} from "@breditor/collaboration";
import {seed,range} from "./seed.mjs";

const check=(condition,message)=>{if(!condition)throw Error(message);};
const exact=value=>JSON.stringify(value);
function openDatabase(name){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(name,1);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
function access(db,names,mode,read){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(names,mode),result=read(tx);
  tx.oncomplete=()=>resolve(result.map(request=>request.result));tx.onabort=()=>reject(tx.error);
 });
}

export async function verifyOccupiedGenerationFile(independent){
 const profile=await createSharedProfile(),document=seed(JSON.parse(profile.descriptor_json())),database=`occupied-generation-file-${crypto.randomUUID()}`;
 const room="room",writer="101",actor="occupied-generation-comments",key=[room,writer];
 const files=independent?"history_files":"generation_files",heads=independent?"history_heads":"generation_heads";
 const occupied=[...key,...(independent?["document"]:[]),"one"];
 const options={database,room,writer,richLanguage:1,history:"explicit",rangeEditing:"original",selectionEditing:"original",searchHistory:null,reviewedHistory:null,
  readOnly:false,review:{actor,principal:"alice",access:"comment"},create:()=>profile.create(document,writer),
 };
 const initialGenerations={root:"root",active:"one"},restoreSegmented=checkpoint=>restoreSharedSegmentedEditor(profile,room,checkpoint);
 const open=()=>independent?SharedIndependentHistoryPersistentSession.open({...options,documentHistory:{kind:"segmented-v1",initialGenerations,restoreSegmented},
  reviewHistory:{kind:"segmented-v1",initialGenerations}}):SharedSegmentedPersistentSession.open({...options,initialGenerations,restoreSegmented});
 let owner,peer,db;
 const rows=()=>access(db,[heads,files],"readonly",tx=>[tx.objectStore(heads).getAllKeys(),tx.objectStore(heads).getAll(),tx.objectStore(files).getAllKeys(),tx.objectStore(files).getAll()]);
 const ownsBoth=async()=>{
  const names=new Set((await navigator.locks.query()).held.map(lock=>lock.name));
  return [`breditor:shared-writer:${exact(key)}`,`breditor:review-writer:${exact([room,actor])}`].filter(name=>names.has(name)).length;
 };
 try{
  owner=await open();
  peer=await SharedPersistentSession.open({database:database+"-peer",room,writer:"202",richLanguage:1,history:"explicit",rangeEditing:"original",readOnly:false,
   create:()=>profile.join_frame(room,"202",owner.core.updateFrame()),restore:checkpoint=>profile.restore(room,checkpoint)});
  peer.core.select(range("intro",0));check(peer.core.type("held offline "),"The offline writer must create a real update");
  const offlineFrame=peer.core.updateFrame();
  await peer.flush();
  owner.core.select(range("deep-head",0));
  check(owner.core.type("untouched before seal ")&&owner.core.undo(),"The source must retain an untouched Redo");
  const anchorJson=owner.core.captureReviewAnchor({kind:"document"});
  check(owner.core.dispatchReview({kind:"create_thread",data:{anchorJson,body:"Retained across refused rotation"}}).kind==="committed","The exact review journal must be populated");
  await owner.flush();
  const previousState=owner.state();
  db=await openDatabase(database);
  const durable=await rows();
  await access(db,files,"readwrite",tx=>[tx.objectStore(files).add(undefined,occupied)]);
  const malformed=await rows(),slot=malformed[2].findIndex(row=>exact(row)===exact(occupied));
  check(slot>=0&&malformed[3][slot]===undefined&&malformed[2].length===durable[2].length+1,"The future immutable key must actually contain structured undefined");
  const add=IDBObjectStore.prototype.add;
  let refusedCode,occupiedAdds=0;
  try{
   IDBObjectStore.prototype.add=function(...args){
    if(this.transaction.db.name===database&&this.name===files&&exact(args[1])===exact(occupied))occupiedAdds++;
    return add.apply(this,args);
   };
   try{await (independent?owner.sealDocumentGeneration("two"):owner.sealGeneration("two"));}
   catch(error){refusedCode=typeof error.code==="string"?error.code:error.name;}
  }finally{IDBObjectStore.prototype.add=add;}
  const failed=owner.state(),sealed=owner.exportRecovery();
  check(refusedCode===(independent?"independent_history_storage":"segmented_storage")&&occupiedAdds===0,`The existing malformed immutable key must refuse before add (${refusedCode}, ${occupiedAdds} add calls)`);
  check(failed.status==="failed"&&failed.documentRevision===previousState.documentRevision&&failed.reviewRevision===previousState.reviewRevision&&
   exact(await rows())===exact(malformed)&&await ownsBoth()===2,"A refused rotation must preserve durable rows, acknowledgement and both leases");
  await access(db,files,"readwrite",tx=>[tx.objectStore(files).delete(occupied)]);
  check(exact(await rows())===exact(durable),"The fixture must remove only its injected key before retry");
  await owner.retry();
  check(owner.state().status==="saved"&&exact(owner.exportRecovery())===exact(sealed),"The retried rotation must acknowledge the exact attempted cut");
  await owner.close();owner=undefined;
  check(await ownsBoth()===0,"Closing a retried writer must release both real leases");
  owner=await open();
  check(owner.recovered&&exact(owner.exportRecovery())===exact(sealed),"Cold reopen must recover the exact document and review journals");
  await owner.core.receiveFrame(offlineFrame);
  const recovered=owner.core.documentJson();
  check(recovered.includes("held offline ")&&!recovered.includes("untouched before seal "),"The original offline packet must apply without consuming Redo");
  check(owner.core.redo()&&owner.core.documentJson().includes("untouched before seal "),"Cold native Redo must restore the pre-cut edit");
  check(owner.core.undo()&&owner.core.documentJson()===recovered,"Cold native Undo must preserve the exact offline edit");
  await owner.close();owner=undefined;
  return {passed:true,independent,occupiedAdds,refusedCode,exactDurableRefusal:true,exactRetriedRecovery:true,heldAndReleasedLeases:true,offlineUndoRedo:true};
 }finally{db?.close();await owner?.discardAndClose();await peer?.discardAndClose();profile.free();}
}
