/** Bare installed imports and actual browser image/IDB/Web Crypto; no synthetic decoder or network. */
import {RichAssetStore,readRichAssetBackup,openLocalEditor,ASSET_BACKUP_MIME} from "@breditor/editor";
import {RichAssetStore as DirectStore} from "@breditor/experimental-rich-content";
const host=document.querySelector("#editor"),errors=[],check=(condition,message)=>{if(!condition)throw Error(message);},same=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message);let editor,store,expected;
const sha=async blob=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,"0")).join("");
async function imageFile(mime,color){const canvas=document.createElement("canvas");canvas.width=3;canvas.height=2;const paint=canvas.getContext("2d");paint.fillStyle=color;paint.fillRect(0,0,3,2);const blob=await new Promise(done=>canvas.toBlob(done,mime));check(blob?.type===mime,"Browser must encode the requested PNG/JPEG/WebP fixture");return new File([blob],`owned.${mime.split("/")[1]}`,{type:mime});}
async function refuses(operation,code){let failure;try{const owner=await operation();owner?.close();}catch(error){failure=error;}check(failure?.code===code,`Expected ${code}; received ${failure?.code??"acceptance"}`);}
async function exactEmptyAssetRestore(archive,expectedSha256,prefix){
 for(const foreignMetadata of [true,false]){
  const database=prefix+(foreignMetadata?"-foreign-metadata":"-foreign-index");
  await new Promise((resolve,reject)=>{
   const open=indexedDB.open(database,1);
   open.onupgradeneeded=()=>{
    const assets=open.result.createObjectStore("assets",{keyPath:"asset"});
    if(!foreignMetadata)assets.createIndex("foreign","status");
    const metadata=open.result.createObjectStore("metadata");
    metadata.add(0,"bytes");
    if(foreignMetadata)metadata.add({note:"keep exact foreign metadata",bytes:[8,1,4]},"foreign");
   };
   open.onsuccess=()=>{open.result.close();resolve();};open.onerror=()=>reject(open.error);
  });
  await refuses(()=>RichAssetStore.restoreBackup(database,archive,{uploadState:"preserve"}),foreignMetadata?"asset_backup_destination_exists":"asset_backup_storage");
  const db=await new Promise((resolve,reject)=>{
   const open=indexedDB.open(database);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  try{
   const retained=await new Promise((resolve,reject)=>{
    const tx=db.transaction(["assets","metadata"],"readonly"),assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata");
    const rows=assets.count(),keys=metadata.getAllKeys(),values=metadata.getAll(),indices=Array.from(assets.indexNames);
    tx.oncomplete=()=>resolve({rows:rows.result,keys:keys.result,values:values.result,indices});
    tx.onabort=()=>reject(tx.error);
   });
   same(retained,{rows:0,keys:foreignMetadata?["bytes","foreign"]:["bytes"],
    values:foreignMetadata?[0,{note:"keep exact foreign metadata",bytes:[8,1,4]}]:[0],indices:foreignMetadata?[]:["foreign"]},
    "Refused ordinary restore must preserve the destination exactly");
  }finally{db.close();}
 }
 const empty=prefix+"-exact-empty",existing=await RichAssetStore.open(empty);existing.close();
 const installed=await RichAssetStore.restoreBackup(empty,archive,{uploadState:"preserve"});
 try{check(await sha(await installed.exportBackup())===expectedSha256,"An existing exact-empty destination must still accept the archive");}
 finally{installed.close();}
 const reopened=await RichAssetStore.openRetained(empty);
 try{check(await sha(await reopened.exportBackup())===expectedSha256,"Accepted ordinary restore must cold reopen through retained admission");}
 finally{reopened.close();}
 return true;
}
async function assetRestoreBootstrapBoundary(archive,expectedSha256,prefix){
 const database=prefix+"-cancel-in-upgrade",controller=new AbortController(),open=IDBFactory.prototype.open;
 let upgrades=0;
 try{
  IDBFactory.prototype.open=function(name,...args){
   const request=open.call(this,name,...args);
   if(name===database)request.addEventListener("upgradeneeded",event=>{
    if(event.oldVersion===0){upgrades++;controller.abort();}
   },{once:true});
   return request;
  };
  await refuses(()=>RichAssetStore.restoreBackup(database,archive,{uploadState:"preserve",signal:controller.signal}),"asset_backup_aborted");
 }finally{IDBFactory.prototype.open=open;}
 check(upgrades===1&&controller.signal.aborted,"The first native schema upgrade must trigger cancellation");
 check(!(await indexedDB.databases()).some(entry=>entry.name===database),"Cancelling before schema bootstrap must preserve the absent destination");
 const owner=await RichAssetStore.restoreBackup(database,archive,{uploadState:"preserve"});
 try{check(await sha(await owner.exportBackup())===expectedSha256,"Retry must commit exact raster bytes and queue");}
 finally{owner.close();}
 const reopened=await RichAssetStore.openRetained(database);
 try{check(await sha(await reopened.exportBackup())===expectedSha256,"Cold read must preserve the exact imported archive");}
 finally{reopened.close();}
 return true;
}
async function assetRestoreCommitBoundary(archive,expectedSha256,prefix){
 for(const cancelBeforeCommit of [true,false]){
  const database=prefix+(cancelBeforeCommit?"-abort-before-commit":"-abort-after-commit"),controller=new AbortController();
  const add=IDBObjectStore.prototype.add;
  let triggered=0,owner,failure,armed=false;
  try{
   IDBObjectStore.prototype.add=function(...args){
    const request=add.apply(this,args),tx=this.transaction;
    if(!armed&&this.name==="assets"&&tx.db.name===database){
     armed=true;
     const cancel=()=>{triggered++;controller.abort();};
     if(cancelBeforeCommit)request.addEventListener("success",cancel,{once:true});
     else{
      const commit=tx.oncomplete;
      tx.oncomplete=function(event){commit.call(this,event);cancel();};
     }
    }
    return request;
   };
   try{owner=await RichAssetStore.restoreBackup(database,archive,{uploadState:"preserve",signal:controller.signal});}
   catch(error){failure=error;}
   finally{IDBObjectStore.prototype.add=add;}
   check(triggered===1&&controller.signal.aborted,"The real IndexedDB event must trigger cancellation");
   if(cancelBeforeCommit){
    check(!owner&&failure?.code==="asset_backup_aborted","Cancellation before commit must refuse the restore");
    owner=await RichAssetStore.open(database);
    same(await owner.list(),[],"Pre-commit cancellation must leave no durable assets");
    await owner.exportBackup();
    owner.close();owner=await RichAssetStore.restoreBackup(database,archive,{uploadState:"preserve"});
   }else if(failure){
    owner=await RichAssetStore.open(database);
    check(await sha(await owner.exportBackup())===expectedSha256,"The rejected outcome left the entire archive durably installed");
    await refuses(()=>RichAssetStore.restoreBackup(database,archive,{uploadState:"preserve"}),"asset_backup_destination_exists");
    throw Error(`Cancellation after commit must acknowledge the exact occupied destination, received ${failure.code}`);
   }
   check(await sha(await owner.exportBackup())===expectedSha256,"Both accepted restores must keep exact archive, queue and raster bytes");
   owner.close();owner=await RichAssetStore.open(database);
   check(await sha(await owner.exportBackup())===expectedSha256,"A later open must preserve the exact committed archive");
  }finally{IDBObjectStore.prototype.add=add;owner?.close();}
 }
 return true;
}
async function closeBeforeUploadProvider(file,database){
 let owner=await RichAssetStore.open(database);
 const put=IDBObjectStore.prototype.put,providerCalls=[];
 try{
  const {asset}=await owner.ingest(file);
  let closes=0;
  IDBObjectStore.prototype.put=function(...args){
   const request=put.apply(this,args),tx=this.transaction;
   if(this.name==="assets"&&tx.db.name===database&&args[0].attempts===1){
    const commit=tx.oncomplete;
    tx.oncomplete=function(event){
     commit.call(this,event);
     // The durable attempt wakes the uploader. Close before its deferred provider call.
     queueMicrotask(()=>{owner.close();closes++;});
    };
   }
   return request;
  };
  try{await owner.flush(async (_info,_blob,signal)=>{
   providerCalls.push(signal.aborted);
   return "abandoned-receipt";
  });}finally{IDBObjectStore.prototype.put=put;}
  check(closes===1,"A real upload attempt must commit before the scheduled store close");
  same(providerCalls,[],`Closing the store must prevent the deferred provider call, saw aborted flags ${JSON.stringify(providerCalls)}`);
  owner=await RichAssetStore.open(database);
  const pending=await owner.get(asset);
  check(pending.status==="pending"&&pending.attempts===1&&pending.storageRef===null,"A closed attempt must remain pending without a receipt");
  check(await sha(await owner.blob(asset))===await sha(file),"The closed attempt must keep the exact raster bytes");
  await owner.flush(async (info,blob,signal)=>{
   providerCalls.push(signal.aborted);
   check(info.asset===asset&&await sha(blob)===await sha(file),"Retry must deliver the original raster bytes");
   return "reopened-receipt";
  });
  owner.close();owner=await RichAssetStore.open(database);
  const uploaded=await owner.get(asset);
  same(providerCalls,[false],"Only the reopened owner may call the provider");
  check(uploaded.status==="uploaded"&&uploaded.attempts===2&&uploaded.storageRef==="reopened-receipt","Retry must durably preserve its exact receipt");
  return true;
 }finally{IDBObjectStore.prototype.put=put;owner.close();}
}
function refusesInventory(operation){let refused=false;try{operation();}catch{refused=true;}check(refused,"Copied, foreign or stale inventory must be rejected");}
async function listMetadata(store,database){
 const getAll=IDBObjectStore.prototype.getAll;
 try{
  IDBObjectStore.prototype.getAll=function(...args){
   if(this.name==="assets"&&this.transaction.db.name===database)throw Error("Metadata enumeration must avoid a bulk raster read");
   return getAll.apply(this,args);
  };
  const metadata=await store.list();
  same(metadata.map(row=>row.asset),metadata.map(row=>row.asset).sort(),"List metadata remains in primary-key order");
  return metadata;
 }finally{IDBObjectStore.prototype.getAll=getAll;}
}
function options(checkpointJson,assetStore){return{host,richLanguage:3,history:"typing-v1",toolbar:()=>[],resolveAsset:binding=>assetStore.resolve(binding.asset),onError:error=>errors.push(String(error)),initial:checkpointJson?{kind:"typingCheckpoint",checkpointJson}:{kind:"empty",blockId:"body"}};}
async function duplicateRasterAdmission(file,database){
 let owner=await RichAssetStore.open(database),raw,otherEditor;
 const otherHost=document.createElement("section");document.body.append(otherHost);
 try{
  const {asset}=await owner.ingest(file);
  await owner.flush(async()=>"existing-receipt");
  const original=await owner.get(asset),archive=await owner.exportBackup(),archiveSha256=await sha(archive);
  const duplicate=()=>owner.cacheRemote(asset,file,"unexpected-replacement-receipt");
  same(await owner.ingest(file),original,"A valid local duplicate keeps its durable upload state");
  same(await duplicate(),original,"A valid remote duplicate keeps its durable receipt");
  check(await sha(await owner.exportBackup())===archiveSha256,"Valid duplicates retain every archive byte");
  raw=await new Promise((resolve,reject)=>{const open=indexedDB.open(database);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  const transact=(mode,issue)=>new Promise((resolve,reject)=>{
   const tx=raw.transaction("assets",mode),request=issue(tx.objectStore("assets"));
   tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
  });
  const row=await transact("readonly",assets=>assets.get(asset));
  const payload=row.payload.slice(0);
  const corrupt=new Uint8Array(payload);corrupt[corrupt.length-1]^=1;
  await transact("readwrite",assets=>assets.put({...row,payload}));

  otherEditor=await openLocalEditor({...options(null,owner),host:otherHost});
  const before=otherEditor.checkpointJson(),outcomes=[];
  for(const operation of [()=>owner.ingest(file),duplicate,
   ()=>otherEditor.insertImageFiles(owner,[file],{parent:{kind:"document"},before:null})]){
   try{await operation();outcomes.push("accepted");}catch(error){outcomes.push(error.code??error.name);}
  }
  same(outcomes,["asset_raster_conflict","asset_raster_conflict","asset_raster_conflict"],
   "Corrupt retained bytes must refuse duplicate admission before publishing a native reference");
  check(otherEditor.checkpointJson()===before,"The refused raster must preserve native history");
  const retained=await transact("readonly",assets=>assets.get(asset));
  same({...retained,payload:Array.from(new Uint8Array(retained.payload))},{...row,payload:Array.from(corrupt)},
   "Duplicate refusal must preserve the occupied row and its receipt");
  await transact("readwrite",assets=>assets.put(row));
  owner.close();owner=await RichAssetStore.openRetained(database);
  check(await sha(await owner.exportBackup())===archiveSha256,"The later exact cold open must preserve the original archive");
  return true;
 }finally{otherEditor?.dispose();otherHost.remove();raw?.close();owner?.close();}
}
async function run(){
 check(RichAssetStore===DirectStore,"Public entry points must share the same asset class");const prefix=`asset-backup-browser-${crypto.randomUUID()}`,source=await RichAssetStore.open(`${prefix}-source`);let target,extra,winner;try{
  const providerCloseFence=await closeBeforeUploadProvider(await imageFile("image/png","#245912"),prefix+"-provider-close");
  await duplicateRasterAdmission(await imageFile("image/png","#412656"),prefix+"-duplicate-admission");
  editor=await openLocalEditor(options(null,source));const png=await imageFile("image/png","#346799"),jpeg=await imageFile("image/jpeg","#a64080"),webp=await imageFile("image/webp","#249f35"),fourth=await imageFile("image/png","#7930ba"),images=await editor.insertImageFiles(source,[png,jpeg],{parent:{kind:"document"},before:null}),webpInfo=await source.ingest(webp);await source.ingest(fourth);const opaqueReceipt="host-receipt:"+String.fromCharCode(0xd800,0,0xdc00)+":🙂";let uploadCalls=0;await source.flush(async info=>{uploadCalls++;if(info.asset===images[0].asset)return opaqueReceipt;throw Error("fixture offline upload");});await source.cancel(images[1].asset);await source.retry(webpInfo.asset);
  const metadata=await listMetadata(source,`${prefix}-source`);same(metadata.map(r=>r.status).sort(),["cancelled","failed","pending","uploaded"],"Retain all four queue states");editor.execute({kind:"undo"});const checkpoint=editor.checkpointJson();check(!editor.view().documentJson.includes(images[0].asset),"Undo removes references, not retained bytes");
  check(editor.supportsRetainedAssetReferences(),"Managed installed owner must expose native retained-image reads");const inventory=editor.retainedAssetReferences();editor.checkRetainedAssetReferences(inventory);same(inventory.references.map(r=>r.asset).sort(),images.map(r=>r.asset).sort(),"Inventory includes invisible Redo images, not unrelated store files");check([inventory,inventory.schema,inventory.references,...inventory.references].every(Object.isFrozen),"Inventory is immutable");refusesInventory(()=>editor.checkRetainedAssetReferences(structuredClone(inventory)));check(editor.checkpointJson()===checkpoint,"Native inventory must not publish a history action");
  const archive=await source.exportBackup(),archiveSha256=await sha(archive);editor.checkRetainedAssetReferences(inventory);check(archive.type===ASSET_BACKUP_MIME,"Binary asset MIME");check(editor.checkpointJson()===checkpoint,"Asset capture must not publish a document action");same(await source.list(),metadata,"Capture preserves queue metadata");check(uploadCalls===4,"Capture must not upload");
  let sourceCuts=0;const joined=await source.captureBackup(()=>{sourceCuts++;return editor.checkpointJson();});check(sourceCuts===1&&joined.source===checkpoint,"Native source must be captured synchronously with the upload snapshot");check(await sha(joined.backup)===archiveSha256,"Coupled source capture retains the exact upload cut");const parsed=await readRichAssetBackup(joined.backup);try{same(parsed.entries().map(({epoch,...info})=>info),metadata,"Pure reader retains native raster metadata and upload states");for(const info of parsed.entries())check(await sha(parsed.blob(info.asset))===info.asset.slice(7),"Reader returns each exact native raster payload");}finally{parsed.dispose();}
  const restoreCommitBoundary=await assetRestoreCommitBoundary(archive,archiveSha256,prefix);
  const restoreBootstrapBoundary=await assetRestoreBootstrapBoundary(archive,archiveSha256,prefix);
  const exactEmptyRestore=await exactEmptyAssetRestore(archive,archiveSha256,prefix);
  target=await RichAssetStore.restoreBackup(`${prefix}-target`,archive,{uploadState:"preserve"});same(await target.list(),metadata,"Exact queue recovery");check((await target.get(images[0].asset)).storageRef===opaqueReceipt,"Opaque receipt code units must not be replaced");check(await sha(await target.exportBackup())===archiveSha256,"Exact framed bytes, epochs and receipts");for(const info of metadata){const blob=await target.blob(info.asset);check(`sha256:${await sha(blob)}`===info.asset,"Exact restored raster identity");const image=new Image();image.src=await target.resolve(info.asset);await image.decode();same([image.naturalWidth,image.naturalHeight],[3,2],"Actual browser decode after restore");}
  await refuses(()=>RichAssetStore.restoreBackup(`${prefix}-target`,archive,{uploadState:"preserve"}),"asset_backup_destination_exists");check(await sha(await target.exportBackup())===archiveSha256,"Refusal cannot modify destination");
  const outcomes=await Promise.allSettled([RichAssetStore.restoreBackup(`${prefix}-race`,archive,{uploadState:"preserve"}),RichAssetStore.restoreBackup(`${prefix}-race`,archive,{uploadState:"preserve"})]);check(outcomes.filter(r=>r.status==="fulfilled").length===1,"Exactly one concurrent restore wins");const lost=outcomes.find(r=>r.status==="rejected");check(lost.reason.code==="asset_backup_destination_exists","A racing import cannot overwrite");winner=outcomes.find(r=>r.status==="fulfilled").value;check(await sha(await winner.exportBackup())===archiveSha256,"Racing winner is complete");winner.close();winner=undefined;
  const add=IDBObjectStore.prototype.add;let queuedAdds=0;try{IDBObjectStore.prototype.add=function(...args){const request=add.apply(this,args);if(this.name==="assets"){queuedAdds++;const tx=this.transaction;queueMicrotask(()=>{try{tx.abort();}catch{}});}return request;};await refuses(()=>RichAssetStore.restoreBackup(`${prefix}-abort`,archive,{uploadState:"preserve"}),"asset_backup_storage");}finally{IDBObjectStore.prototype.add=add;}check(queuedAdds===4,"Abort after every asset add has been queued");extra=await RichAssetStore.open(`${prefix}-abort`);same(await extra.list(),[],"No partial raster set survives");await extra.exportBackup();extra.close();extra=undefined;extra=await RichAssetStore.restoreBackup(`${prefix}-abort`,archive,{uploadState:"preserve"});check(await sha(await extra.exportBackup())===archiveSha256,"Aborted transaction can be retried exactly");extra.close();extra=undefined;
  const corrupted=new Uint8Array(await archive.arrayBuffer());corrupted[corrupted.length-1]^=1;let failed;try{extra=await RichAssetStore.restoreBackup(`${prefix}-corrupt`,new Blob([corrupted]),{uploadState:"preserve"});}catch(error){failed=error;}check(["asset_backup_raster","asset_backup_integrity"].includes(failed?.code),"Tampered raster bytes must fail admission");check(!(await indexedDB.databases()).some(db=>db.name===`${prefix}-corrupt`),"Invalid raster must not create a destination");
  editor.dispose();editor=undefined;source.close();store=target;target=undefined;editor=await openLocalEditor(options(checkpoint,store));check(editor.checkpointJson()===checkpoint,"Recover exact native Redo with historical image bytes");refusesInventory(()=>editor.checkRetainedAssetReferences(inventory));same(editor.retainedAssetReferences().references,inventory.references,"New owner derives its own exact inventory");editor.execute({kind:"redo"});expected=editor.checkpointJson();check(editor.view().documentJson.includes(images[0].asset)&&editor.view().documentJson.includes(images[1].asset),"Redo recovers both image references");sessionStorage.setItem("asset-backup-reload",JSON.stringify({database:`${prefix}-target`,metadata,checkpoint,expected,archiveSha256,inventory}));return{passed:true,providerCloseFence,restoreCommitBoundary,restoreBootstrapBoundary,exactEmptyRestore,assets:metadata.length,mimes:[...new Set(metadata.map(r=>r.mime))].sort(),states:metadata.map(r=>r.status).sort(),exactRasterDecodes:metadata.length,binaryBytes:archive.size,uploadCalls,queuedAdds,concurrentRestoreWinners:1,occupiedRefusals:1,corruptRefusals:1,atomicAbortRetries:1,nativeUndoRedoWithRetainedAssets:true,nativeRetainedInventory:true,sourceCut:true,pureUploadReader:true,retainedImageBindings:inventory.references.length,inventorySourceRefusals:2};
 }finally{source.close();target?.close();extra?.close();winner?.close();}
}
async function reopen(){const saved=JSON.parse(sessionStorage.getItem("asset-backup-reload"));store=await RichAssetStore.open(saved.database);same(await store.list(),saved.metadata,"Real reload preserves every upload state");check(await sha(await store.exportBackup())===saved.archiveSha256,"Real reload preserves the complete binary archive");editor=await openLocalEditor(options(saved.checkpoint,store));check(editor.checkpointJson()===saved.checkpoint,"Exact native history before future Redo");refusesInventory(()=>editor.checkRetainedAssetReferences(saved.inventory));const inventory=editor.retainedAssetReferences();same(inventory.references,saved.inventory.references,"Native inventory survives real reload without adopting serialized provenance");editor.checkRetainedAssetReferences(inventory);editor.execute({kind:"redo"});refusesInventory(()=>editor.checkRetainedAssetReferences(inventory));expected=saved.expected;check(editor.checkpointJson()===expected,"Exact future native history after reload");return{passed:true,retainedAssets:saved.metadata.length,exactArchiveAfterReload:true,exactFutureCheckpoint:true,nativeRetainedInventoryAfterReload:true,inventorySourceRefusals:2};}
globalThis.assetArchiveExample={run,reopen,errors,snapshot(){return{images:[...host.querySelectorAll("img")].map(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})),exactCheckpoint:editor.checkpointJson()===expected};},finish(){editor?.dispose();editor=undefined;store?.close();store=undefined;}};
