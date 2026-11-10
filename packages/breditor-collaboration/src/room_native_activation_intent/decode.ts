/** Original V1 graph restores only its original closed recovery family. */
import {assertRoomActivationCapture} from './capture_binding.js';
import {rememberDecodedActivationWire} from './decoded_wire.js';
import {snapshotRoomActivationEncodedCapture} from './snapshot_encoded.js';
import {decodeActivationGraph} from './graph_decode.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import {detachResolvedServerPacketRecoveryBundle} from '../server_packet_source_resolution/bundle.js';
import type {RoomActivationEncodedCapture} from './contract.js';
import {roomActivationIntentChoice} from './identity.js';
import {fail} from './policy.js';
export async function decodeRoomActivationIntent(input:RoomActivationEncodedCapture,options:SharedArchiveIntegrityOptions):Promise<ReconciledServerPacketRecoveryCapture>{
 const selected=snapshotRoomActivationEncodedCapture(input),choice=roomActivationIntentChoice(selected.choice);
 const decoded=await decodeActivationGraph(selected,'breditor/room-native-activation-capture-graph',options);
 const restored=fields(decoded.value,['format','formatVersion','scope','recovery','reconciliation','binding']);
 if(restored['format']!=='breditor/reconciled-server-packet-recovery'||restored['formatVersion']!==1||restored['scope']!=='same-held-client-native-metadata-server-bytes-and-current-provider')throw fail();
 const recovery=fields(restored['recovery'],['kind','bundle']);if(recovery['kind']!=='retained'&&recovery['kind']!=='pending')throw fail();
 detachResolvedServerPacketRecoveryBundle(recovery['bundle']);assertRoomActivationCapture(choice.activation,restored as unknown as ReconciledServerPacketRecoveryCapture);prepareArchiveIntegrity(options).guard();
 const capture=Object.freeze(restored) as unknown as ReconciledServerPacketRecoveryCapture;
 rememberDecodedActivationWire(capture,{choice,graph:selected.graph,objects:decoded.objects});return capture;
}
