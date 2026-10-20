/** Genuine generation sessions seeded from the native server's original client cuts.
 * Account roles are reapplied explicitly. No network or old-journal export is used. */
import assert from 'node:assert/strict';
import {pixel,secondPixel,secondAsset} from '../review-assets/pixels.mjs';

const endpoint='ws://127.0.0.1:1/ws';
export async function generationParticipant({api,rich,profile,fixture,client,kind,tag,counts,edit=true,paired=true,principal=client.principal,documentCheckpoint=client.documentCheckpoint,reviewCheckpoint=client.reviewCheckpoint,readOnly,changeBinding,changeRetained}) {
 const metadata=JSON.parse(fixture.inventoryJson),room=metadata.room.document,writer=client.writer;
 readOnly??=client.observer||metadata.accounts.find(row=>row.principal===client.principal).documentRole===null;
 const review=paired?{actor:client.actor,principal,access:readOnly?'read_only':'comment'}:undefined;
 const binding={document:{endpoint,principal,room,writer,...(fixture.atomic?{writerTransport:'atomic-v2'}:{})},review:paired?{endpoint,principal,room,actor:client.actor,documentWriter:writer,binding:metadata.review.binding,...(fixture.atomic?{writerTransport:'atomic-v2'}:{}),...(client.observer?{reviewEditing:'read_only'}:{})}:null};
 const retained={suggestions:fixture.atomic?{identity:{endpoint,principal,room,documentWriter:writer,effectWriter:metadata.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer,binding:metadata.suggestionsBinding,writerTransport:'atomic-v2'},ownedHistory:null}:null,revisions:fixture.atomic?{binding:metadata.revisionsBinding}:null,versions:{endpoint,principal,room,documentWriter:writer,binding:metadata.versionsBinding,...(fixture.atomic?{writerTransport:'atomic-v2'}:{})}};
 changeBinding?.(binding);changeRetained?.(retained);
 const options={database:tag+'-source',room,writer,richLanguage:fixture.language,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly,initialGenerations:{root:tag+'-root',active:tag+'-one'},...(review?{review,initialReviewCheckpoint:reviewCheckpoint}:{}),binding,retained,create:()=>profile.restore(room,documentCheckpoint),restoreSegmented:checkpoint=>profile.restore_segmented(room,checkpoint),onError(){}};
 const open=value=>kind==='local'?api.SharedSegmentedPersistentSession.open(value):kind==='relay'?api.SharedSegmentedRelaySession.open(value):api.SharedSegmentedRelaySession.openRetained(value);
 const h={options,client,kind,readOnly,session:undefined,uploads:undefined,backup:undefined,source:undefined};
 try {
  h.session=await open(options);const core=h.session.core;
  if(edit&&!readOnly){core.select({kind:'text',anchor:{block:'p',offset:'0',affinity:'after'},focus:{block:'p',offset:'0',affinity:'after'}});core.type('Generation offline suffix 🙂 ');core.undo();if(paired){core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Generation offline comment'}});core.undoReview();}}
  if(edit&&readOnly){const raw=profile.join_frame(room,'909',core.updateFrame()),peer=new api.SharedRichEditor(raw);try{peer.select({kind:'text',anchor:{block:'p',offset:'0',affinity:'after'},focus:{block:'p',offset:'0',affinity:'after'}});peer.type('Unregistered offline peer ');await core.receiveFrame(peer.updateFrame());}finally{peer.dispose();}}
  if(paired)h.session.saveVersion('Retained local generation version','1');
  if(kind==='retained'){
   const getToken=()=>{counts.networkCalls++;throw Error('No network for historical generation inventory');},request=async()=>getToken(),transport={checkSuggestionQueue(){},checkSuggestionRevisions(){},requestSuggestionRevision:request,requestSuggestion:request,refreshDocument:request,connect:request,flush:request,suggestionRevisionsReady:()=>false,subscribe:()=>()=>{},suggestionState:()=>({revision:'0',documentRevision:'0'}),state:()=>({status:'offline'})};
   const versions=await h.session.openVersionCatalog({getToken});versions.saveVersion('Retained published-version candidate','2');await versions.flush();
   if(fixture.atomic){const queue=await h.session.openSuggestionQueue(),revisions=await h.session.openSuggestionRevisions({transport}),draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}});const proposal=queue.propose('Pending generation proposal','3',draft('Proposal text '));revisions.revise({previousSuggestionId:proposal.id,title:'Pending immutable generation revision',createdAtMs:'4',draft:draft('Revision text ')});await revisions.flush();}
  }
  await h.session.flush();
  if(edit){if(!readOnly)await h.session.sealGeneration(tag+'-two');else if(client.observer)await h.session.sealObserverGeneration(tag+'-two');}
  h.uploads=await rich.RichAssetStore.open(tag+'-uploads');await h.uploads.ingest(new Blob([pixel],{type:'image/png'}));await h.uploads.ingest(new Blob([secondPixel],{type:'image/png'}));await h.uploads.cancel(secondAsset);
  const result=await api.captureSharedGenerationParticipant({participant:tag,principal,source:{kind,session:h.session},assets:h.uploads,checkAuthority(){}});assert.equal(result.kind,'ready');h.backup=result.backup;h.source=api.captureSharedGenerationSource({kind,session:h.session});await h.backup.verifyRecovered(h.source,h.uploads);
  h.exportRecovery=()=>kind==='retained'?h.session.exportRetainedRecovery():h.session.exportRecovery();
  h.close=async()=>{h.source?.dispose();await h.operation?.discardAndClose();h.backup?.dispose();await h.session?.close();h.uploads?.close();};
  h.takeParts=parts=>{h.source?.dispose();h.session=parts.source.session;h.uploads=parts.uploads;h.source=api.captureSharedGenerationSource(parts.source);};
  h.trackOperation=async work=>{
   const capture=api.SharedGenerationSourceCapture.capture,restoreAssets=rich.RichAssetStore.restoreBackup,openAssets=rich.RichAssetStore.openRetained;let actual,assets;
   try{
    api.SharedGenerationSourceCapture.capture=function(input){const result=capture.call(this,input);actual={...input};return result;};
    rich.RichAssetStore.restoreBackup=async function(...args){const result=await restoreAssets.apply(this,args);if(args[0]===tag+'-recovered-uploads')assets=result;return result;};
    rich.RichAssetStore.openRetained=async function(...args){const result=await openAssets.apply(this,args);if(args[0]===tag+'-recovered-uploads')assets=result;return result;};
    const operation=await work();assert.equal(actual.kind,kind);assert.ok(assets);h.source?.dispose();h.session=actual.session;h.uploads=assets;h.source=capture.call(api.SharedGenerationSourceCapture,actual);h.operation=operation;return operation;
   }finally{api.SharedGenerationSourceCapture.capture=capture;rich.RichAssetStore.restoreBackup=restoreAssets;rich.RichAssetStore.openRetained=openAssets;}
  };
  h.holdOperation=async(checkAuthority=()=>{})=>{
   h.source.dispose();await h.session.close();h.uploads.close();
   const {database:_database,create:_create,initialGenerations:_generations,initialReviewCheckpoint:_review,binding,retained,...native}=options,request={database:tag+'-recovery',destinations:{source:tag+'-recovered-source',uploads:tag+'-recovered-uploads'},expected:h.backup.selection(),session:{kind,options:{...native,...(kind!=='local'?{binding}:{}),...(kind==='retained'?{retained}:{})}},checkAuthority};h.recoveryRequest=request;h.operationResume={...request,database:tag+'-operation',recoveryDatabase:request.database};
   return h.trackOperation(async()=>{const attempt=await api.SharedGenerationParticipantRecovery.begin({...request,backup:h.backup});let ready,operation;try{ready=await attempt.finish();operation=await api.OperationalSharedGenerationParticipant.begin({database:tag+'-operation',recovered:ready,expected:h.backup.selection(),checkAuthority});await operation.check();return operation;}catch(error){await operation?.discardAndClose();throw error;}finally{await ready?.discardAndClose();await attempt.close();}});
  };
  h.coldOperation=async()=>{h.source?.dispose();await h.operation?.discardAndClose();await h.session.close();h.uploads.close();return h.trackOperation(()=>api.OperationalSharedGenerationParticipant.resume(h.operationResume));};
  h.recover=async()=>{
   const operation=await h.holdOperation();try{h.takeParts(await operation.intoParts());await h.backup.verifyRecovered(h.source,h.uploads);counts.coldParticipants++;}finally{await operation.discardAndClose();h.operation=undefined;}
  };
  return h;
 }catch(error){h.source?.dispose();h.backup?.dispose();await h.session?.discardAndClose();h.uploads?.close();throw error;}
}
