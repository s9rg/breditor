/** Same-reservation recovery bytes and current state remain separate DATA.
 * Retained bytes never acknowledge offline work or grant serving authority. */
import type {ResolvedServerPacketRecoveryOutcome} from '../server_packet_source_resolution/contract.js';
import type {ServerPacketReconciliationRead} from '../server_packet_reconciliation/contract.js';
import type {MetadataPacketFile} from '../metadata_packet_retention/contract.js';
export interface ReconciledServerPacketRecoveryCapture {
 readonly format:'breditor/reconciled-server-packet-recovery';readonly formatVersion:1;
 readonly scope:'same-held-client-native-metadata-server-bytes-and-current-provider';
 /** Literal existing byte-retention result, including all original Pending facts. */
 readonly recovery:ResolvedServerPacketRecoveryOutcome;
 /** Literal existing current-state result. Offline heads can remain Pending. */
 readonly reconciliation:ServerPacketReconciliationRead;
 readonly binding:Readonly<{
  references:Pick<MetadataPacketFile,'bytes'|'sha256'>;
  packets:Pick<MetadataPacketFile,'bytes'|'sha256'>;
  dependencies:Pick<MetadataPacketFile,'bytes'|'sha256'>;
  resolution:Pick<MetadataPacketFile,'bytes'|'sha256'>;
 }>;
}
