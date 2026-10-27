/** A real foreign native edit in retained DATA, not a fabricated owner or grant.
 * The old complete room cut is re-framed around the actual replayed LIVE pair. */
import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{SharedRichEditor}from'../../../packages/breditor-collaboration/dist/index.js';
import{SelectedRoomCurrentArchive as Current,encodeSelectedRoomCurrent as encode}from'../../../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import{LoadedNativeReconstructionCurrent as Loaded}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import{recordCutJson}from'../../../packages/breditor-collaboration/dist/physical_room_record_cut/json.js';
import{recordCutPrefix,ROOM_RECORD_CUT_MAGIC as magic,ROOM_RECORD_CUT_MIME as mime}from'../../../packages/breditor-collaboration/dist/physical_room_record_cut/framing.js';
const sha=async file=>createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
export async function replaceRoomRecords(input,id,edit,integrity){
 const current=await Current.read(input.file,input.selection,integrity);try{const cut=current.current(),prefix=Buffer.from(await cut.file.slice(0,magic.length+4).arrayBuffer()),length=prefix.readUInt32LE(magic.length),manifest=JSON.parse(await cut.file.slice(prefix.length,prefix.length+length).text()),parts=[];let offset=prefix.length+length;
  for(const row of manifest.entries){parts.push(cut.file.slice(offset,offset+row.bytes,row.mime));offset+=row.bytes;}assert.equal(offset,cut.file.size);const selected=manifest.participants.find(p=>p.id===id);assert.ok(selected);const records=JSON.parse(await parts[selected.records].text());await edit(records);parts[selected.records]=new Blob([recordCutJson(records)],{type:'application/json'});manifest.entries[selected.records]={...manifest.entries[selected.records],bytes:parts[selected.records].size,sha256:await sha(parts[selected.records])};const header=new TextEncoder().encode(recordCutJson(manifest)),file=new Blob([recordCutPrefix(header.length),header,...parts],{type:mime}),root={selection:{...cut.selection,bytes:file.size,sha256:await sha(file)},file},approval=current.approval(),uploads=current.manifest().uploads.map(row=>({id:row.id,database:row.database,file:current.uploadFile(row.id),sha256:row.sha256}));return await encode({approval,root,uploads},integrity);
 }finally{current.dispose();}
}
export async function foreignRoomFork(f,input=f.retained,{id='independent-delivery',label='Foreign fork'}={}){
 const loaded=await Loaded.read(input,f.integrity);let core,peer;try{const data=await loaded.records(id),recovery=data.source.live,selected=f.f.f.rows.find(r=>r.id===id).owner.options,profile=f.f.f.profile,segmented=recovery.source.identity.documentHistory==='segmented-v1',raw=segmented?profile.restore_segmented(selected.room,recovery.source.documentCheckpoint):profile.restore(selected.room,recovery.source.documentCheckpoint);core=new SharedRichEditor(raw,{...(segmented?{segmentedHistory:'segmented-v1'}:{})});if(recovery.source.identity.reviewHistory==='segmented-v1')core.enableSegmentedReview(selected.review,recovery.source.reviewCheckpoint);else core.enableReview(selected.review,recovery.source.reviewCheckpoint);
  const role={actor:'room-union-peer',principal:'peer',access:'comment'};peer=new SharedRichEditor(profile.join_frame(selected.room,'900001',core.updateFrame()));peer.enableReview(role);peer.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:label+' text '}}]});peer.dispatchReview({kind:'create_thread',data:{anchorJson:peer.captureReviewAnchor({kind:'document'}),body:label+' comment'}});await core.receiveFrame(peer.updateFrame());core.receiveReview(peer.exportReview('0'),role);const clock=peer.localReviewClock(),next={...recovery,source:{...recovery.source,documentCheckpoint:core.checkpointJson(),reviewCheckpoint:recovery.source.identity.reviewHistory==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()}},retained=await replaceRoomRecords(input,id,records=>{records.source.live=next;},f.integrity);return{retained,recovery:next,authorizations:[{id,authorizations:[{source:role,from:'1',through:clock.through,prefixDigest:clock.prefixDigest}]}]};
 }finally{peer?.dispose();core?.dispose();loaded.dispose();}
}

/** A selected-queue branch is a separate complete input from native-attached uploads. */
export async function cancelSelectedUpload(f,input,id,asset){
 const {RichAssetStore}=await import('@breditor/experimental-rich-content'),current=await Current.read(input.file,input.selection,f.integrity);let store;
 try{const original=current.uploadFile(id);store=await RichAssetStore.restoreBackup(f.tag+'-incoming-selected-queue',original,{uploadState:'preserve'});await store.cancel(asset);const changed=await store.exportBackup();assert.notEqual(await sha(original),await sha(changed));const uploads=current.manifest().uploads.map(row=>({id:row.id,database:row.database,file:row.id===id?changed:current.uploadFile(row.id),sha256:row.id===id?null:row.sha256}));for(const row of uploads)if(row.sha256===null)row.sha256=await sha(row.file);return await encode({approval:current.approval(),root:current.current(),uploads},f.integrity);
 }finally{store?.close();current.dispose();}
}
