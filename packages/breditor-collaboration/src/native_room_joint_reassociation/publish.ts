/** Publish only after a fresh actual metadata continuation and independent
 * decision. Retries must still contact the selected actual Native owner. */
import {checkColdJointActivationOrigin} from '../native_room_joint_activation/cold_origin.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import {previewHeldRoomMetadataContinuation,continueHeldRoomMetadata} from '../selected_local_metadata_continuation/coordinator.js';
import {metadataContinuationPreviewRequest,metadataContinuationRunRequest} from '../selected_local_metadata_continuation/requests.js';
import type {MetadataContinuationResult} from '../selected_local_metadata_continuation/contract.js';
import {decideColdActivation,nativePublicationWaits} from '../native_room_joint_activation/cold_variant.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {withHeldReassociationIntents} from './held_intents.js';
import {jointReassociationPublicationBinding} from './intent_store.js';
import {reassociationMetadataInput} from './metadata_continue.js';
import type {ReassociationActionContext} from './action_context.js';
import type {JointReassociationPublicationInput} from './attempt_contract.js';
export async function publishReassociatedRoom(context:ReassociationActionContext,publication:SharedNativeRoomPublicationHost,provided:JointReassociationPublicationInput,previous:MetadataContinuationResult){
 const{scope,origin,choice}=context;checkColdJointActivationOrigin(origin,scope);context.check();const r=fields(provided,['host','inventory','checkAuthority','approve','approvePublication']);if(typeof r['approvePublication']!=='function')throw fail();
 const approvePublication=r['approvePublication'] as JointReassociationPublicationInput['approvePublication'],input=reassociationMetadataInput(context,{host:r['host'] as JointReassociationPublicationInput['host'],inventory:r['inventory'] as JointReassociationPublicationInput['inventory'],checkAuthority:r['checkAuthority'] as ()=>void,approve:r['approve'] as JointReassociationPublicationInput['approve']}),port=nativePublicationHostPort(publication);if(!equal(port.selection,choice.plan.publication))throw fail('joint_activation_intent_stale');
 return withHeldReassociationIntents(scope,origin,choice,context.options,async held=>{
  const expected=await previewHeldRoomMetadataContinuation(scope,context.witness,metadataContinuationPreviewRequest(input));held.check();if(!equal(expected,previous.choice))throw fail('joint_activation_intent_stale');
  const continued=await continueHeldRoomMetadata(scope,context.witness,metadataContinuationRunRequest({...input,expected}),true);held.check();context.check();
  const waits=nativePublicationWaits(port,()=>{context.check();held.check();input.checkAuthority();held.check();},
   [scope.signal,...origin.revocations,...held.revocations]);
  const check=waits.check;
  let started=false;
  try{
   await decideColdActivation(choice,approvePublication,waits);
   check();
   if(!equal((await scope.retainCurrent()).current.selection,continued.choice.target))throw fail('joint_activation_intent_stale');
   check();
   started=true;
   await held.observePublicationStarted();
   check();
   const receipt=await port.publish(jointReassociationPublicationBinding(choice),check,waits.signal);
   check();
   await held.observePublicationReceipt(receipt);
   check();
   return Object.freeze({receipt,continued});
  }catch(error){
   if(started)throw publicationFailure('publication_outcome_unknown',error);
   throw error;
  }finally{waits.close();}
 });
}
