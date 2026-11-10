/** Cold data admission rehashes every byte and rechecks the complete sealed lineage. */
import {fields} from '../physical_room_record_cut/policy.js';
import {decodeActivationGraph} from '../room_native_activation_intent/graph_decode.js';
import {assertHandoverActivationCapture} from './capture_binding.js';
import {snapshotRoomHandoverActivationEncodedCapture} from './snapshot_encoded.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {HandoverReconciledServerPacketRecoveryCapture} from '../metadata_packet_retention/handover_input.js';
import type {RoomHandoverActivationEncodedCapture} from './contract.js';
export async function decodeRoomHandoverActivationIntent(input:RoomHandoverActivationEncodedCapture,options:SharedArchiveIntegrityOptions):Promise<HandoverReconciledServerPacketRecoveryCapture>{
 const selected=snapshotRoomHandoverActivationEncodedCapture(input);
 const decoded=await decodeActivationGraph(selected,'breditor/room-native-handover-activation-capture-graph',options);
 const capture=Object.freeze(fields(decoded.value,['format','formatVersion','handover','capture'])) as unknown as HandoverReconciledServerPacketRecoveryCapture;
 assertHandoverActivationCapture(selected.choice.activation,selected.choice.handover,capture);decoded.check();return capture;
}
