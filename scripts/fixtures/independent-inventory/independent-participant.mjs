/** Development fixture: unchanged genuine native histories, separately selected lane boundaries. */
import assert from 'node:assert/strict';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
import {IndependentDeliveryCompanion} from '../../../packages/breditor-collaboration/dist/independent_delivery/companion.js';
import {independentOptionsIdentity} from '../../../packages/breditor-collaboration/dist/independent_history/identity.js';
export async function independentParticipant({api,rich,profile,fixture,metadata,client,documentSegmented,reviewSegmented,tag,documentCheckpoint=client.documentCheckpoint,reviewCheckpoint=client.reviewCheckpoint,principal=client.principal,edit=true,changeBinding,changeRetained,prepareDelivery,prepareUploads,endpoint='ws://127.0.0.1:1/ws'}){
 const writer=client.writer,room=metadata.room.document,account=metadata.accounts.find(r=>r.principal===principal),readOnly=client.observer||account.documentRole===null,access=client.observer||account.reviewRole===null?'read_only':account.reviewRole==='moderator'?'moderate':'comment',transport=fixture.atomic?{writerTransport:'atomic-v2'}:{};
 const binding={document:{endpoint,principal,room,writer,...transport},review:{endpoint,principal,room,actor:client.actor,documentWriter:writer,binding:metadata.review.binding,...transport,...(client.observer?{reviewEditing:'read_only'}:{})}},retained={suggestions:fixture.atomic?{identity:{endpoint,principal,room,documentWriter:writer,effectWriter:metadata.serverAuthors.find(r=>r.kind==='suggestionEffect').clock.writer,binding:metadata.suggestionsBinding,writerTransport:'atomic-v2'},ownedHistory:null}:null,revisions:fixture.atomic?{binding:metadata.revisionsBinding}:null,versions:{endpoint,principal,room,documentWriter:writer,binding:metadata.versionsBinding,...transport}};
 changeBinding?.(binding);changeRetained?.(retained);
 const options={database:tag+'-source',room,writer,richLanguage:fixture.language,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly,review:{actor:client.actor,principal,access},documentHistory:documentSegmented?{kind:'segmented-v1',initialGenerations:{root:tag+'-doc-root',active:tag+'-doc-active'},restoreSegmented:checkpoint=>profile.restore_segmented(room,checkpoint)}:{kind:'original',restoreOriginal:checkpoint=>profile.restore(room,checkpoint)},reviewHistory:reviewSegmented?{kind:'segmented-v1',initialGenerations:{root:tag+'-review-root',active:tag+'-review-active'}}:{kind:'original'},create(){throw Error('restore only');},binding,retained,onError(){}};
 let staging,session,uploads,backup,source;
 try{
  staging=new api.SharedRichEditor(profile.restore(room,documentCheckpoint));staging.setReadOnly(readOnly);
  if(documentSegmented)staging[readOnly?'enableReadOnlySegmentedHistory':'enableSegmentedHistory'](tag+'-doc-root',tag+'-doc-active');
  staging.enableReview(options.review,reviewCheckpoint);
  if(reviewSegmented)staging[access==='read_only'?'enableReadOnlyReviewHistoryGenerations':'enableReviewHistoryGenerations'](tag+'-review-root',tag+'-review-active');
  const companion=new IndependentDeliveryCompanion(options),recovery={format:'breditor/shared-independent-delivery-recovery',formatVersion:1,source:{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:independentOptionsIdentity(options),documentCheckpoint:staging.checkpointJson(),reviewCheckpoint:reviewSegmented?staging.reviewSegmentedCheckpoint():staging.reviewCheckpoint(),versions:[]},relay:companion.current(),retainedBinding:companion.retainedBinding,retained:companion.records()};
  staging.dispose();staging=undefined;session=await api.SharedIndependentDeliverySession.restoreRecovery({...options,recovery,writerRecovery:'host-reacquired'});
  if(edit&&!readOnly){session.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Independent offline suffix '}}]});session.core.undo();if(access!=='read_only'){session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Independent offline comment'}});session.core.undoReview();}}
  // Optional fixture-only real session actions run before the actual capture.
  // Default fixtures and their native/protocol meanings are unchanged.
  await prepareDelivery?.(session,options);
  await session.flush();uploads=await rich.RichAssetStore.open(tag+'-uploads');await uploads.ingest(new Blob([pixel],{type:'image/png'}));await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));
  await prepareUploads?.(uploads);
  const captured=await api.captureSharedIndependentDeliveryParticipant({participant:tag,principal,source:{session},assets:uploads,checkAuthority(){}});assert.equal(captured.kind,'ready');backup=captured.backup;source=api.captureSharedIndependentDeliverySource({session});
  const h={options,client,session,uploads,backup,source,async close(){h.source?.dispose();h.backup.dispose();await h.session.discardAndClose();h.uploads.close();}};return h;
 }catch(error){staging?.dispose();source?.dispose();backup?.dispose();await session?.discardAndClose();uploads?.close();throw error;}
}
