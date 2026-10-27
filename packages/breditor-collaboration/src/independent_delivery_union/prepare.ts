/** Prepare on private native owners. No live adapter, storage, writer lease or provider is mutated. */
import{SharedRichEditor,reserveNativeRecovery}from'../core.js';
import{nativeBranchAuthorizations}from'../native_recovery/branch_authorizations.js';
import{snapshotReadFactoryData}from'../operation_read/read_factory_snapshot.js';
import{snapshotIndependentDeliveryIdentityFactory}from'../independent_delivery_recovery/factory_policy.js';
import{NativeReconstructionWaits}from'../selected_native_reconstruction/read_waits.js';
import{replayPortableRecovery}from'../independent_operation/portable_replay.js';
import{IndependentDeliveryCompanion}from'../independent_delivery/companion.js';
import{independentDeliveryIdentity}from'../independent_delivery/identity.js';
import{sourceCoreMethods as native}from'../source_native_read.js';
import{freezeGeneration}from'../generation_source/identity.js';
import type{SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery}from'../independent_delivery/contract.js';
import type{SharedIndependentDeliveryUnionOptions,SharedIndependentDeliveryUnionPreparation}from'./contract.js';
import{readDeliveryUnionInput}from'./input.js';
import{unionDeliveryRelay}from'./relay.js';
import{unionDeliveryRetained}from'./retained.js';
import{unionLocalVersions}from'./versions.js';
import{unionFields as fields,unionFailure as fail}from'./policy.js';
const verify=SharedRichEditor.prototype.verifyNativeBranchUnion;
/** The returned object is DATA. Persist both exact inputs before a separately authorized replacement/activation. */
export async function prepareSharedIndependentDeliveryBranchUnion(provided:SharedIndependentDeliveryUnionOptions):Promise<SharedIndependentDeliveryUnionPreparation>{
 const raw=fields(provided,['currentJson','incomingJson','session','authorizations','checkAuthority'],['signal']);
 if(typeof raw['checkAuthority']!=='function')throw fail('independent_delivery_union_policy');
 // Snapshot host data before the first await. A caller cannot swap factories,
 // credentials or historical grants while the native readers are being restored.
 const factory=snapshotReadFactoryData(raw['session'] as SharedIndependentDeliveryUnionOptions['session']),grants=JSON.parse(nativeBranchAuthorizations(raw['authorizations'])).authorizations as SharedIndependentDeliveryUnionOptions['authorizations'];
 const work=new NativeReconstructionWaits(raw['checkAuthority'] as ()=>void,[raw['signal'] as AbortSignal|undefined]),check=work.check;
 let before:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined,incoming:typeof before,candidate:typeof before,lease:ReturnType<typeof reserveNativeRecovery>|undefined;
 try{
  const a=await readDeliveryUnionInput(raw['currentJson'],check),b=await readDeliveryUnionInput(raw['incomingJson'],check);
  const identity=independentDeliveryIdentity(a.source.identity,a.relay.binding,a.retainedBinding);
  if(JSON.stringify(identity)!==JSON.stringify(independentDeliveryIdentity(b.source.identity,b.relay.binding,b.retainedBinding)))throw fail('independent_delivery_union_identity');
  const chosen=snapshotIndependentDeliveryIdentityFactory(identity,factory,true),history=chosen.documentHistory;
  const session={...chosen,database:'union-read-only-no-storage',create(){throw fail('independent_delivery_union_policy');},documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}} as SharedIndependentDeliveryOptions;
  before=await replayPortableRecovery(session,a,check);incoming=await replayPortableRecovery(session,b,check);candidate=await replayPortableRecovery(session,a,check);
  before.check();incoming.check();candidate.check();lease=reserveNativeRecovery([candidate.core]);
  const outcome=lease.reconcileNativeBranch(candidate.core,incoming.core,grants);check();before.check();incoming.check();
  verify.call(candidate.core,before.core);verify.call(candidate.core,incoming.core);
  const retained=unionDeliveryRetained(candidate.core,a,b),relay=unionDeliveryRelay(a.relay,b.relay),versions=unionLocalVersions(candidate.core,a.source.versions,b.source.versions);
  const recovery:SharedIndependentDeliveryRecovery={...a,source:{...a.source,documentCheckpoint:native.checkpointJson.call(candidate.core),reviewCheckpoint:(a.source.identity.reviewHistory==='original'?native.reviewCheckpoint:native.reviewSegmentedCheckpoint).call(candidate.core),versions},relay,retained:retained.records};
  // Re-run the original closed cut codec and complete native/store admission
  // before any result escapes. The ordinary restore factory consumes this exact recovery.
  const admitted=await readDeliveryUnionInput(JSON.stringify(recovery),check);before.check();incoming.check();lease.check();
  const companion=new IndependentDeliveryCompanion(session,admitted);try{companion.admit(candidate.core);}finally{companion.releaseRecords();}
  const result=freezeGeneration({format:'breditor/shared-independent-delivery-union-preparation' as const,formatVersion:1 as const,inputs:{currentJson:raw['currentJson'] as string,incomingJson:raw['incomingJson'] as string},recovery:admitted,native:outcome,retained:retained.result});
  check();before.check();incoming.check();verify.call(candidate.core,before.core);verify.call(candidate.core,incoming.core);lease.check();
  if(native.view.call(candidate.core).readOnly!==true||native.checkpointJson.call(candidate.core)!==admitted.source.documentCheckpoint||(a.source.identity.reviewHistory==='original'?native.reviewCheckpoint:native.reviewSegmentedCheckpoint).call(candidate.core)!==admitted.source.reviewCheckpoint)throw fail('independent_delivery_union_changed');
  return result;
 }finally{try{lease?.close();}finally{try{candidate?.dispose();}finally{try{incoming?.dispose();}finally{try{before?.dispose();}finally{work.close();}}}}}
}
