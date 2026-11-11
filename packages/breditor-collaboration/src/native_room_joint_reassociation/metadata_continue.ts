/** Continue all original facts into new destinations while every earlier
 * destination remains held and byte-exact. Resume is explicitly selected. */
import {checkColdJointActivationOrigin} from '../native_room_joint_activation/cold_origin.js';
import {previewHeldRoomMetadataContinuation,continueHeldRoomMetadata} from '../selected_local_metadata_continuation/coordinator.js';
import {metadataContinuationPreviewRequest,metadataContinuationRunRequest} from '../selected_local_metadata_continuation/requests.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {withHeldReassociationIntents} from './held_intents.js';
import type {ReassociationActionContext} from './action_context.js';
import type {JointReassociationMetadataInput} from './attempt_contract.js';
export function reassociationMetadataInput(context:ReassociationActionContext,provided:JointReassociationMetadataInput){
 checkColdJointActivationOrigin(context.origin,context.scope);context.check();const r=fields(provided,['host','inventory','checkAuthority','approve']);if(typeof r['approve']!=='function')throw fail();return{...context.choice.plan.destinations,origin:context.origin.original.bundle,host:r['host'] as JointReassociationMetadataInput['host'],inventory:r['inventory'] as JointReassociationMetadataInput['inventory'],checkAuthority:participantAuthority(r['checkAuthority'] as ()=>void),approve:r['approve'] as JointReassociationMetadataInput['approve']};
}
export async function continueReassociatedMetadata(context:ReassociationActionContext,provided:JointReassociationMetadataInput,resume:boolean){
 const {scope,witness,origin,choice,options}=context,input=reassociationMetadataInput(context,provided);
 return withHeldReassociationIntents(scope,origin,choice,options,async held=>{
  const waits=new NativeReconstructionWaits(()=>{context.check();held.check();input.checkAuthority();held.check();},
   [scope.signal,...origin.revocations,...held.revocations]);
  const heldInput={...input,checkAuthority:waits.check};
  try{
   const expected=await previewHeldRoomMetadataContinuation(scope,witness,metadataContinuationPreviewRequest(heldInput),waits.signal);
   waits.check();
   const result=await continueHeldRoomMetadata(scope,witness,metadataContinuationRunRequest({...heldInput,expected}),resume,waits.signal);
   waits.check();
   return result;
  }finally{waits.close();}
 });
}
