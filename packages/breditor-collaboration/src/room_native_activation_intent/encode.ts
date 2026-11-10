/** Original V1 graph header, traversal order, pins and binding remain literal. */
import {nativeActivationSelection} from '../native_activation_control/identity.js';
import {assertRoomActivationCapture} from './capture_binding.js';
import {encodeActivationGraph} from './graph_encode.js';
import {roomActivationIntentChoice} from './identity.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {RoomActivationEncodedCapture} from './contract.js';
export async function encodeRoomActivationIntent(database:string,activation:SharedDurableNativeActivationSelection,capture:ReconciledServerPacketRecoveryCapture,options:SharedArchiveIntegrityOptions):Promise<RoomActivationEncodedCapture>{
 const selected=nativeActivationSelection(activation);
 const encoded=await encodeActivationGraph(capture,'breditor/room-native-activation-capture-graph',options,()=>assertRoomActivationCapture(selected,capture));
 const choice=roomActivationIntentChoice({format:'breditor/room-native-activation-intent',formatVersion:1,database,activation:selected,graph:encoded.pin,objects:encoded.objectPins,totalBytes:encoded.totalBytes});
 return Object.freeze({choice,graph:encoded.graph,objects:encoded.objects});
}
