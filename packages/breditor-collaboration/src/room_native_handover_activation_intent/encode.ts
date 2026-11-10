/** One complete tagged graph preserves original capture and selected handover facts. */
import {nativeActivationSelection} from '../native_activation_control/identity.js';
import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import {encodeActivationGraph} from '../room_native_activation_intent/graph_encode.js';
import {roomHandoverActivationIntentChoice} from './identity.js';
import {assertHandoverActivationCapture} from './capture_binding.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection as Handover} from '../generation_delivery_path_control/handover.js';
import type {HandoverReconciledServerPacketRecoveryCapture as Capture} from '../metadata_packet_retention/handover_input.js';
import type {RoomHandoverActivationEncodedCapture} from './contract.js';
export async function encodeRoomHandoverActivationIntent(database:string,activation:SharedDurableNativeActivationSelection,handover:Handover,capture:Capture,options:SharedArchiveIntegrityOptions):Promise<RoomHandoverActivationEncodedCapture>{
 const selected=nativeActivationSelection(activation),path=handoverDeliveryPathSelection(handover);
 const encoded=await encodeActivationGraph(capture,'breditor/room-native-handover-activation-capture-graph',options,()=>assertHandoverActivationCapture(selected,path,capture));
 const choice=roomHandoverActivationIntentChoice({format:'breditor/room-native-handover-activation-intent',formatVersion:1,database,activation:selected,handover:path,graph:encoded.pin,objects:encoded.objectPins,totalBytes:encoded.totalBytes});
 return Object.freeze({choice,graph:encoded.graph,objects:encoded.objects});
}
