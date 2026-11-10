/** Complete handover lineage and recovery bytes retained as inert intent DATA.
 * Neither a parsed choice nor a saved receipt grants a Native service. */
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';
import type {HandoverReconciledServerPacketRecoveryCapture} from '../metadata_packet_retention/handover_input.js';
import type {RoomActivationBlobPin} from '../room_native_activation_intent/contract.js';
import type {ActivationStoredEncoding,ActivationStoredIntent,ActivationStoredState} from '../room_native_activation_intent/store_contract.js';

export interface RoomHandoverActivationIntentChoice {
 readonly format:'breditor/room-native-handover-activation-intent';readonly formatVersion:1;
 readonly database:string;
 readonly activation:SharedDurableNativeActivationSelection;
 /** Explicitly selected path, which may use a freshly authenticated controller. */
 readonly handover:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
 readonly graph:RoomActivationBlobPin;
 readonly objects:readonly RoomActivationBlobPin[];
 readonly totalBytes:number;
}
export interface RoomHandoverActivationIntentState extends ActivationStoredState {
 readonly format:'breditor/room-native-handover-activation-intent-state';
}
export type RoomHandoverActivationEncodedCapture=ActivationStoredEncoding<RoomHandoverActivationIntentChoice>;
export type RoomHandoverActivationRetainedIntent=ActivationStoredIntent<RoomHandoverActivationIntentChoice,HandoverReconciledServerPacketRecoveryCapture,RoomHandoverActivationIntentState>;
