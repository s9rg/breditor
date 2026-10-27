import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Snapshot explicit native factories and host access independently of destination plans.
 * Reading an archive uses read-only replays; opening a real source requires its own
 * selected write policy. Neither choice can be recovered from saved metadata. */
import type{SharedIndependentDeliveryIdentity}from'../independent_delivery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from './contract.js';
import {independentDeliveryIdentity} from '../independent_delivery/identity.js';
import {independentOptionsIdentity} from '../independent_history/identity.js';
import {generationFields} from '../generation_source/identity.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';
const missing=()=>{throw fail('independent_delivery_recovery_missing');};
export function snapshotIndependentDeliveryFactory<P extends SharedSelectionPolicy>(expected:SharedIndependentDeliveryParticipantSelection,o:SharedIndependentDeliveryRecoveryFactory<P>,requireReadOnly:boolean):SharedIndependentDeliveryRecoveryFactory<P>{
 return snapshotIndependentDeliveryIdentityFactory(expected.identity.source,o,requireReadOnly);
}
/** Source-only readers select an identity, not a fabricated participant archive. */
export function snapshotIndependentDeliveryIdentityFactory<P extends SharedSelectionPolicy>(expected:SharedIndependentDeliveryIdentity,o:SharedIndependentDeliveryRecoveryFactory<P>,requireReadOnly:boolean):SharedIndependentDeliveryRecoveryFactory<P>{
 const required=['room','writer','richLanguage','history','rangeEditing','selectionEditing','searchHistory','reviewedHistory','readOnly','review','documentHistory','reviewHistory','binding','retained'],allowed=[...required,'editor','onError','onState'];
 if(!o||Object.keys(o).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(o,k))||typeof o.readOnly!=='boolean'||!generationFields(o.review,'access,actor,principal')||!['read_only','comment','moderate'].includes(o.review.access)||requireReadOnly&&(o.readOnly!==true||o.review.access!=='read_only'))throw fail('independent_delivery_recovery_policy');
 const dh=o.documentHistory,rh=o.reviewHistory;if(!dh||!rh||!['original','segmented-v1'].includes(dh.kind)||!['original','segmented-v1'].includes(rh.kind)||!generationFields(dh,dh.kind==='original'?'kind,restoreOriginal':'initialGenerations,kind,restoreSegmented')||!generationFields(rh,rh.kind==='original'?'kind':'initialGenerations,kind')||typeof (dh.kind==='original'?dh.restoreOriginal:dh.restoreSegmented)!=='function'||dh.kind==='segmented-v1'&&!generationFields(dh.initialGenerations,'active,root')||rh.kind==='segmented-v1'&&!generationFields(rh.initialGenerations,'active,root'))throw fail('independent_delivery_recovery_policy');
 const identity=independentDeliveryIdentity(independentOptionsIdentity({...o,database:'identity-only',create:missing}),o.binding,o.retained);if(JSON.stringify(identity)!==JSON.stringify(expected)||identity.binding.review.reviewEditing==='read_only'&&o.review.access!=='read_only')throw fail('independent_delivery_recovery_policy');
 return inheritActorLeaseInput(o,{...o,...structuredClone(identity.history.native),selectionEditing:o.selectionEditing,readOnly:o.readOnly,review:{...o.review},documentHistory:dh.kind==='original'?{...dh}:{...dh,initialGenerations:{...dh.initialGenerations}},reviewHistory:rh.kind==='original'?{...rh}:{...rh,initialGenerations:{...rh.initialGenerations}},binding:structuredClone(identity.binding),retained:structuredClone(identity.retained),...(o.editor?{editor:{...o.editor}}:{})}) as unknown as SharedIndependentDeliveryRecoveryFactory<P>;
}
