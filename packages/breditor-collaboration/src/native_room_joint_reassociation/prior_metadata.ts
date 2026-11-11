/** Re-admit every earlier metadata destination under the actual original
 * journals and current private target. All observations remain held together;
 * equality with saved DATA never supplies these guards. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkColdJointActivationOrigin,type ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {withHeldAbsentMetadataContinuation} from '../selected_local_metadata_continuation/held_absence.js';
import {withHeldMetadataContinuationEvidence} from '../selected_local_metadata_continuation/held_evidence.js';
import type {MetadataContinuationChoice,MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {jointReassociationPriorMetadataList} from './identity.js';
import type {JointReassociationPriorMetadata} from './contract.js';
/** Capture a specifically selected earlier continuation, or prove that its
 * declared destinations never started. A missing choice cannot hide data. */
export async function withSelectedPriorMetadata<T>(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,names:MetadataContinuationDestinations,choice:MetadataContinuationChoice|null,visit:(evidence:JointReassociationPriorMetadata,check:()=>void,revocations:readonly AbortSignal[])=>Promise<T>):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);
 const r=fields(names,['database','preparationDatabase','reviewDatabase','metadataDatabase']),selected={database:database(r['database']),preparationDatabase:database(r['preparationDatabase']),reviewDatabase:database(r['reviewDatabase']),metadataDatabase:database(r['metadataDatabase'])};if(typeof visit!=='function')throw fail();
 if(choice===null)return withHeldAbsentMetadataContinuation(scope,origin.original,selected,(evidence,check)=>visit(evidence,check,[]));
 return withHeldMetadataContinuationEvidence(scope,origin.original,choice,held=>{
  const c=held.evidence.choice,actual={database:c.database,preparationDatabase:c.prepared.database,reviewDatabase:c.review.database,metadataDatabase:c.metadata.database};
  if(!equal(actual,selected))throw fail('joint_activation_intent_stale');return visit(held.evidence,held.check,held.revocations);
 });
}
export async function withExactPriorMetadata<T>(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,provided:readonly JointReassociationPriorMetadata[],visit:(check:()=>void,revocations:readonly AbortSignal[])=>Promise<T>):Promise<T>{
 checkColdJointActivationOrigin(origin,scope);const entries=jointReassociationPriorMetadataList(provided);if(typeof visit!=='function')throw fail();const checks:(()=>void)[]=[],signals:(readonly AbortSignal[])[]=[],check=()=>{origin.check();for(const held of checks)held();origin.check();};
 const next=async(index:number):Promise<T>=>{
  check();if(index===entries.length)return visit(check,Object.freeze(signals.flat()));const selected=entries[index]!;
  const visitExact=async(actual:JointReassociationPriorMetadata,held:()=>void,revocations:readonly AbortSignal[]=[])=>{
   if(!equal(actual,selected))throw fail('joint_activation_intent_stale');checks.push(held);signals.push(revocations);try{check();return await next(index+1);}finally{checks.pop();signals.pop();}
  };
  if(selected.format==='breditor/metadata-continuation-absence')return withHeldAbsentMetadataContinuation(scope,origin.original,selected.destinations,visitExact);
  return withHeldMetadataContinuationEvidence(scope,origin.original,selected.choice,held=>visitExact(held.evidence,held.check,held.revocations));
 };
 return next(0);
}
