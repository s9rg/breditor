/** Reprepare original component policy without changing any selected native history or saved plan. */
import {prepareRecovery} from "../participant_recovery/prepare.js";
import {snapshotGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import type {V2StagedParticipant} from "../room_recovery_catalog_v2/staged_participant.js";
import type {MixedCatalogStagePolicy} from "../mixed_catalog_stage/prepare.js";
import {physicalOperationFailure as fail} from "./policy.js";
export async function repreparePhysicalClientOwners(owners:readonly V2StagedParticipant[],guard:()=>void,signal?:AbortSignal):Promise<MixedCatalogStagePolicy[]> {
 const policies:MixedCatalogStagePolicy[]=[];
 for(const owner of owners){
  if(owner.family==="original"){
   const old=owner.value.policy,{signal:_signal,checkAuthority:_authority,...rest}=old.options,options={...rest,checkAuthority:guard,...(signal?{signal}:{})},prepared=await prepareRecovery(options);guard();
   if(prepared.record.plan!==old.prepared.record.plan)throw fail("physical_operation_diverged");policies.push({id:owner.id,family:"original",value:{id:owner.id,options,prepared}});
  }else{
   const{backup,signal:_signal,checkAuthority:_authority,...rest}=owner.policy.options,base=snapshotGenerationRecovery({...rest,checkAuthority:guard,...(signal?{signal}:{})},false);guard();
   if(base.record.plan!==owner.policy.plan)throw fail("physical_operation_diverged");policies.push({id:owner.id,family:"generation",options:{...base.options,backup},plan:base.record.plan});
  }
 }
 return policies;
}
