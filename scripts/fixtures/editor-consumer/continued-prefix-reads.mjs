import {createSharedProfile} from "@breditor/editor/collaboration";
import {SharedPersistentSession,SharedSegmentedPersistentSession,restoreSharedSegmentedEditor} from "@breditor/collaboration";
import {seed,range} from "./seed.mjs";

const check=(condition,message)=>{if(!condition)throw Error(message);};
const exact=JSON.stringify,encode=new TextEncoder();
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",encode.encode(value)))].map(byte=>byte.toString(16).padStart(2,"0")).join("");

async function countImmutableReads(database,work){
 const nativeGet=IDBObjectStore.prototype.get,nativeGetAll=IDBObjectStore.prototype.getAll;
 const transactions=new Map();
 const measure=native=>function(key,...args){
  const request=native.call(this,key,...args),tx=this.transaction;
  if(this.name==="generation_files"&&tx.db.name===database&&tx.mode==="readonly"){
   let reads=transactions.get(tx);
   if(!reads)transactions.set(tx,reads=[]);
   const read={generation:key.at(-1),bytes:0};
   reads.push(read);
   request.addEventListener("success",()=>{
    const raw=Array.isArray(request.result)?request.result[0]:request.result;
    if(typeof raw==="string")read.bytes=encode.encode(raw).byteLength;
   });
  }
  return request;
 };
 IDBObjectStore.prototype.get=measure(nativeGet);
 IDBObjectStore.prototype.getAll=measure(nativeGetAll);
 try{
  const value=await work(),samples=[...transactions.values()].map(reads=>({
   records:reads.length,logicalBytes:reads.reduce((sum,row)=>sum+row.bytes,0),
   distinctRecords:new Set(reads.map(row=>row.generation)).size,
  }));
  return {value,samples};
 }finally{IDBObjectStore.prototype.get=nativeGet;IDBObjectStore.prototype.getAll=nativeGetAll;}
}
function databaseOperation(database,mode,operation){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(database,1);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction("generation_heads",mode),work=operation(tx.objectStore("generation_heads"));
   tx.oncomplete=()=>{db.close();resolve(work.result);};
   tx.onabort=()=>{db.close();reject(tx.error);};
  };
 });
}

async function verify(){
 const profile=await createSharedProfile(),document=seed(JSON.parse(profile.descriptor_json())),Session=SharedSegmentedPersistentSession;
 const room="room",writer="101",database="continued-prefix-source",restoredDatabase="continued-prefix-restored",predecessorKey=[room,writer,"continued-from"];
 const options={profile,database,room,writer,richLanguage:1,history:"explicit",rangeEditing:"original",selectionEditing:"original",searchHistory:null,reviewedHistory:null,
  readOnly:false,review:{actor:"shared-prefix-comments",principal:"alice",access:"comment"},
 };
 let owner,peer;
 try{
  owner=await Session.open({...options,initialGenerations:{root:"root",active:"one"},create:()=>profile.create(document,writer),
   restoreSegmented:checkpoint=>restoreSharedSegmentedEditor(profile,room,checkpoint)});
  peer=await SharedPersistentSession.open({database:"continued-prefix-peer",room,writer:"202",richLanguage:1,history:"explicit",rangeEditing:"original",readOnly:false,
   create:()=>profile.join_frame(room,"202",owner.core.updateFrame()),restore:checkpoint=>profile.restore(room,checkpoint)});
  peer.core.select(range("intro",0));check(peer.core.type("offline preserved "),"Capture an independent offline packet before the cut");
  const offline=peer.core.updateFrame();
  for(const next of ["two","three","four","five"]){
   for(let index=0;index<4;index++){
    owner.core.select(range("deep-head",0));
    check(owner.core.type(`Retained ${next} edit ${index} `),"The prefix must contain real native edits");
   }
   await owner.sealGeneration(next);
  }
  owner.core.select(range("deep-head",0));check(owner.core.type("untouched continuation redo ")&&owner.core.undo(),"The V1 cut must contain an untouched Redo");
  const anchorJson=owner.core.captureReviewAnchor({kind:"document"});
  check(owner.core.dispatchReview({kind:"create_thread",data:{anchorJson,body:"Retained continued discussion"}}).kind==="committed","The paired review journal must be populated");
  await owner.flush();
  const prior=owner.exportRecovery();
  await owner.close();owner=undefined;
  owner=await Session.continueHistory({...options,expected:prior,nextGeneration:"six"});
  owner.core.select(range("first-head",0));check(owner.core.type("V2 extension ")&&owner.core.undo(),"The continued cut must extend the original history");
  await owner.sealGeneration("seven");
  const expected=await owner.exportContinuedBackup();
  check(exact(expected.predecessor)===exact(prior),"The retained predecessor must contain the exact V1 cut");
  await owner.close();owner=undefined;
  const opening=await countImmutableReads(database,()=>Session.openContinued(options));
  owner=opening.value;
  const backing=await countImmutableReads(database,()=>owner.exportContinuedBackup());
  check(exact(backing.value)===exact(expected)&&exact(owner.exportContinuedRecovery())===exact(expected.current),"Cold open and export must recover both exact native cuts");
  await owner.close();owner=undefined;

  const predecessor=await databaseOperation(database,"readonly",store=>store.get(predecessorKey));
  const malformed=JSON.parse(predecessor);malformed.root.sha256="f".repeat(64);
  const different=exact(malformed);
  await databaseOperation(database,"readwrite",store=>store.put(different,predecessorKey));
  let refused;
  try{owner=await Session.openContinued(options);}catch(error){refused=error?.code;}
  check(!owner&&refused==="segmented_storage"&&await databaseOperation(database,"readonly",store=>store.get(predecessorKey))===different,
   "A predecessor sharing a file ID but advertising different bytes must refuse without writing");
  await databaseOperation(database,"readwrite",store=>store.put(predecessor,predecessorKey));

  owner=await Session.restoreContinuedRecovery({...options,database:restoredDatabase,backup:backing.value,writerRecovery:"host-reacquired"});
  await owner.close();owner=undefined;
  const reopening=await countImmutableReads(restoredDatabase,()=>Session.openContinued({...options,database:restoredDatabase}));
  owner=reopening.value;
  check(exact(await owner.exportContinuedBackup())===exact(expected),"A separate cold restore must retain both exact cuts");
  await owner.core.receiveFrame(offline);
  const baseline=owner.core.documentJson();
  check(baseline.includes("offline preserved ")&&!baseline.includes("V2 extension "),"Cold continuation applies the original offline packet independently of local Redo");
  check(owner.core.redo()&&owner.core.documentJson().includes("V2 extension "),"Continued native Redo must still restore its exact local change");
  check(owner.core.undo()&&owner.core.documentJson()===baseline,"Continued native Undo must retain the exact offline edit");
  return {passed:true,open:opening.samples,export:backing.samples,coldRestoredOpen:reopening.samples,predecessorSha256:await sha(exact(prior)),backupSha256:await sha(exact(expected)),
   predecessorMismatchRefused:true,exactBothCuts:true,coldNativeUndoRedoAndOffline:true};
 }finally{await owner?.discardAndClose();await peer?.discardAndClose();profile.free();}
}
const result=await verify().catch(error=>({passed:false,reason:String(error)}));
document.querySelector("#result").textContent=exact(result);
