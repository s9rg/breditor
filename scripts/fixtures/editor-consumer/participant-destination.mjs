import {createSharedProfile} from "@breditor/editor/collaboration";
import {RichAssetStore} from "@breditor/editor";
import {SharedGenerationParticipantRecovery as Recovery,SharedSegmentedPersistentSession as Session,SharedRichEditor,captureSharedGenerationParticipant,restoreSharedSegmentedEditor} from "@breditor/collaboration";
import {range,seed} from "./seed.mjs";

const check=(ok,message)=>{if(!ok)throw Error(message);};
const exact=JSON.stringify,names=["generation_files","generation_heads"],foreign=["foreign","foreign","foreign"];
function database(name){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(name);
  request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
 });
}
function transaction(db,mode,work){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(names,mode),requests=work(tx);
  tx.oncomplete=()=>resolve(requests.map(request=>request.result));tx.onabort=()=>reject(tx.error);
 });
}
const rows=db=>transaction(db,"readonly",tx=>names.flatMap(name=>{
 const os=tx.objectStore(name);return[os.getAllKeys(),os.getAll()];
}));
async function failure(operation){
 try{const unexpected=await operation();await unexpected.discardAndClose();return null;}
 catch(error){return error.code??error.name;}
}
async function verify(continued){
 const profile=await createSharedProfile(),parsed=JSON.parse(seed(JSON.parse(profile.descriptor_json())));
 // This custody case uses a text-only source so its empty asset store is independently recoverable.
 parsed.root.children=parsed.root.children.filter(block=>["intro","ideas"].includes(block.properties?.["breditor/block-id"]));
 const document=exact(parsed),room="room",writer="101",actor="recovery-comments",destination="exact-participant-source",kind=continued?"continued-local":"local";
 let session,store,backup,peer,attempt,ready,outside,acquired;
 const reader=IDBFactory.prototype.open,close=IDBDatabase.prototype.close,count=IDBObjectStore.prototype.count;
 let native=0;
 const restore=checkpoint=>{native++;return restoreSharedSegmentedEditor(profile,room,checkpoint);};
 const profileReplay={restore_segmented(...args){native++;return profile.restore_segmented(...args);},
  restore_continued_history(...args){native++;return profile.restore_continued_history(...args);}};
 const options={room,writer,richLanguage:1,history:"explicit",rangeEditing:"original",selectionEditing:"original",searchHistory:null,reviewedHistory:null,
  readOnly:false,review:{actor,principal:"alice",access:"comment"},restoreSegmented:restore};
 const openOptions={...options,database:"original-source",initialGenerations:{root:"root",active:"one"},create:()=>profile.create(document,writer)};
 try{
  session=await Session.open(openOptions);
  peer=new SharedRichEditor(profile.join_frame(room,"202",session.core.updateFrame()));
  peer.select(range("first-head",0));check(peer.type("Held offline peer packet "),"Make the original offline peer packet");
  const offline=peer.updateFrame();
  session.core.select(range("deep-head",0));check(session.core.type("Recover pre-cut redo ")&&session.core.undo(),"Populate the original document Redo");
  const anchorJson=session.core.captureReviewAnchor({kind:"document"});
  check(session.core.dispatchReview({kind:"create_thread",data:{anchorJson,body:"Recover pre-cut comment redo"}}).kind==="committed","Populate the original review");
  check(session.core.undoReview().kind==="committed","Populate the original review Redo");
  await session.sealGeneration("two");
  const predecessor=session.exportRecovery();
  const {restoreSegmented:_restore,...common}=options;
  const continuation={...common,database:openOptions.database,profile:profileReplay};
  if(continued){
   await session.close();session=undefined;
   session=await Session.continueHistory({...continuation,expected:predecessor,nextGeneration:"three"});
  }
  store=await RichAssetStore.open("original-uploads");
  const capture=await captureSharedGenerationParticipant({participant:"alice",principal:"alice",source:{kind,session},assets:store,checkAuthority(){}});
  check(capture.kind==="ready","Capture the exact native source and empty uploads");backup=capture.backup;
  const retained=continued?await session.exportContinuedBackup():session.exportRecovery();
  await session.close();session=undefined;store.close();store=undefined;
  const config={database:"participant-recovery-ledger",expected:backup.selection(),destinations:{source:destination,uploads:"restored-uploads"},
   session:{kind,options:continued?{...common,profile:profileReplay}:options},checkAuthority(){}};
  attempt=await Recovery.begin({...config,backup});ready=await attempt.finish();
  await ready.discardAndClose();ready=undefined;await attempt.close();attempt=undefined;
  outside=await database(destination);
  const originalRows=await rows(outside),nativeBefore=native;

  attempt=await Recovery.resume(config);
  let inserted;
  IDBObjectStore.prototype.count=function(...args){
   const request=count.apply(this,args);
   if(this.name===names[0]&&this.transaction.db.name===destination&&!inserted)request.addEventListener("success",()=>{
    inserted??=transaction(outside,"readwrite",tx=>[tx.objectStore(names[0]).add("preserve foreign row",foreign)]);
   },{once:true});
   return request;
  };
  const refused=await failure(()=>attempt.finish());
  IDBObjectStore.prototype.count=count;
  await inserted;
  const mixed=await rows(outside),foreignIndex=mixed[0].findIndex(key=>exact(key)===exact(foreign));
  check(refused==="generation_participant_diverged"&&inserted&&foreignIndex>=0&&mixed[1][foreignIndex]==="preserve foreign row"&&native===nativeBefore,
   `A competing foreign row must refuse before native replay (${refused}, ${native-nativeBefore} native calls, ${foreignIndex})`);
  mixed[0].splice(foreignIndex,1);mixed[1].splice(foreignIndex,1);
  check(exact(mixed)===exact(originalRows),"The refused run must keep every original generation row exact");
  await attempt.close();attempt=undefined;
  await transaction(outside,"readwrite",tx=>[tx.objectStore(names[0]).delete(foreign)]);
  check(exact(await rows(outside))===exact(originalRows),"Remove only the fixture's foreign row before the retry");

  const controller=new AbortController();
  attempt=await Recovery.resume({...config,signal:controller.signal});
  let closes=0;
  IDBFactory.prototype.open=function(...args){
   const request=reader.apply(this,args);
   if(args[0]===destination)request.addEventListener("success",()=>{acquired=request.result;controller.abort();},{once:true});
   return request;
  };
  IDBDatabase.prototype.close=function(...args){if(this===acquired)closes++;return close.apply(this,args);};
  const cancelled=await failure(()=>attempt.finish());
  IDBFactory.prototype.open=reader;IDBDatabase.prototype.close=close;
  check(acquired&&cancelled==="asset_bytes_aborted"&&closes===1&&native===nativeBefore,
   `Cancellation after destination open must close the real selected handle before replay (${cancelled}, ${closes}, ${native-nativeBefore})`);
  acquired=undefined;
  await attempt.close();attempt=undefined;
  check(exact(await rows(outside))===exact(originalRows),"Cancellation must preserve the exact already complete destination");
  attempt=await Recovery.resume(config);ready=await attempt.finish();
  const parts=await ready.intoParts();ready=undefined;session=parts.source.session;store=parts.uploads;
  check(exact(continued?await session.exportContinuedBackup():session.exportRecovery())===exact(retained),"Retry must return the exact original document, review and predecessor");
  await session.core.receiveFrame(offline);
  const after=session.core.documentJson();
  check(after.includes("Held offline peer packet ")&&!after.includes("Recover pre-cut redo "),"The original offline peer frame must still apply");
  check(session.core.redo()&&session.core.documentJson().includes("Recover pre-cut redo ")&&session.core.undo()&&session.core.documentJson()===after,
   "Native document Redo and Undo must recover precisely around the offline edit");
  const review=session.core.reviewSnapshot().view;
  check(session.core.redoReview().kind==="committed"&&session.core.undoReview().kind==="committed"&&exact(session.core.reviewSnapshot().view.threads)===exact(review.threads),
   "Native review Redo and Undo must preserve the recovered discussion projection");
  return {passed:true,continued,foreignRowRefusedBeforeReplay:true,cancelledOpenReleased:true,exactRecoverableRows:true,offlineDocumentAndReviewHistory:true};
 }finally{
  IDBFactory.prototype.open=reader;IDBDatabase.prototype.close=close;IDBObjectStore.prototype.count=count;
  acquired?.close();outside?.close();await ready?.discardAndClose();await attempt?.close();await session?.discardAndClose();store?.close();backup?.dispose();peer?.dispose();profile.free();
 }
}
const result=await verify(new URLSearchParams(location.search).has("continued")).catch(error=>({passed:false,reason:String(error)}));
document.querySelector("#result").textContent=exact(result);
