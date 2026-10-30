/** Literal first accepted packet transfer; content identity and byte digest are distinct. */
import type {OriginalPacketFingerprint,ServerMetadataFamily} from './contract.js';
export const MAX_SERVER_METADATA_PACKET_BYTES=4*1024*1024;
export const MAX_SERVER_METADATA_PACKET_RESPONSE_BYTES=16*1024*1024;
export type OriginalMetadataPacketKind='version'|'suggestion'|'revision';
export interface OriginalMetadataPacketQuery {readonly kind:OriginalMetadataPacketKind;readonly expected:OriginalPacketFingerprint}
export interface OriginalMetadataPacket {readonly kind:OriginalMetadataPacketKind;readonly fingerprint:OriginalPacketFingerprint;readonly text:string}
/** Descriptive DATA, never a local ACK, recipient grant or activation capability. */
export interface SelectedServerMetadataPacketRead<S> {
 readonly format:`breditor/${ServerMetadataFamily}-metadata-packet-read`;
 readonly formatVersion:1;
 readonly selection:S;
 readonly requestSha256:string;
 readonly scope:'selected-server-original-accepted-metadata-packet-bytes';
 readonly packet:OriginalMetadataPacket;
}
