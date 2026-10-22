/** Private five-family physical retention. Data integrity and prefix coverage
 * are not native writer custody, retained-copy disposition or activation. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedPhysicalRoomRecoveryCatalogMetadata,SharedPhysicalRoomRecoveryCatalogSelection,SharedPhysicalRoomRecoveryCatalogCheck} from '../physical_room_catalog/contract.js';
import type {SharedRoomRecoveryCatalogV2Entry,SharedRoomRecoveryCatalogV2Input} from '../room_recovery_catalog_v2/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {IndependentOperationBackupSelection} from '../independent_operation/portable_contract.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import type {OperationalPhysicalCohortSource} from '../server_generation_inventory/cohort_coverage.js';
import type {PhysicalRoomCatalogV2Archive} from './archive.js';

export type PhysicalRoomCatalogV2Selection=SharedPhysicalRoomRecoveryCatalogSelection;
export type PhysicalRoomCatalogV2Entry=SharedRoomRecoveryCatalogV2Entry
 |Readonly<{id:string;family:'independent-local';selection:SharedIndependentParticipantSelection;bytes:number}>
 |Readonly<{id:string;family:'independent-delivery';selection:SharedIndependentDeliveryParticipantSelection;bytes:number}>
 |Readonly<{id:string;family:'restored-graph';selection:IndependentOperationBackupSelection;bytes:number}>;
export type PhysicalRoomCatalogV2Input=SharedRoomRecoveryCatalogV2Input
 |Readonly<{id:string;family:'independent-local';expected:SharedIndependentParticipantSelection;file:Blob}>
 |Readonly<{id:string;family:'independent-delivery';expected:SharedIndependentDeliveryParticipantSelection;file:Blob}>
 |Readonly<{id:string;family:'restored-graph';expected:IndependentOperationBackupSelection;file:Blob}>;
export interface PhysicalRoomCatalogV2Metadata extends Omit<SharedPhysicalRoomRecoveryCatalogMetadata,'formatVersion'|'participants'>{
 readonly formatVersion:2;
 readonly participants:readonly PhysicalRoomCatalogV2Entry[];
}
/** Select the original independently; neither incoming metadata nor a past writer
 * grant chooses a native factory or fresh permission to read the complete graph. */
export interface PhysicalRoomCatalogV2GraphPolicy{
 readonly id:string;
 readonly original:SharedIndependentDeliveryParticipantSelection;
 readonly options:IndependentOperationReadOptions;
}
export interface PhysicalRoomCatalogV2ReadOptions extends SharedArchiveIntegrityOptions{
 readonly graphPolicies?:readonly PhysicalRoomCatalogV2GraphPolicy[];
}
export interface PhysicalRoomCatalogV2CaptureOptions extends PhysicalRoomCatalogV2ReadOptions{
 readonly catalog:string;
 readonly origin:Readonly<{file:Blob;expected:PhysicalRoomCatalogV2Metadata['origin']['identity']}>;
 readonly current:Readonly<{
  server:Readonly<{file:Blob;expected:PhysicalRoomCatalogV2Metadata['current']['server']['identity']}>;
  participants:Readonly<{file:Blob;expected:PhysicalRoomCatalogV2Metadata['current']['participants']['identity']}>;
 }>;
 readonly participants:readonly PhysicalRoomCatalogV2Input[];
}
export type PhysicalRoomCatalogV2Source=OperationalPhysicalCohortSource extends infer T
 ? T extends OperationalPhysicalCohortSource ? Readonly<{id:string;family:T['family'];source:T['source']}> : never : never;
export type PhysicalRoomCatalogV2Check=SharedPhysicalRoomRecoveryCatalogCheck;
export interface PhysicalRoomCatalogV2OpenOptions extends PhysicalRoomCatalogV2ReadOptions{
 readonly database:string;
 readonly expected:PhysicalRoomCatalogV2Selection;
}
export interface PhysicalRoomCatalogV2BeginOptions extends PhysicalRoomCatalogV2OpenOptions{readonly archive:PhysicalRoomCatalogV2Archive}
