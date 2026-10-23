/** Explicit seven-family physical retention. Version two remains a closed
 * five-family contract; no local operation is re-labelled as a delivery graph. */
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import type {NativeInputIncomingSourceCapture} from '../native_input_operation/incoming_source.js';
import type {PhysicalRoomCatalogV2Entry,PhysicalRoomCatalogV2Input,PhysicalRoomCatalogV2ReadOptions,PhysicalRoomCatalogV2Metadata,PhysicalRoomCatalogV2Source,PhysicalRoomCatalogV2Selection} from '../physical_room_catalog_v2/contract.js';
import type {PhysicalRoomCatalogV3Archive} from './archive.js';
export type {PhysicalRoomCatalogV2GraphPolicy as PhysicalRoomCatalogV3GraphPolicy,PhysicalRoomCatalogV2Check as PhysicalRoomCatalogV3Check} from '../physical_room_catalog_v2/contract.js';

export type PhysicalRoomCatalogV3Selection=PhysicalRoomCatalogV2Selection;
export type PhysicalRoomCatalogV3LocalFamily='local-operation-snapshot'|'local-operation-flat';
export type PhysicalRoomCatalogV3Entry=PhysicalRoomCatalogV2Entry
 |Readonly<{id:string;family:PhysicalRoomCatalogV3LocalFamily;selection:LocalOperationBackupSelection;bytes:number}>;
export type PhysicalRoomCatalogV3Input=PhysicalRoomCatalogV2Input
 |Readonly<{id:string;family:PhysicalRoomCatalogV3LocalFamily;expected:LocalOperationBackupSelection;file:Blob}>;
export interface PhysicalRoomCatalogV3Metadata extends Omit<PhysicalRoomCatalogV2Metadata,'formatVersion'|'participants'>{readonly formatVersion:3;readonly participants:readonly PhysicalRoomCatalogV3Entry[]}
/** Fresh read-only local factories are independently selected for each retained
 * file and exact original, not inferred from a header or a former writer grant. */
export interface PhysicalRoomCatalogV3LocalPolicy{readonly id:string;readonly family:PhysicalRoomCatalogV3LocalFamily;readonly original:SharedIndependentParticipantSelection;readonly options:LocalOperationReadOptions}
export interface PhysicalRoomCatalogV3ReadOptions extends PhysicalRoomCatalogV2ReadOptions{readonly localPolicies?:readonly PhysicalRoomCatalogV3LocalPolicy[]}
export interface PhysicalRoomCatalogV3CaptureOptions extends PhysicalRoomCatalogV3ReadOptions{
 readonly catalog:string;readonly origin:Readonly<{file:Blob;expected:PhysicalRoomCatalogV3Metadata['origin']['identity']}>;
 readonly current:Readonly<{server:Readonly<{file:Blob;expected:PhysicalRoomCatalogV3Metadata['current']['server']['identity']}>;participants:Readonly<{file:Blob;expected:PhysicalRoomCatalogV3Metadata['current']['participants']['identity']}>}>;
 readonly participants:readonly PhysicalRoomCatalogV3Input[];
}
export type PhysicalRoomCatalogV3Source=PhysicalRoomCatalogV2Source|Readonly<{id:string;family:PhysicalRoomCatalogV3LocalFamily;source:NativeInputIncomingSourceCapture}>;
export interface PhysicalRoomCatalogV3OpenOptions extends PhysicalRoomCatalogV3ReadOptions{readonly database:string;readonly expected:PhysicalRoomCatalogV3Selection}
export interface PhysicalRoomCatalogV3BeginOptions extends PhysicalRoomCatalogV3OpenOptions{readonly archive:PhysicalRoomCatalogV3Archive}
