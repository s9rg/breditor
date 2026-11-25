import {ASSET_BACKUP_MIME,RichAssetStore,openLocalEditor} from '@breditor/editor';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
async function file(index){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=660;
 const context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height);
 let state=0x45321+index;
 for(let offset=0;offset<pixels.data.length;offset+=4){
  state^=state<<13;state^=state>>>17;state^=state<<5;
  pixels.data[offset]=state&255;pixels.data[offset+1]=(state>>>8)&255;pixels.data[offset+2]=(state>>>16)&255;pixels.data[offset+3]=255;
 }
 context.putImageData(pixels,0,0);
 const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 check(png?.type==='image/png','The browser must encode each real PNG');
 return new File([png],`raster-${index}.png`,{type:png.type});
}
const nativeOptions=(store,checkpointJson)=>({host:document.querySelector('#editor'),richLanguage:3,history:'typing-v1',
 toolbar:()=>[],resolveAsset:binding=>store.resolve(binding.asset),
 initial:checkpointJson?{kind:'typingCheckpoint',checkpointJson}:{kind:'empty',blockId:'body'}});
export {file,nativeOptions,sha};
async function replacePayload(database,asset){
 const db=await new Promise((resolve,reject)=>{const open=indexedDB.open(database);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('assets','readwrite'),assets=tx.objectStore('assets'),request=assets.get(asset);
  request.onsuccess=()=>{const row=request.result;new Uint8Array(row.payload)[0]^=1;assets.put(row);};
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
async function measureRasterAdmission(operation){
 const NativeBlob=globalThis.Blob,arrayBuffer=NativeBlob.prototype.arrayBuffer;
 let wholeArchiveBlobs=0,wholeArchiveBlobBytes=0,rasterBlobs=0,rasterBlobBytes=0,rasterReads=0,rasterReadBytes=0;
 globalThis.Blob=new Proxy(NativeBlob,{construct(target,args,newTarget){
  const blob=Reflect.construct(target,args,newTarget);
  if(blob.type===ASSET_BACKUP_MIME){wholeArchiveBlobs++;wholeArchiveBlobBytes+=blob.size;}
  if(blob.type==='image/png'){rasterBlobs++;rasterBlobBytes+=blob.size;}
  return blob;
 }});
 NativeBlob.prototype.arrayBuffer=function(...args){
  if(this.type==='image/png'){rasterReads++;rasterReadBytes+=this.size;}
  return arrayBuffer.apply(this,args);
 };
 const started=performance.now();
 try{
  const value=await operation();
  return {value,counts:{wholeArchiveBlobs,wholeArchiveBlobBytes,rasterBlobs,rasterBlobBytes,rasterReads,rasterReadBytes},elapsedMs:performance.now()-started};
 }finally{globalThis.Blob=NativeBlob;NativeBlob.prototype.arrayBuffer=arrayBuffer;}
}

globalThis.measureRetainedAssetOpen=async()=>{
 const database='measure-retained-assets';
 let owner,editor;
 try{
  owner=await RichAssetStore.open(database);
  editor=await openLocalEditor({...nativeOptions(owner),initial:{kind:'empty',documentId:'retained-raster-measurement',blockId:'body'}});
  const files=[await file(0),await file(1)],randomUUID=Crypto.prototype.randomUUID;
  let images;
  try{
   Crypto.prototype.randomUUID=()=>'00000000-0000-4000-8000-000000000001';
   images=await editor.insertImageFiles(owner,files,{parent:{kind:'document'},before:null});
  }finally{Crypto.prototype.randomUUID=randomUUID;}
  const additional=[];
  for(let index=2;index<12;index++)additional.push(await owner.ingest(await file(index)));
  await owner.flush(async info=>{if(info.asset===images[0].asset)return 'confirmed-image-receipt';throw Error('Fixture offline');});
  await owner.cancel(images[1].asset);await owner.retry(additional[0].asset);
  const metadata=await owner.list(),metadataJson=JSON.stringify(metadata);
  check(new Set(metadata.map(row=>row.status)).size===4,'The fixture must retain all four upload states');
  const withImages=editor.view().documentJson;
  editor.execute({kind:'undo'});
  const checkpoint=editor.checkpointJson(),withoutImages=editor.view().documentJson;
  check(images.every(image=>withImages.includes(image.asset)&&!withoutImages.includes(image.asset)),'Both raster references must be preserved only in Redo history');
  const exported=await measureRasterAdmission(()=>owner.exportBackup());
  const archive=exported.value,archiveSha256=await sha(await archive.arrayBuffer());
  editor.dispose();editor=undefined;owner.close();owner=undefined;
  const samples=[];
  for(let index=0;index<3;index++){
   const opened=await measureRasterAdmission(()=>RichAssetStore.openRetained(database));
   owner=opened.value;
   samples.push({...opened.counts,openMs:opened.elapsedMs});
   check(JSON.stringify(await owner.list())===metadataJson,'Read-only admission must preserve the full upload queue');
   owner.close();owner=undefined;
  }
  owner=await RichAssetStore.openRetained(database);
  check(await sha(await (await owner.exportBackup()).arrayBuffer())===archiveSha256,'A separately requested backup must preserve exact framed bytes');
  owner.close();owner=await RichAssetStore.restoreBackup(database+'-restored',archive,{uploadState:'preserve'});
  check(JSON.stringify(await owner.list())===metadataJson,'Cold restore must preserve the full queue and receipt');
  editor=await openLocalEditor(nativeOptions(owner,checkpoint));
  check(editor.checkpointJson()===checkpoint,'Cold native checkpoint must match the retained Undo cut');
  editor.execute({kind:'redo'});
  check(editor.view().documentJson===withImages,'Native Redo must restore both exact referenced images');
  editor.execute({kind:'undo'});
  check(editor.view().documentJson===withoutImages,'Native Undo must preserve the restored image history');
  editor.dispose();editor=undefined;owner.close();owner=undefined;

  await replacePayload(database+'-restored',images[0].asset);
  let failure;
  try{owner=await RichAssetStore.openRetained(database+'-restored');}catch(error){failure=error;}
  check(['asset_backup_raster','asset_backup_integrity'].includes(failure?.code),'A retained store with changed raster bytes must still refuse');
  owner=await RichAssetStore.open(database+'-restored');
  failure=undefined;try{await owner.exportBackup();}catch(error){failure=error;}
  check(['asset_backup_raster','asset_backup_integrity'].includes(failure?.code),'Explicit export must also refuse changed raster bytes');
  return{passed:true,samples,exportCounts:exported.counts,assets:metadata.length,rasterBytes:metadata.reduce((sum,row)=>sum+row.bytes,0),archiveBytes:archive.size,
   archiveSha256,checkpointSha256:await sha(new TextEncoder().encode(checkpoint)),
   queueStates:metadata.map(row=>row.status).sort(),exactArchive:true,nativeUndoRedo:true,corruptRasterRefused:true};
 }finally{editor?.dispose();owner?.close();}
};
