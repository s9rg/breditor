/** Independently installed public contract; DATA carries no checked/ready grant. */
import {captureSelectedServerMetadata,SharedServerLogGenerationRecoveryHost,SharedPhysicalRoomRecoveryHost,ServerMetadataReadError} from '@breditor/collaboration';
import type {OriginalMetadataStartQuery,OriginalMetadataPacketQuery,SelectedServerMetadataCatalog,SharedServerLogGenerationRecoveryControlSelection,SharedPhysicalRecoveryControlSelection} from '@breditor/collaboration';
const query:OriginalMetadataStartQuery={versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}};
export async function generation(host:SharedServerLogGenerationRecoveryHost,packet:OriginalMetadataPacketQuery){
 const catalog:SelectedServerMetadataCatalog<SharedServerLogGenerationRecoveryControlSelection>=await captureSelectedServerMetadata(host,query);
 const read=await host.readMetadataPacket(packet);const text:string=read.packet.text;
 // @ts-expect-error Server data cannot install an ACK or activate a room.
 catalog.activate();
 return {catalog,text};
}
export async function physical(host:SharedPhysicalRoomRecoveryHost){const catalog:SelectedServerMetadataCatalog<SharedPhysicalRecoveryControlSelection>=await captureSelectedServerMetadata(host,query);return catalog;}
export function errorCode(error:ServerMetadataReadError){return error.code;}
// @ts-expect-error Complete collection cannot start from an arbitrary old interval.
const skipped:OriginalMetadataStartQuery={versions:{kind:'after',cursor:{binding:'a'.repeat(64),after:'0',through:'1'}},suggestions:{kind:'disabled'},revisions:{kind:'disabled'}};
void skipped;
