import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ContinuedDeliveryParticipantSelection,ContinuedParticipantReadOptions,ContinuedParticipantSelection} from '../continued_participant/contract.js';
import type {SharedPhysicalRoomRecoveryCatalogMetadata,SharedPhysicalRoomRecoveryCatalogSelection} from '../physical_room_catalog/contract.js';

import type {PhysicalRoomCatalogV3Entry,PhysicalRoomCatalogV3Input,PhysicalRoomCatalogV3ReadOptions} from '../physical_room_catalog_v3/contract.js';

export interface ContinuedRoomCatalogLocalEntry {
 readonly id:string;
 readonly family:'continued-local';
 readonly selection:ContinuedParticipantSelection;
 readonly bytes:number;
}
export interface ContinuedRoomCatalogDeliveryEntry {
 readonly id:string;
 readonly family:'continued-delivery';
 readonly selection:ContinuedDeliveryParticipantSelection;
 readonly bytes:number;
}
export type ContinuedRoomCatalogEntry=ContinuedRoomCatalogLocalEntry|ContinuedRoomCatalogDeliveryEntry|PhysicalRoomCatalogV3Entry;
export type ContinuedRoomCatalogInput=PhysicalRoomCatalogV3Input|
 Readonly<{id:string;family?:'continued-local';file:Blob;expected:ContinuedParticipantSelection}>|
 Readonly<{id:string;family:'continued-delivery';file:Blob;expected:ContinuedDeliveryParticipantSelection}>;
export interface ContinuedRoomCatalogMetadata extends Omit<SharedPhysicalRoomRecoveryCatalogMetadata,'formatVersion'|'participants'> {
 readonly formatVersion:4;
 readonly participants:readonly ContinuedRoomCatalogEntry[];
}
export interface ContinuedRoomCatalogPolicy {
 readonly id:string;
 readonly expected:ContinuedParticipantSelection|ContinuedDeliveryParticipantSelection;
 readonly restoreDocument:ContinuedParticipantReadOptions['restoreDocument'];
 readonly limits?:ContinuedParticipantReadOptions['limits'];
}
export interface ContinuedRoomCatalogReadOptions extends SharedArchiveIntegrityOptions, Pick<PhysicalRoomCatalogV3ReadOptions,'graphPolicies'|'localPolicies'> {
 readonly policies:readonly ContinuedRoomCatalogPolicy[];
}
export interface ContinuedRoomCatalogCaptureOptions extends ContinuedRoomCatalogReadOptions {
 readonly catalog:string;
 readonly origin:Readonly<{file:Blob;expected:ContinuedRoomCatalogMetadata['origin']['identity']}>;
 readonly current:Readonly<{
  server:Readonly<{file:Blob;expected:ContinuedRoomCatalogMetadata['current']['server']['identity']}>;
  participants:Readonly<{file:Blob;expected:ContinuedRoomCatalogMetadata['current']['participants']['identity']}>;
 }>;
 readonly participants:readonly ContinuedRoomCatalogInput[];
}
export type ContinuedRoomCatalogSelection=SharedPhysicalRoomRecoveryCatalogSelection;
