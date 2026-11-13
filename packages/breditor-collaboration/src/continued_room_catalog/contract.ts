import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ContinuedParticipantReadOptions,ContinuedParticipantSelection} from '../continued_participant/contract.js';
import type {SharedPhysicalRoomRecoveryCatalogMetadata,SharedPhysicalRoomRecoveryCatalogSelection} from '../physical_room_catalog/contract.js';

export interface ContinuedRoomCatalogEntry {
 readonly id:string;
 readonly family:'continued-local';
 readonly selection:ContinuedParticipantSelection;
 readonly bytes:number;
}
export interface ContinuedRoomCatalogMetadata extends Omit<SharedPhysicalRoomRecoveryCatalogMetadata,'formatVersion'|'participants'> {
 readonly formatVersion:4;
 readonly participants:readonly ContinuedRoomCatalogEntry[];
}
export interface ContinuedRoomCatalogPolicy {
 readonly id:string;
 readonly expected:ContinuedParticipantSelection;
 readonly restoreDocument:ContinuedParticipantReadOptions['restoreDocument'];
 readonly limits?:ContinuedParticipantReadOptions['limits'];
}
export interface ContinuedRoomCatalogReadOptions extends SharedArchiveIntegrityOptions {
 readonly policies:readonly ContinuedRoomCatalogPolicy[];
}
export interface ContinuedRoomCatalogCaptureOptions extends ContinuedRoomCatalogReadOptions {
 readonly catalog:string;
 readonly origin:Readonly<{file:Blob;expected:ContinuedRoomCatalogMetadata['origin']['identity']}>;
 readonly current:Readonly<{
  server:Readonly<{file:Blob;expected:ContinuedRoomCatalogMetadata['current']['server']['identity']}>;
  participants:Readonly<{file:Blob;expected:ContinuedRoomCatalogMetadata['current']['participants']['identity']}>;
 }>;
 readonly participants:readonly Readonly<{id:string;file:Blob;expected:ContinuedParticipantSelection}>[];
}
export type ContinuedRoomCatalogSelection=SharedPhysicalRoomRecoveryCatalogSelection;
