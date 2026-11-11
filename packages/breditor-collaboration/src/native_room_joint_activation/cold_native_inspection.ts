/** Reuse the original complete packet/raster inspector under an actual cold
 * target. Replayed Native histories, all retained metadata references and the
 * separately authenticated server/provider must still describe the same cut.
 * This action neither submits pending work nor requests activation. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {CommitRoomNativeActivationInput} from '../room_native_activation_intent/coordinator_contract.js';
import type {CommitHandoverRoomNativeActivationInput} from '../room_native_handover_activation_intent/coordinator_contract.js';
import type {ResolvedServerPacketRecoveryBundle} from '../server_packet_source_resolution/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import {LocalMetadataReferenceWork} from '../selected_local_metadata_assets/room_work.js';
import {readLocalMetadataReferenceClaims} from '../selected_local_metadata_assets/portable_bundle.js';
import {metadataSnapshot,metadataJson} from '../selected_local_metadata_delivery/policy.js';
import {jointIntentFailure as fail} from './intent_policy.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork,type ColdJointHandoverOriginWork} from './cold_origin.js';
async function inspect(
 scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork|ColdJointHandoverOriginWork,
 bundle:ResolvedServerPacketRecoveryBundle,signal:AbortSignal,
 inspectRecovery:(work:LocalMetadataReferenceWork,body:LocalMetadataReferenceCut,snapshot:LocalMetadataDeliverySnapshot)=>ReturnType<LocalMetadataReferenceWork['inspectResolvedServerPacketRecovery']>,
):Promise<void>{
 origin.check();scope.check();const current=await scope.retainCurrent();origin.check();
 const check=()=>{origin.check();scope.check();};
 const options={wasm:current.integrity.wasm,checkAuthority:check,signal},references=bundle.original.packets.references;
 const claims=await readLocalMetadataReferenceClaims(references,options,check),snapshot=origin.original.snapshot,middle=await metadataSnapshot({before:snapshot.before,current:claims.stored},origin.original.choice);check();
 const work=LocalMetadataReferenceWork.forVerifiedMetadataTarget(scope,options,check,origin.original);
 try{
  await work.begin(references.parent.parent,middle);check();
  const actual=await work.readPortable(references.parent,snapshot);check();if(metadataJson(actual)!==claims.text)throw fail('joint_activation_intent_stale');
  const inspected=await inspectRecovery(work,actual,snapshot);check();
  if(inspected.rasters.kind!=='retained'||inspected.resolution.outcome.kind!=='ready')throw fail('joint_activation_intent_incomplete');
 }finally{work.close();}
}
export async function inspectColdJointNativeCapture(
 scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,input:Pick<CommitRoomNativeActivationInput,'inspection'|'limits'>,signal:AbortSignal,
):Promise<void>{
 checkColdJointActivationOrigin(origin,scope);
 const bundle=origin.retained.capture.recovery.bundle;
 await inspect(scope,origin,bundle,signal,(work,actual,snapshot)=>work.inspectResolvedServerPacketRecovery(bundle,actual,snapshot,input.inspection,input.limits?{limits:input.limits}:{}));
}
export async function inspectColdJointHandoverCapture(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,input:Pick<CommitHandoverRoomNativeActivationInput,'inspection'|'limits'|'path'>,signal:AbortSignal,
):Promise<void>{
 checkColdJointActivationOrigin(origin,scope);
 const {handover,capture}=origin.retained.capture,bundle=capture.recovery.bundle;
 await inspect(scope,origin,bundle,signal,(work,actual,snapshot)=>work.inspectResolvedServerPacketRecoveryAcrossHandover(bundle,actual,snapshot,input.inspection,input.path,input.limits?{limits:input.limits}:{},handover));
}
