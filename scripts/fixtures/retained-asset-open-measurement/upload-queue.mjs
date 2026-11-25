import {RichAssetStore,openLocalEditor,readRichAssetBackup} from '@breditor/editor';
import {file,nativeOptions,sha} from './measure.mjs';
import {countRasterWrites} from './raster-write-count.mjs';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const hash=async blob=>sha(await blob.arrayBuffer());
async function archiveEntries(archive){
 const reader=await readRichAssetBackup(archive);
 try{return reader.entries();}
 finally{reader.dispose();}
}

globalThis.measureUploadQueueWrites=async()=>{
 const database='measure-upload-queue-writes',notifications=[];
 let store,editor;
 try{
  store=await RichAssetStore.open(database,{onChange:row=>notifications.push(row)});
  editor=await openLocalEditor({...nativeOptions(store),initial:{kind:'empty',documentId:'queue-write-proof',blockId:'body'}});
  const files=[await file(0),await file(1)],randomUUID=Crypto.prototype.randomUUID;
  let refs;
  try{
   Crypto.prototype.randomUUID=()=>'00000000-0000-4000-8000-000000000001';
   refs=await editor.insertImageFiles(store,files,{parent:{kind:'document'},before:null});
  }finally{Crypto.prototype.randomUUID=randomUUID;}
  const withImages=editor.view().documentJson;
  editor.execute({kind:'undo'});
  const checkpoint=editor.checkpointJson(),withoutImages=editor.view().documentJson;
  check(refs.every(row=>withImages.includes(row.asset)&&!withoutImages.includes(row.asset)),'Reference must survive in native Redo');
  for(let index=2;index<12;index++)await store.ingest(await file(index));
  const ids=(await store.list()).map(row=>row.asset),uploaded=new Set(ids.slice(0,6));
  await store.flush(async info=>{if(uploaded.has(info.asset))return 'original-receipt';throw Error('Offline fixture');});
  for(const asset of ids.slice(6))await store.retry(asset);
  const before=await store.list(),archive=await store.exportBackup(),archiveSha256=await hash(archive),notificationsBefore=notifications.length;
  check(before.filter(row=>row.status==='uploaded').length===6&&before.filter(row=>row.status==='pending').length===6,'The workload must contain both requested queue states');
  const noOp=await countRasterWrites(database,async()=>{
   for(const row of before){
    if(row.status==='uploaded')check(JSON.stringify(await store.cancel(row.asset))===JSON.stringify(row),'Uploaded cancel must retain the receipt');
    check(JSON.stringify(await store.retry(row.asset))===JSON.stringify(row),'Retry must retain the already uploaded or pending state');
   }
  });
  check(notifications.length-notificationsBefore===18,'All no-op calls must retain their existing observer outcome');
  check(await hash(await store.exportBackup())===archiveSha256,'Idempotent calls must preserve exact payload, attempts, epochs and receipts');
  const pending=before.find(row=>row.status==='pending').asset;
  const changed=await countRasterWrites(database,async()=>{
   check((await store.cancel(pending)).status==='cancelled','An actual cancellation must write');
   check((await store.retry(pending)).status==='pending','An actual retry must write');
  });
  check(changed.rows===2&&changed.assets.every(asset=>asset===pending),'Actual transitions must retain their two asset writes');
  const final=await store.exportBackup(),finalSha256=await hash(final);
  const oldRows=await archiveEntries(archive),newRows=await archiveEntries(final);
  check(JSON.stringify(newRows)===JSON.stringify(oldRows.map(row=>row.asset===pending?{...row,epoch:row.epoch+2}:row)),
   'The real transitions must change only their selected epoch');
  editor.dispose();editor=undefined;store.close();store=undefined;
  store=await RichAssetStore.restoreBackup(database+'-cold',final,{uploadState:'preserve'});
  check(await hash(await store.exportBackup())===finalSha256,'Portable recovery must preserve the exact final archive');
  editor=await openLocalEditor(nativeOptions(store,checkpoint));
  check(editor.checkpointJson()===checkpoint,'Cold native checkpoint must be byte-exact');
  editor.execute({kind:'redo'});check(editor.view().documentJson===withImages,'Native Redo must recover the image references');
  editor.execute({kind:'undo'});check(editor.view().documentJson===withoutImages,'Native Undo must recover the earlier document');
  return {passed:true,noOp,changed,nativeUndoRedo:true,assets:before.length,noOpNotifications:18,archiveSha256,finalSha256,
   checkpointSha256:await sha(new TextEncoder().encode(checkpoint))};
 }finally{editor?.dispose();store?.close();}
};
