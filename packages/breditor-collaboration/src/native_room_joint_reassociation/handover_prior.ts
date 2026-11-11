/** Read each selected earlier destination under the actual cold origin. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkColdJointActivationOrigin,type ColdJointHandoverOriginWork} from '../native_room_joint_activation/cold_origin.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import type {HandoverMetadataContinuationChoice} from '../selected_local_metadata_continuation/handover_contract.js';
import {withHeldAbsentMetadataContinuation} from '../selected_local_metadata_continuation/held_absence.js';
import {withHeldHandoverMetadataContinuationEvidence} from '../selected_local_metadata_continuation/held_evidence.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import type {JointHandoverReassociationPrior} from './handover_contract.js';

export async function withSelectedHandoverPrior<T>(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,names:MetadataContinuationDestinations,
 choice:HandoverMetadataContinuationChoice|null,visit:(evidence:JointHandoverReassociationPrior,check:()=>void,revocations:readonly AbortSignal[])=>Promise<T>,
):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);
 if(choice===null)return withHeldAbsentMetadataContinuation(scope,origin.original,names,(evidence,check)=>visit(evidence,check,[]));
 const c=choice.continuation;
 const actual={database:c.database,preparationDatabase:c.prepared.database,reviewDatabase:c.review.database,metadataDatabase:c.metadata.database};
 if(!equal(actual,names))throw fail('joint_activation_intent_stale');
 return withHeldHandoverMetadataContinuationEvidence(scope,origin.original,choice,held=>visit(held.evidence,held.check,held.revocations));
}

/** Entries come from the detached sealed joint choice. Keep every namespace
 * held until its exact successor operation and outcome checks finish. */
export async function withExactHandoverPriors<T>(
 scope:SelectedNativeRecoveryScope,origin:ColdJointHandoverOriginWork,entries:readonly JointHandoverReassociationPrior[],
 visit:(check:()=>void,revocations:readonly AbortSignal[])=>Promise<T>,
):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);
 const checks:(()=>void)[]=[],signals:(readonly AbortSignal[])[]=[];
 const check=()=>{origin.check();for(const held of checks)held();origin.check();};
 const next=async(index:number):Promise<T>=>{
  check();
  if(index===entries.length)return visit(check,Object.freeze(signals.flat()));
  const selected=entries[index]!;
  const exact=async(actual:JointHandoverReassociationPrior,held:()=>void,revocations:readonly AbortSignal[]=[])=>{
   if(!equal(actual,selected))throw fail('joint_activation_intent_stale');
   checks.push(held);signals.push(revocations);
   try{check();return await next(index+1);}finally{checks.pop();signals.pop();}
  };
  if(selected.format==='breditor/metadata-continuation-absence')return withHeldAbsentMetadataContinuation(scope,origin.original,selected.destinations,exact);
  return withHeldHandoverMetadataContinuationEvidence(scope,origin.original,selected.choice,held=>exact(held.evidence,held.check,held.revocations));
 };
 return next(0);
}
