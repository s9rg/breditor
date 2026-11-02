/** Join only results from one genuine held work item. This is DATA composition,
 * never a public constructor for Native ownership or permission to activate. */
import type {ResolvedServerPacketRecoveryOutcome} from '../server_packet_source_resolution/contract.js';
import type {ServerPacketReconciliationRead} from '../server_packet_reconciliation/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from './contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const pin=(file:Readonly<{bytes:number;sha256:string}>)=>({bytes:file.bytes,sha256:file.sha256});
export function composeReconciledServerPacketRecovery(recovery:ResolvedServerPacketRecoveryOutcome,reconciliation:ServerPacketReconciliationRead):ReconciledServerPacketRecoveryCapture {
 const resolved=recovery.bundle,original=resolved.original,packets=original.packets,references=pin(packets.references.references),native=reconciliation.sources.native;
 if(!same(references,reconciliation.sources.parent.references)
  ||!same(references,pin(reconciliation.original.assets.references.references))
  ||original.dependencies.sha256!==reconciliation.sources.parent.nativeResponseSha256
  ||!same(packets.containment.reconciliation,reconciliation.original)
  ||!same(original.server.identity,native.selection.source.server)
  ||!same(original.inventory.identity,native.selection.source.participants)
  ||!same(native.selection,reconciliation.original.legacy.native.control.current))throw fail('metadata_packet_retention_changed');
 return frozen({format:'breditor/reconciled-server-packet-recovery',formatVersion:1,scope:'same-held-client-native-metadata-server-bytes-and-current-provider',recovery,reconciliation,binding:{references,packets:pin(packets.packets.manifest),dependencies:pin(original.dependencies),resolution:pin(resolved.resolution)}});
}
