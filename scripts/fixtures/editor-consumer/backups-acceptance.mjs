/** Public-package acceptance shared by the installed Node and native-browser consumers. */
import {SharedPersistentSession,SharedReviewPersistentSession,decodeSharedSessionBackup,decodeSharedPairedSessionBackup,SharedRichEditor,createSharedDocumentEditor,initializeSharedReadOnly} from "@breditor/collaboration";
import {fullscreenSeed} from "./fullscreen-seed.mjs";
const configuration={format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/installed-backups",version:1},extensions:[]};
const check=(condition,message)=>{if(!condition)throw Error(message);},same=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message),deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
async function refuses(operation,code){let failure;try{const owner=await operation();await owner?.discardAndClose();}catch(error){failure=error;}check(failure?.code===code,`Expected ${code}, received ${failure?.code??"acceptance"}`);}
function policy(profile,family,natural,database){
 const paired=family.startsWith("paired-"),search=family.includes("search"),reviewed=family.includes("reviewed"),observer=family.includes("observer"),relay=family.includes("relay")||reviewed||observer,document=paired||family.includes("document"),general=document||family.includes("general"),history=natural?"typing-v1":"explicit",selectionEditing=document?"document-v1":"original",rangeEditing=general?"general-v1":"original";
 const restore=checkpoint=>search?profile.restore_search("room",checkpoint):reviewed?profile.restore_reviewed("room",checkpoint):document?(natural?profile.restore_document_typing("room",checkpoint):profile.restore_document("room",checkpoint)):general?(natural?profile.restore_general_typing("room",checkpoint):profile.restore_general("room",checkpoint)):natural?profile.restore_typing("room",checkpoint):profile.restore("room",checkpoint);
 const review={actor:"installed-backup",principal:"alice",access:observer?"read_only":"comment"},relayIdentity={endpoint:"ws://127.0.0.1:49799/",room:"room",documentWriter:"101",actor:review.actor,principal:"alice",binding:"b".repeat(64),writerTransport:"atomic-v2",...(observer?{reviewEditing:"read_only"}:{})};
 const options={database,room:"room",writer:"101",richLanguage:3,history,selectionEditing,rangeEditing,create:()=>profile.create(fullscreenSeed(JSON.parse(profile.descriptor_json()),3),"101"),restore,restoreDocument:restore,restoreReviewed:restore,restoreSearch:restore,...(paired?{review}:{}),...(relay?{relay:relayIdentity}:{}),...(reviewed?{reviewedHistory:{binding:"a".repeat(64),principal:"alice",effectWriter:"303"}}:{})};
 const open=o=>paired?(search?SharedReviewPersistentSession.openSearch(o):reviewed?SharedReviewPersistentSession.openReviewed(o):SharedReviewPersistentSession.open(o)):(search?SharedPersistentSession.openSearch(o):document?SharedPersistentSession.openDocument(o):SharedPersistentSession.open(o)),importBackup=o=>paired?(search?SharedReviewPersistentSession.restoreSearchBackup(o):reviewed?SharedReviewPersistentSession.restoreReviewedBackup(o):SharedReviewPersistentSession.restoreBackup(o)):(search?SharedPersistentSession.restoreSearchBackup(o):document?SharedPersistentSession.restoreDocumentBackup(o):SharedPersistentSession.restoreBackup(o)),snapshot=owner=>paired?JSON.stringify(owner.exportRecovery()):owner.core.checkpointJson(),identity={room:"room",writer:"101",richLanguage:3,history,rangeEditing,selectionEditing,searchHistory:search?"search-v1":null};
 return{options,paired,observer,identity,open,importBackup,snapshot};
}
function journalDatabase(name,version){return new Promise((resolve,reject)=>{
 const request=version===undefined?indexedDB.open(name):indexedDB.open(name,version);let blocked=false;
 request.onblocked=()=>{blocked=true;reject(Error("Live journal upgrade was blocked"));};
 request.onerror=()=>reject(request.error);
 request.onupgradeneeded=event=>{
  if(event.oldVersion!==1||version!==2){request.transaction.abort();return;}
  request.result.createObjectStore("upgrade-marker");
 };
 request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
});}
function readJournal(db){return new Promise((resolve,reject)=>{
 const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get(["room","101"]);
 tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
});}
async function recoverLiveUpgrade(p){
 const database=p.options.database;let source,target,inspection,upgraded;
 try{
  source=await p.open(p.options);
  const point={block:"z-intro",offset:"1",affinity:"after"};
  source.core.select({kind:"text",anchor:point,focus:point});await source.flush();
  const original=source.core.documentJson();
  inspection=await journalDatabase(database);
  const committed=await readJournal(inspection);
  check(committed!==undefined,"The live source needs an exact committed journal");
  const prototype=Object.getPrototypeOf(inspection.transaction("journals").objectStore("journals")),put=prototype.put;
  inspection.close();inspection=undefined;
  let aborted=0,failed=false;
  prototype.put=function(...args){
   const request=put.apply(this,args);
   if(this.name==="journals"&&this.transaction.db.name===database){
    request.addEventListener("success",()=>{aborted++;this.transaction.abort();},{once:true});
   }
   return request;
  };
  try{
   check(source.core.type("Unsaved 🙂"),"The live owner must accept the unsaved edit");
   if(p.paired){
    const anchorJson=source.core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"z-intro"}});
    check(source.core.dispatchReview({kind:"create_thread",data:{anchorJson,body:"Unsaved discussion"}}).kind==="committed","The paired owner must accept the unsaved discussion");
   }
   try{await source.flush();}catch{failed=true;}
  }finally{prototype.put=put;}
  check(failed&&aborted>0,"The staged native checkpoint write must abort before the upgrade");
  const current=p.snapshot(source);
  upgraded=await journalDatabase(database,2);
  check(upgraded.version===2&&upgraded.objectStoreNames.contains("upgrade-marker"),"The live source must unblock the real database upgrade");
  same(await readJournal(upgraded),committed,"The upgrade must preserve the exact last committed record");
  check(source.state().status==="failed"&&p.snapshot(source)===current,"Retirement must retain the exact unsaved native history");
  await refuses(async()=>source.core.type("Refuse retired writer"),"retired");
  const backupJson=await source.exportBackup(),{create,...options}=p.options;
  const recovery={...options,database:`${database}-recovered`,backupJson,writerRecovery:"host-reacquired"};
  await refuses(()=>p.importBackup(recovery),"writer_in_use");
  if(p.paired)await refuses(()=>p.open({...p.options,database:`${database}-competing-review`,writer:"202",create:()=>{throw Error("The held review lease must refuse before native creation");}}),"review_writer_in_use");
  await source.discardAndClose();source=undefined;
  target=await p.importBackup(recovery);
  check(target.recovered&&p.snapshot(target)===current,"The fresh destination must recover the exact uncommitted cut");
  await target.close();target=undefined;
  target=await p.open({...p.options,database:recovery.database});
  check(target.recovered&&p.snapshot(target)===current,"The uncommitted source cut must reopen exactly from the new database");
  check(target.core.undo()&&target.core.documentJson()===original,"The recovered unsaved document edit must remain reversible");
  if(p.paired)check(target.core.undoReview().kind==="committed","The recovered unsaved discussion must remain reversible");
  await target.close();target=undefined;
  return {paired:p.paired,upgraded:true,reopened:true};
 }finally{inspection?.close();upgraded?.close();await source?.discardAndClose();await target?.discardAndClose();}
}
export async function runBackupAcceptance(wasm){
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify(configuration)),prefix=`installed-backups-${crypto.randomUUID()}`,reloadRecords=[];let cases=0,existingRefusals=0,liveCloneRefusals=0,integrityRefusals=0,futureHistoryChecks=0,nativeRecoveryOriginReads=0,nativeRecoveryOriginRollbackRefusals=0;
 try{for(const natural of [false,true])for(const family of ["original","general","document","document-search","paired-local","paired-relay","paired-observer","paired-reviewed","paired-search","paired-search-reviewed"]){
  const database=`${prefix}-${natural}-${family}`,p=policy(profile,family,natural,`${database}-source`);let source,target,origin;try{
   source=await p.open(p.options);const point={block:"z-intro",offset:"1",affinity:"after"};source.core.select({kind:"text",anchor:point,focus:point});if(natural)source.core.typeUser("Archive🙂","10");else source.core.type("Archive🙂");source.core.undo();
   if(p.paired){if(!p.observer){const anchorJson=source.core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"z-intro"}});check(source.core.dispatchReview({kind:"create_thread",data:{anchorJson,body:"Archived comment"}}).kind==="committed","Create comment");source.core.undoReview();}source.saveVersion("Archive","1792300000000");}await source.flush();
   const before=p.snapshot(source),backupJson=await source.exportBackup();check(p.snapshot(source)===before,"Export must be pure");const {create,...rest}=p.options,recovery={...rest,database,backupJson,writerRecovery:"host-reacquired"};await refuses(()=>p.importBackup(recovery),"writer_in_use");liveCloneRefusals++;
   const tampered=JSON.parse(backupJson),field=p.paired?"recordJson":"checkpointJson";tampered[field]+="\n";await refuses(()=>p.paired?decodeSharedPairedSessionBackup(JSON.stringify(tampered),p.identity):decodeSharedSessionBackup(JSON.stringify(tampered),p.identity),"backup_integrity");integrityRefusals++;
   const selected=JSON.parse(backupJson),pairedRecord=p.paired?JSON.parse(selected.recordJson):undefined,raw=initializeSharedReadOnly(p.options.restore(pairedRecord?pairedRecord.documentCheckpointJson:selected.checkpointJson),true),editor={...(family.includes("search")?{searchHistory:"search-v1"}:{}),...(p.options.reviewedHistory?{reviewedHistory:p.options.reviewedHistory}:{})};origin=p.identity.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):new SharedRichEditor(raw,editor);if(pairedRecord)origin.enableReview({...p.options.review,access:"read_only"},pairedRecord.reviewCheckpointJson);
   await source.close();source=undefined;target=await p.importBackup(recovery);check(target.recovered&&target.state().status==="saved","Only committed imports become saved");check(p.snapshot(target)===before,"Exact native archive restore");check(target.core.supportsRecoveryOrigin(),"Complete native continuity capability");target.core.verifyRecoveryOrigin(origin);nativeRecoveryOriginReads++;check(p.snapshot(target)===before,"Native continuity must be pure");await target.close();target=undefined;await refuses(()=>p.importBackup(recovery),"backup_destination_exists");existingRefusals++;
   target=await p.open({...p.options,database});check(p.snapshot(target)===before,"Exact reopen after occupied-key refusal");target.core.redo();if(p.paired&&!p.observer)target.core.redoReview();const after=p.snapshot(target);check(after!==before,"Redo remains available");await target.flush();await target.close();target=undefined;target=await p.open({...p.options,database});check(p.snapshot(target)===after,"Persist future document/comment transitions");futureHistoryChecks++;target.core.verifyRecoveryOrigin(origin);nativeRecoveryOriginReads++;let rollback;try{origin.verifyRecoveryOrigin(target.core);}catch(error){rollback=error.code;}check(rollback==="recovery_origin","An older native owner cannot claim a newer selected history");nativeRecoveryOriginRollbackRefusals++;check(p.snapshot(target)===after,"Continuity/refusal must not change current history");
   await target.close();target=undefined;reloadRecords.push({family,natural,database,expected:after});cases++;
  }finally{origin?.dispose();await source?.discardAndClose();await target?.discardAndClose();}
 }
 const upgrades=[];for(const paired of [false,true]){
  const started=deferred(),release=deferred(),database=`${prefix}-upgrade-${paired}`,p=policy(profile,paired?"paired-local":"original",false,database);let freed=0,owner;const opening=p.open({...p.options,create:async()=>{const raw=p.options.create(),free=raw.free.bind(raw);raw.free=()=>{freed++;free();};started.resolve();await release.promise;return raw;}}).then(value=>{owner=value;return null;},error=>error.code);await started.promise;
  const first=deferred(),done=deferred(),request=indexedDB.open(database,2);let upgraded;request.onupgradeneeded=()=>request.result.createObjectStore("upgrade-marker");request.onblocked=()=>first.resolve("blocked");request.onerror=()=>{first.resolve("error");done.resolve();};request.onsuccess=()=>{upgraded=request.result;first.resolve("upgraded");done.resolve();};const result=await first.promise;release.resolve();const code=await opening;await owner?.discardAndClose();await done.promise;upgraded?.close();same([result,code,freed],["upgraded",paired?"review_open_versionchange":"session_open_versionchange",1],"Upgrade fences unpublished native owner");upgrades.push({paired,result,code,freed});
 }
 const liveUpgrades=[];
 for(const paired of [false,true])liveUpgrades.push(await recoverLiveUpgrade(policy(profile,paired?"paired-local":"original",false,`${prefix}-live-upgrade-${paired}`)));
 return{passed:true,cases,existingRefusals,liveCloneRefusals,integrityRefusals,futureHistoryChecks,nativeRecoveryOriginReads,nativeRecoveryOriginRollbackRefusals,upgrades,liveUpgrades,reloadRecords};
 }finally{profile.free();}
}
export async function reopenBackupAcceptance(wasm,records){const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify(configuration));let exactReopens=0;try{for(const record of records){const p=policy(profile,record.family,record.natural,record.database),owner=await p.open(p.options);try{check(owner.recovered&&p.snapshot(owner)===record.expected,"Reload must recover the exact complete durable record");exactReopens++;}finally{await owner.close();}}return{passed:true,exactReopens};}finally{profile.free();}}
