/** Genuine original-family operation, with native histories and dependent stores.
 * Capture hooks observe the factories' actual owners; no detached owner DTO is adopted. */
import assert from 'node:assert/strict';
import {recoverParticipant} from '../room-participant-inventory/participant.mjs';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
export async function originalOperation(input,checkAuthority=()=>{}){
 const {api,rich,tag}=input,{stagedReadOnlyFactory}=await import(new URL('./native_restore_factory.js',import.meta.resolve('@breditor/collaboration')).href);
 // Use the exact genuine catalog wrapper: the private replay unwraps its raw
 // factory instead of attempting a second one-shot policy initialization.
 const h=await recoverParticipant({...input,uploads:[pixel,secondPixel],configureRecoveryOptions:options=>({...options,review:{...options.review,access:'read_only'},restore:stagedReadOnlyFactory(options.restore,options,checkAuthority)})}),parts={sources:h.recovered.sources,session:h.recovered.session,uploads:h.recovered.uploads};
 const {backup:_backup,database:recoveryDatabase,...base}=h.recovery;
 const resume={...base,database:tag+'-operation',recoveryDatabase,checkAuthority,currentPolicy:{documentReadOnly:h.readOnly,reviewAccess:h.readOnly?'read_only':'comment'}};
 Object.assign(h,{parts,operation:undefined,operationResume:resume});
 const closeParts=async()=>{await h.parts.sources.revisions?.discardAndClose();await h.parts.sources.suggestions?.discardAndClose();await h.parts.sources.versions?.discardAndClose();await h.parts.session.discardAndClose();h.parts.uploads.close();};
 h.exportRecovery=()=>({session:h.parts.session.exportRecovery(),...(h.parts.sources.versions?{versions:h.parts.sources.versions.exportRecovery()}:{}),...(h.parts.sources.suggestions?{suggestions:h.parts.sources.suggestions.exportRecovery()}:{}),...(h.parts.sources.revisions?{revisions:h.parts.sources.revisions.exportRecovery()}: {})});
 h.takeParts=value=>{h.parts=value;};
 h.coldOperation=async()=>{
  await h.operation.discardAndClose();await closeParts();
  const capture=api.SharedAssetReferenceCapture.capture,openAssets=rich.RichAssetStore.openRetained;let sources,uploads;
  try{api.SharedAssetReferenceCapture.capture=function(input){const result=capture.call(this,input);sources={...input};return result;};rich.RichAssetStore.openRetained=async function(...args){const result=await openAssets.apply(this,args);if(args[0]===resume.destinations.uploads)uploads=result;return result;};
   h.operation=await api.OperationalSharedParticipant.resume(resume);assert.ok(sources?.session);assert.ok(uploads);h.parts={sources,session:sources.session,uploads};return h.operation;
  }finally{api.SharedAssetReferenceCapture.capture=capture;rich.RichAssetStore.openRetained=openAssets;}
 };
 const close=h.close;h.close=async()=>{await h.operation?.discardAndClose();await closeParts();await close();};
 try{h.operation=await api.OperationalSharedParticipant.begin({database:resume.database,recovered:h.recovered,expected:h.backup.selection(),checkAuthority});return h;}catch(error){await h.close();throw error;}
}
