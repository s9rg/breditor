/** Durable local coordination DATA, distinct from every native serving decision. */
import type {SharedDurableNativeActivationSelection,SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
export interface RoomActivationBlobPin {readonly bytes:number;readonly sha256:string}
export interface RoomActivationIntentChoice {
 readonly format:'breditor/room-native-activation-intent';readonly formatVersion:1;
 readonly database:string;
 readonly activation:SharedDurableNativeActivationSelection;
 readonly graph:RoomActivationBlobPin;
 readonly objects:readonly RoomActivationBlobPin[];
 readonly totalBytes:number;
}
export interface RoomActivationIntentState {
 readonly format:'breditor/room-native-activation-intent-state';readonly formatVersion:1;
 readonly revision:number;
 readonly phase:'prepared'|'request-started'|'receipt-observed';
 readonly receipt:SharedDurableNativeActivationReceipt|null;
}
export interface RoomActivationEncodedCapture {
 readonly choice:RoomActivationIntentChoice;
 readonly graph:string;
 readonly objects:readonly Blob[];
}
export interface RoomActivationRetainedIntent {
 readonly choice:RoomActivationIntentChoice;
 readonly capture:ReconciledServerPacketRecoveryCapture;
 readonly state:RoomActivationIntentState;
}
