/** Retain the original path observation and bind a separately selected controller
 * to the same sealed lineage and exact current source. Data proves no live grant. */
import {fields} from '../physical_room_record_cut/policy.js';
import {assertRoomActivationCapture} from '../room_native_activation_intent/capture_binding.js';
import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import {containsOrderedDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
import {detachResolvedServerPacketRecoveryBundle} from '../server_packet_source_resolution/bundle.js';
import {fail} from '../room_native_activation_intent/policy.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection as Handover} from '../generation_delivery_path_control/handover.js';
import type {HandoverReconciledServerPacketRecoveryCapture as Capture} from '../metadata_packet_retention/handover_input.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function assertHandoverActivationCapture(activation:SharedDurableNativeActivationSelection,handover:Handover,capture:Capture):void{
 const outer=fields(capture,['format','formatVersion','handover','capture']);
 if(outer['format']!=='breditor/handover-reconciled-server-packet-recovery'||outer['formatVersion']!==1)throw fail();
 const original=handoverDeliveryPathSelection(outer['handover']),current=handoverDeliveryPathSelection(handover);
 const body=fields(outer['capture'],['format','formatVersion','scope','recovery','reconciliation','binding']);
 if(body['format']!=='breditor/reconciled-server-packet-recovery'||body['formatVersion']!==1||body['scope']!=='same-held-client-native-metadata-server-bytes-and-current-provider')throw fail();
 const normal=body as unknown as ReconciledServerPacketRecoveryCapture;
 detachResolvedServerPacketRecoveryBundle(normal.recovery.bundle);
 if(normal.recovery.kind!=='retained'||normal.recovery.bundle.assets.kind!=='retained')throw fail('activation_intent_incomplete');
 assertRoomActivationCapture(activation,normal);
 if(!same(original.current.path.current,activation.current)||!same(current.current.path.current,activation.current)||
  !same(original.path.seal,current.path.seal)||!same(original.path.earlier,current.path.earlier)||
  !same(original.path.successor.current,current.path.successor.current)||
  !containsOrderedDeliveryCuts(current.path.successor.ancestors,original.path.successor.ancestors))throw fail('activation_intent_stale');
}
