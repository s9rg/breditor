/** Bind new controller DATA to the original checkpoint lineage and bytes. */
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection as Handover} from '../generation_delivery_path_control/handover.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import {fail} from '../room_native_activation_intent/policy.js';
import {continuesSealedDeliverySelection} from '../generation_delivery_path_control/retained_cuts.js';
import type {RoomHandoverActivationIntentChoice} from './contract.js';
import {roomHandoverActivationIntentChoice} from './identity.js';

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function handoverActivationReassociationChoice(
 previous:RoomHandoverActivationIntentChoice,database:string,activation:SharedDurableNativeActivationSelection,handover:Handover,
):RoomHandoverActivationIntentChoice{
 if(database===previous.database)throw fail('activation_intent_policy');
 const old=previous.activation;
 if(activation.instance===old.instance||handover.current.instance===previous.handover.current.instance||
    !equal(activation.current,old.current)||!equal(activation.previous.identity,old.previous.identity))throw fail('activation_intent_stale');
 const sameCheckpoint=equal(activation.previous,old.previous)&&equal(activation.planned,old.planned)&&equal(activation.checkpointSha256,old.checkpointSha256);
 const childCheckpoint=equal(activation.previous,old.planned)&&!equal(activation.checkpointSha256,old.checkpointSha256);
 if(!sameCheckpoint&&!childCheckpoint)throw fail('activation_intent_stale');
 if(!continuesSealedDeliverySelection(previous.handover,handover))throw fail('activation_intent_stale');
 return roomHandoverActivationIntentChoice({...previous,database,activation,handover});
}
