/** Exact native read-only replay shared by live capture and portable admission. */
import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {disposeOwnedCore} from '../owned_core_lifetime.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {admitPairedVersions} from '../persistence/review_record_admission.js';
import {NativeReconstructionError} from '../selected_native_reconstruction/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import type {SharedEditorOptions,SharedRustOwner,SharedSelectionPolicy} from '../types.js';
import type {ContinuedPairIdentity,SharedContinuedPairOptions,SharedContinuedPairRecovery} from './contract.js';

const fail=(code:string,message:string)=>new SharedEditorError(code,message);
type Replay<P extends SharedSelectionPolicy>=(recovery:SharedContinuedPairRecovery,check:()=>void)=>Promise<SharedRichEditor<P>>;

export async function withContinuedPairReplay<P extends SharedSelectionPolicy,T>(
 identity:ContinuedPairIdentity,restore:SharedContinuedPairOptions<P>['restoreDocument'],
 check:()=>void,signal:AbortSignal|undefined,use:(replay:Replay<P>)=>Promise<T>,
):Promise<T>{
 let waits:NativeReconstructionWaits|undefined;
 try{
  const active=new NativeReconstructionWaits(check,[signal]);
  waits=active;
  return await use(async(recovery,checkRead)=>{
   const raw=await active.call(()=>restore(recovery.documentCheckpoint),freeUnclaimedSharedRustOwner);
   try{
    checkRead();
    return admitContinuedPair<P>(raw,identity,{...identity.review,access:'read_only'},true,{},recovery,recovery.versions).core;
   }catch(error){freeUnclaimedSharedRustOwner(raw);throw error;}
  });
 }catch(error){
  if(error instanceof NativeReconstructionError&&error.code==='native_reconstruction_aborted')check();
  throw error;
 }finally{waits?.close();}
}

export function captureContinuedPair<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,identity:ContinuedPairIdentity,versions:Map<string,string>):SharedContinuedPairRecovery{
 const readReview=identity.reviewHistory==='continued-v2'?native.reviewContinuedCheckpoint:
  identity.reviewHistory==='segmented-v1'?native.reviewSegmentedCheckpoint:native.reviewCheckpoint;
 return {
  format:'breditor/shared-independent-history-recovery',formatVersion:2,identity:structuredClone(identity),
  documentCheckpoint:native.checkpointJson.call(core),reviewCheckpoint:readReview.call(core),
  versions:Object.freeze([...versions.values()]),
 };
}

/** Exact, fresh-policy native replay shared by actual cold open and read-only inspection. */
export function admitContinuedPair<P extends SharedSelectionPolicy>(
 raw:SharedRustOwner,identity:ContinuedPairIdentity,review:SharedContinuedPairOptions<P>['review'],
 readOnly:boolean,editor:SharedContinuedPairOptions<P>['editor'],
 selected:Pick<SharedContinuedPairRecovery,'documentCheckpoint'|'reviewCheckpoint'>,versions:readonly string[],
){
 initializeSharedReadOnly(raw,readOnly);
 const {selectionEditing,richLanguage,history,rangeEditing,reviewedHistory,searchHistory}=identity.native;
 const options={
  ...editor,...(searchHistory?{searchHistory}:{}),...(reviewedHistory?{reviewedHistory}:{}),
  ...(identity.documentHistory==='original'?{}:{segmentedHistory:identity.documentHistory}),
 } as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
 const core=(selectionEditing==='document-v1'?createSharedDocumentEditor(raw,options):new SharedRichEditor(raw,options)) as unknown as SharedRichEditor<P>;
 try{
  if(core.richLanguageVersion()!==richLanguage)throw fail('continued_pair_identity','Restored native grammar differs');
  if(identity.reviewHistory==='continued-v2')core.enableContinuedReview(review,selected.reviewCheckpoint);
  else if(identity.reviewHistory==='segmented-v1')core.enableSegmentedReview(review,selected.reviewCheckpoint);
  else core.enableReview(review,selected.reviewCheckpoint);
  core.sealContinuedPairPolicies(identity.documentHistory,identity.reviewHistory,history,rangeEditing);
  const admittedVersions=admitPairedVersions(core,versions);
  const captured=captureContinuedPair(core,identity,admittedVersions);
  if(captured.documentCheckpoint!==selected.documentCheckpoint||captured.reviewCheckpoint!==selected.reviewCheckpoint)
   throw fail('continued_pair_replay','Cold native replay must preserve both exact histories');
  return {core,versions:admittedVersions,capture:captured};
 }catch(error){disposeOwnedCore(core);throw error;}
}
