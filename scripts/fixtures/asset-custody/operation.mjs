/** Genuine original/generation native owners and portable whole-upload recovery.
 * The caller supplies an isolated IDB/lock host; no authentication is fabricated. */
import assert from 'node:assert/strict';
import {cleanupSession,insertCleanupText,cleanupNativePair} from '../owned-core-cleanup/session.mjs';
import {pixel,secondPixel,secondAsset} from '../review-assets/pixels.mjs';

export async function assetOperationParticipant({api,rich,profile,family,tag,writer='101',operation=true}){
 const generation=family.startsWith('generation'),paired=family.endsWith('paired'),selected=cleanupSession(api,profile,{family,database:tag+'-seed'});
 selected.options.writer=writer;selected.options.create=()=>profile.create(selected.document,writer);
 if(paired)selected.options.review.actor=tag+'-comments';
 if(generation)selected.options.initialGenerations={root:tag+'-root',active:tag+'-active'};
 let session,uploads,backup,attempt,ready,owner,reference,parts;
 const closeParts=async value=>{if(!value)return;await(value.session??value.source.session).discardAndClose();value.uploads.close();};
 try{
  session=await selected.open();insertCleanupText(session.core,'Retained text ');session.core.undo();
  if(paired){session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Retained comment'}});session.core.undoReview();}
  await session.flush();const native=cleanupNativePair(session.core,selected);
  uploads=await rich.RichAssetStore.open(tag+'-seed-uploads');await uploads.ingest(new Blob([pixel],{type:'image/png'}));await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));await uploads.cancel(secondAsset);
  const identity={room:'room',writer,richLanguage:1,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null};
  const captured=generation?await api.captureSharedGenerationParticipant({participant:tag,principal:'alice',source:{kind:'local',session},assets:uploads,checkAuthority(){}}):await api.captureSharedParticipantBackup({identity:{participant:tag,principal:'alice',source:identity,stores:['document',...(paired?['paired-session']:[])],assets:'whole-store'},source:{core:session.core,...(paired?{session}:{})},assets:uploads,checkAuthority(){}});
  assert.equal(captured.kind,'ready');backup=captured.backup;const expectedUploads=Buffer.from(await backup.uploadBackup().arrayBuffer());
  await session.close();session=undefined;uploads.close();uploads=undefined;
  let recovery;
  if(generation){const {database,create,initialGenerations,...options}=selected.options;recovery={database:tag+'-recovery',backup,expected:backup.selection(),destinations:{source:tag+'-source',uploads:tag+'-uploads'},session:{kind:'local',options},checkAuthority(){}};attempt=await api.SharedGenerationParticipantRecovery.begin(recovery);}
  else{recovery={database:tag+'-recovery',backup,expected:backup.selection(),destinations:{document:tag+'-source',uploads:tag+'-uploads'},session:{kind:paired?'paired':'document',options:selected.options},checkAuthority(){}};attempt=await api.SharedParticipantRecovery.begin(recovery);}
  ready=await attempt.finish();await attempt.close();attempt=undefined;
  if(operation){owner=await(generation?api.OperationalSharedGenerationParticipant:api.OperationalSharedParticipant).begin({database:tag+'-operation',recovered:ready,expected:backup.selection(),checkAuthority(){}});await ready.discardAndClose();ready=undefined;}else{owner=ready;ready=undefined;}
  reference=new api.SharedRichEditor(generation?profile.restore_segmented('room',native[0]):profile.restore('room',native[0]),generation?{segmentedHistory:'segmented-v1'}:{});
  if(paired)reference.enableReview(selected.options.review,native[1]);
  return{family,generation,paired,owner,recovery,expectedUploads,native,asset:secondAsset,uploadsDatabase:tag+'-uploads',
   take(value){parts=value;return value;},
   verifyFuture(value){const core=value.session?.core??value.source.session.core;assert.deepEqual(cleanupNativePair(core,selected),native);for(const action of ['redo','undo','redo']){core[action]();reference[action]();assert.deepEqual(cleanupNativePair(core,selected),cleanupNativePair(reference,selected));if(paired){const review=action==='redo'?'redoReview':'undoReview';core[review]();reference[review]();assert.deepEqual(cleanupNativePair(core,selected),cleanupNativePair(reference,selected));}}},
   async close(){reference?.dispose();await closeParts(parts);await owner?.discardAndClose();backup?.dispose();}
  };
 }catch(error){reference?.dispose();await closeParts(parts);await owner?.discardAndClose();await ready?.discardAndClose();await attempt?.close();await session?.discardAndClose();uploads?.close();backup?.dispose();throw error;}
}
