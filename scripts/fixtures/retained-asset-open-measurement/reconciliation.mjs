import {RichAssetStore,openLocalEditor} from '@breditor/editor';
import {file,nativeOptions,sha} from './measure.mjs';
import {countRasterWrites} from './raster-write-count.mjs';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const fileHash=async blob=>sha(await blob.arrayBuffer());
const ids=rows=>rows.map(row=>row.asset).sort();
const nativeHash=text=>sha(new TextEncoder().encode(text));

async function observeRejectedReads(database,commit){
 const native=IDBObjectStore.prototype.getAll;
 let reads=0,rows=0,payloadBytes=0,refused;
 try{
  IDBObjectStore.prototype.getAll=function(...args){
   const request=native.apply(this,args);
   if(this.name==='assets'&&this.transaction.db.name===database&&this.transaction.mode==='readwrite'){
    reads++;
    request.addEventListener('success',()=>{
     rows+=request.result.length;
     payloadBytes+=request.result.reduce((sum,row)=>sum+row.payload.byteLength,0);
    },{once:true});
   }
   return request;
  };
  const writes=await countRasterWrites(database,async()=>{
   try{await commit();}catch(error){refused=error.code;}
  });
  return {refused,reads,rows,payloadBytes,rasterWrites:writes.rows};
 }finally{IDBObjectStore.prototype.getAll=native;}
}
async function removeFixtureRaster(database,asset,expectedBytes){
 const db=await new Promise((resolve,reject)=>{
  const open=indexedDB.open(database);
  open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
 });
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction(['assets','metadata'],'readwrite');
  tx.objectStore('assets').delete(asset);
  tx.objectStore('metadata').put(expectedBytes,'bytes');
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
async function measureReconciledAssets(includeStale){
 const database='measure-reconciled-assets',options={database:database+'-attempt',checkSource(){}};
 let target,source,editor,attempt;
 try{
  target=await RichAssetStore.open(database);
  source=await RichAssetStore.open(database+'-incoming');
  editor=await openLocalEditor({...nativeOptions(target),initial:{kind:'empty',documentId:'raster-write-proof',blockId:'body'}});
  const first=await file(0),second=await file(1),randomUUID=Crypto.prototype.randomUUID;
  let images;
  // Pin only the image insertion's generated block prefix across the two installed runs.
  try{
   Crypto.prototype.randomUUID=()=>'00000000-0000-4000-8000-000000000001';
   images=await editor.insertImageFiles(target,[first,second],{parent:{kind:'document'},before:null});
  }finally{Crypto.prototype.randomUUID=randomUUID;}
  const beforeUndo=editor.view().documentJson;
  editor.execute({kind:'undo'});
  const checkpoint=editor.checkpointJson(),afterUndo=editor.view().documentJson;
  check(images.every(row=>beforeUndo.includes(row.asset)&&!afterUndo.includes(row.asset)),'Only native Redo may contain the two asset references');
  for(let index=2;index<12;index++)await target.ingest(await file(index));
  await target.cancel(images[1].asset);
  await source.ingest(first);
  const added=await source.ingest(await file(12)),shared=images[0].asset;
  await source.flush(async info=>{if(info.asset===shared)return 'selected-provider-receipt';throw Error('Fixture offline');});
  const current=await target.exportBackup(),original=await source.exportBackup(),before=await target.list(),incoming=await source.list();
  check(before.find(row=>row.asset===shared)?.status==='pending'&&incoming.find(row=>row.asset===shared)?.status==='uploaded',
   'The existing asset must have a genuine queue conflict');
  const expected=new Map(before.map(row=>[row.asset,row]));
  for(const row of incoming)expected.set(row.asset,row);
  const expectedQueue=JSON.stringify([...expected.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:0));
  const choices=[{asset:shared,keep:'original'}],requiredWrites=ids(incoming);
  attempt=await target.beginReconciliation(original,options);
  const preview=attempt.preview();
  check(preview.added===1&&preview.conflicts.length===1&&preview.conflicts[0].asset===shared,'The fixture must add one row and select one conflicting queue state');
  let stale;
  const inputHashes=await Promise.all([fileHash(current),fileHash(original)]);
  if(includeStale){
   // Two additional exact images make the live count unequal to both eligible cuts.
   const extra=await Promise.all([file(13),file(14)]);
   const extras=[];
   for(const raster of extra)extras.push(await target.ingest(raster));
   const changed=await target.exportBackup(),changedHash=await fileHash(changed);
   stale=await observeRejectedReads(database,()=>attempt.commit(choices));
   check(stale.refused==='asset_reconciliation_target_changed'&&stale.rasterWrites===0&&attempt.progress().phase==='decided','A stale target must refuse without a raster write or false apply');
   check(await fileHash(await target.exportBackup())===changedHash&&await fileHash(attempt.file('current'))===inputHashes[0]&&
    await fileHash(attempt.file('original'))===inputHashes[1],'Refusal must preserve the extra exact rasters and both original inputs');
   let remaining=before.reduce((sum,row)=>sum+row.bytes,0)+extras.reduce((sum,row)=>sum+row.bytes,0);
   for(const row of extras){remaining-=row.bytes;await removeFixtureRaster(database,row.asset,remaining);}
   check(await fileHash(await target.exportBackup())===inputHashes[0],'The control must remove only the extra fixture rows before cold retry');
   await attempt.close();attempt=undefined;
   target.close();target=await RichAssetStore.openRetained(database);
   // Use the actual persisted decided ledger and its original admission choices.
   attempt=await target.resumeReconciliation(options);
  }
  const firstApply=await countRasterWrites(database,()=>attempt.commit(choices));
  check(requiredWrites.every(asset=>firstApply.assets.includes(asset)),'The new raster and changed queue row must both be written');
  check(JSON.stringify(await target.list())===expectedQueue,'Reconciliation must preserve every selected queue field and the provider receipt');
  const union=await target.exportBackup(),archiveSha256=await fileHash(union);
  check(await fileHash(attempt.file('current'))===inputHashes[0]&&await fileHash(attempt.file('original'))===inputHashes[1],
   'Both input archives must survive the apply');
  await attempt.close();attempt=undefined;editor.dispose();editor=undefined;target.close();target=undefined;

  target=await RichAssetStore.openRetained(database);
  attempt=await target.resumeReconciliation(options);
  const coldRetry=await countRasterWrites(database,()=>attempt.commit(choices));
  check(coldRetry.rows===0&&await fileHash(await target.exportBackup())===archiveSha256,'A resumed applied decision must retain the exact union without rewriting rows');
  check(await fileHash(attempt.file('current'))===inputHashes[0]&&await fileHash(attempt.file('original'))===inputHashes[1],
   'Cold attempt must retain both exact input archives');
  await attempt.close();attempt=undefined;target.close();target=undefined;

  target=await RichAssetStore.restoreBackup(database+'-restored',union,{uploadState:'preserve'});
  check(JSON.stringify(await target.list())===expectedQueue&&await fileHash(await target.exportBackup())===archiveSha256,
   'Cold portable restore must preserve queue and complete framed bytes');
  for(const row of expected.values()){
   const bytes=await target.blob(row.asset);
   check(bytes?.size===row.bytes&&'sha256:'+await fileHash(bytes)===row.asset,'Every restored raster must match its exact content ID');
  }
  editor=await openLocalEditor(nativeOptions(target,checkpoint));
  check(editor.checkpointJson()===checkpoint&&editor.view().documentJson===afterUndo,'The cold native owner must recover the exact undone checkpoint');
  editor.execute({kind:'redo'});check(editor.view().documentJson===beforeUndo,'Redo must restore exact image references');
  editor.execute({kind:'undo'});check(editor.view().documentJson===afterUndo,'Undo must restore exact document bytes');
  return {passed:true,firstApply,coldRetry,requiredWrites,changedRasterBytes:incoming.reduce((sum,row)=>sum+row.bytes,0),
   newRaster:added.asset,unionRasters:expected.size,archiveBytes:union.size,archiveSha256,inputHashes,
   checkpointSha256:await nativeHash(checkpoint),queueSha256:await nativeHash(expectedQueue),exactRestore:true,nativeUndoRedo:true,...(stale?{stale}:{})};
 }finally{await attempt?.close();editor?.dispose();target?.close();source?.close();}
}
globalThis.measureReconciledAssetWrites=()=>measureReconciledAssets(false);
globalThis.measureReconciledAssetStaleReads=()=>measureReconciledAssets(true);
