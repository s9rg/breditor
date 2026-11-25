import {ASSET_BACKUP_MIME,RichAssetStore,openLocalEditor,readRichAssetBackup} from '@breditor/editor';
import {file,measureRasterAdmission,nativeOptions,sha} from './measure.mjs';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const rejection=async operation=>{try{await operation();return null;}catch(error){return error.code;}};
const sorted=rows=>[...rows].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:0);
let filesystem;

globalThis.downloadFilesystemArchive=async()=>{
 const store=await RichAssetStore.open('archive-reader-filesystem-source');
 try{
  await store.ingest(await file(20));
  const url=URL.createObjectURL(await store.exportBackup()),link=document.createElement('a');
  link.href=url;link.download='archive.rasters';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }finally{store.close();}
};
globalThis.holdFilesystemArchive=async wrap=>{
 const selected=document.querySelector('#archive-file').files[0];
 check(selected instanceof File&&selected.size>1024*1024,'Use real Chromium file selection with an encoded raster');
 const archive=await readRichAssetBackup(wrap?new Blob([selected],{type:ASSET_BACKUP_MIME}):selected);
 const [entry]=archive.entries(),payload=archive.blob(entry.asset);
 check(payload?.size===entry.bytes&&'sha256:'+await sha(await payload.arrayBuffer())===entry.asset,'The file-backed archive must first admit its exact raster');
 filesystem={archive,entry,payload};
};
globalThis.verifyFilesystemPayload=async()=>{
 const {archive,entry,payload}=filesystem;
 try{return archive.blob(entry.asset)===payload&&'sha256:'+await sha(await payload.arrayBuffer())===entry.asset;}
 finally{archive.dispose();filesystem=undefined;}
};

globalThis.measureArchiveReadPayloads=async()=>{
 let store,editor,archive;
 try{
  store=await RichAssetStore.open('archive-reader-source');
  editor=await openLocalEditor({...nativeOptions(store),initial:{kind:'empty',documentId:'archive-reader-measurement',blockId:'body'}});
  const files=[await file(0),await file(1)],randomUUID=Crypto.prototype.randomUUID;
  let images;
  try{
   Crypto.prototype.randomUUID=()=>'00000000-0000-4000-8000-000000000001';
   images=await editor.insertImageFiles(store,files,{parent:{kind:'document'},before:null});
  }finally{Crypto.prototype.randomUUID=randomUUID;}
  const additional=[];
  for(let index=2;index<12;index++)additional.push(await store.ingest(await file(index)));
  await store.flush(async info=>{if(info.asset===images[0].asset)return 'archive-reader-confirmed';throw Error('Fixture offline');});
  await store.cancel(images[1].asset);await store.retry(additional[0].asset);
  const metadata=sorted(await store.list()),metadataJson=JSON.stringify(metadata);
  check(new Set(metadata.map(entry=>entry.status)).size===4,'All four upload states must be represented');
  const withImages=editor.view().documentJson;
  editor.execute({kind:'undo'});
  const checkpoint=editor.checkpointJson(),withoutImages=editor.view().documentJson;
  check(images.every(image=>withImages.includes(image.asset)&&!withoutImages.includes(image.asset)),'The native image references must reside in Redo history');
  const source=await store.exportBackup(),archiveSha256=await sha(await source.arrayBuffer());
  const samples=[];
  let sliceHashes,entriesJson;
  for(let sample=0;sample<3;sample++){
   const measured=await measureRasterAdmission(()=>readRichAssetBackup(source));
   archive=measured.value;
   samples.push({...measured.counts,readMs:measured.elapsedMs});
   const entries=archive.entries(),listed=entries.map(({epoch,...info})=>info);
   check(JSON.stringify(listed)===metadataJson&&entries.every(entry=>Number.isSafeInteger(entry.epoch)),'The pure reader must preserve every queue field');
   const encoded=JSON.stringify(entries);
   check((entriesJson??=encoded)===encoded&&Object.isFrozen(entries)&&entries.every(Object.isFrozen),'The exact detached entries must remain stable');
   const hashes=[];
   for(const entry of entries){
    const payload=archive.blob(entry.asset);
    check(payload&&payload===archive.blob(entry.asset)&&payload.size===entry.bytes&&payload.type===entry.mime,'The admitted raster must retain exact size and MIME');
    const hash=await sha(await payload.arrayBuffer());
    check(entry.asset==='sha256:'+hash,'Every exposed raster must match its exact asset identity');
    hashes.push(hash);
   }
   check(JSON.stringify(sliceHashes??=hashes)===JSON.stringify(hashes),'All exposed bytes must match on repeat reads');
   check(archive.blob('unknown')===undefined,'An unrelated asset must not resolve');
   const backup=archive.backup();
   check(backup.type===ASSET_BACKUP_MIME&&backup.size===source.size&&await sha(await backup.arrayBuffer())===archiveSha256,'The admitted backup must preserve the original exact framed bytes');
   archive.dispose();
   check(archive.entries()===entries&&await rejection(()=>archive.backup())==='asset_backup_closed'&&await rejection(()=>archive.blob(entries[0].asset))==='asset_backup_closed','Disposal must release access and keep only detached metadata available');
   archive=undefined;
  }
  editor.dispose();editor=undefined;store.close();store=undefined;
  const corrupted=new Blob([source.slice(0,-1),Uint8Array.of(new Uint8Array(await source.slice(-1).arrayBuffer())[0]^1)],{type:source.type});
  check(corrupted.size===source.size&&['asset_backup_raster','asset_backup_integrity'].includes(await rejection(()=>readRichAssetBackup(corrupted))),'A changed byte in the final raster must fail admission');
  archive=await readRichAssetBackup(source);
  store=await RichAssetStore.restoreBackup('archive-reader-restored',archive.backup(),{uploadState:'preserve'});
  archive.dispose();archive=undefined;store.close();store=await RichAssetStore.openRetained('archive-reader-restored');
  check(JSON.stringify(sorted(await store.list()))===metadataJson&&await sha(await (await store.exportBackup()).arrayBuffer())===archiveSha256,'The cold restore must preserve the exact archive, epochs and upload custody');
  editor=await openLocalEditor(nativeOptions(store,checkpoint));
  check(editor.checkpointJson()===checkpoint,'Cold native recovery must replay the exact image-history checkpoint');
  editor.execute({kind:'redo'});
  check(editor.view().documentJson===withImages,'Native Redo must restore both image references');
  editor.execute({kind:'undo'});
  check(editor.view().documentJson===withoutImages,'Native Undo must recover the original no-image cut');
  return {passed:true,samples,assets:metadata.length,rasterBytes:metadata.reduce((sum,entry)=>sum+entry.bytes,0),archiveBytes:source.size,archiveSha256,
   checkpointSha256:await sha(new TextEncoder().encode(checkpoint)),entriesSha256:await sha(new TextEncoder().encode(entriesJson)),sliceHashes,
   exactArchive:true,exactQueue:true,coldNativeUndoRedo:true,corruptFinalRasterRefused:true,disposedAccessRefused:true};
 }finally{archive?.dispose();editor?.dispose();store?.close();}
};
