/** Reuse the original complete packet/raster inspector under an actual cold
 * target. Replayed Native histories, all retained metadata references and the
 * separately authenticated server/provider must still describe the same cut.
 * This action neither submits pending work nor requests activation. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {CommitRoomNativeActivationInput} from '../room_native_activation_intent/coordinator_contract.js';
import {LocalMetadataReferenceWork} from '../selected_local_metadata_assets/room_work.js';
import {readLocalMetadataReferenceClaims} from '../selected_local_metadata_assets/portable_bundle.js';
import {metadataSnapshot,metadataJson} from '../selected_local_metadata_delivery/policy.js';
import {jointIntentFailure as fail} from './intent_policy.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork} from './cold_origin.js';
export async function inspectColdJointNativeCapture(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,input:Pick<CommitRoomNativeActivationInput,'inspection'|'limits'>):Promise<void>{
 checkColdJointActivationOrigin(origin,scope);origin.check();scope.check();const current=await scope.retainCurrent();origin.check();
 const check=()=>{origin.check();scope.check();},options={wasm:current.integrity.wasm,checkAuthority:check,signal:scope.signal},bundle=origin.retained.capture.recovery.bundle,references=bundle.original.packets.references;
 const claims=await readLocalMetadataReferenceClaims(references,options,check),snapshot=origin.original.snapshot,middle=await metadataSnapshot({before:snapshot.before,current:claims.stored},origin.original.choice);check();
 const work=LocalMetadataReferenceWork.forVerifiedMetadataTarget(scope,options,check,origin.original);
 try{
  await work.begin(references.parent.parent,middle);check();
  const actual=await work.readPortable(references.parent,snapshot);check();if(metadataJson(actual)!==claims.text)throw fail('joint_activation_intent_stale');
  const inspected=await work.inspectResolvedServerPacketRecovery(bundle,actual,snapshot,input.inspection,input.limits?{limits:input.limits}:{});check();
  if(inspected.rasters.kind!=='retained'||inspected.resolution.outcome.kind!=='ready')throw fail('joint_activation_intent_incomplete');
 }finally{work.close();}
}
