import {RichAssetStore,openLocalEditor} from '@breditor/editor';
import {file,nativeOptions,sha} from './measure.mjs';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const fileHash=async blob=>sha(await blob.arrayBuffer());
const ids=rows=>rows.map(row=>row.asset).sort();
const nativeHash=text=>sha(new TextEncoder().encode(text));
async function countRasterWrites(database,operation){
 const prototype=IDBObjectStore.prototype,{put,add}=prototype,writes=[];
 const count=method=>function(...args){
  const request=method.apply(this,args);
  if(this.name==='assets'&&this.transaction.db.name===database)writes.push({asset:args[0].asset,bytes:args[0].payload.byteLength});
  return request;
 };
 prototype.put=count(put);prototype.add=count(add);
 try{
  await operation();
  return {rows:writes.length,payloadBytes:writes.reduce((total,row)=>total+row.bytes,0),assets:ids(writes)};
 }finally{prototype.put=put;prototype.add=add;}
}

globalThis.measureReconciledAssetWrites=async()=>{
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
  const firstApply=await countRasterWrites(database,()=>attempt.commit(choices));
  check(requiredWrites.every(asset=>firstApply.assets.includes(asset)),'The new raster and changed queue row must both be written');
  check(JSON.stringify(await target.list())===expectedQueue,'Reconciliation must preserve every selected queue field and the provider receipt');
  const union=await target.exportBackup(),archiveSha256=await fileHash(union),inputHashes=await Promise.all([fileHash(current),fileHash(original)]);
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
   checkpointSha256:await nativeHash(checkpoint),queueSha256:await nativeHash(expectedQueue),exactRestore:true,nativeUndoRedo:true};
 }finally{await attempt?.close();editor?.dispose();target?.close();source?.close();}
};
