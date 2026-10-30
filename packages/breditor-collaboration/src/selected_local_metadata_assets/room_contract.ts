/** One dependency decision over the literal old metadata bundle and the actual
 * stored point observed before its next capture. It supplies no asset bytes. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {LocalMetadataDeliveryState,LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataResumeChoice} from '../selected_local_metadata_delivery/resume_contract.js';
import type {PhysicalOperationV3HistoryRead} from '../physical_room_operation_v3/history_read_contract.js';
import type {LocalMetadataRecordAssetReferences} from './contract.js';
export type LocalMetadataReferenceSlot='before'|'stored'|'current';
export interface LocalMetadataReferencePoint {
 readonly slot:LocalMetadataReferenceSlot;
 readonly state:LocalMetadataRecordAssetReferences['state'];
 readonly lanes:readonly LocalMetadataRecordAssetReferences[];
}
export type LocalMetadataReferencePending=
 |Readonly<{kind:'base-room'}>
 |Readonly<{kind:'metadata';slot:LocalMetadataReferenceSlot;lane:string;pending:Extract<LocalMetadataRecordAssetReferences['outcome'],{kind:'pending'}>['pending']}>;
export interface LocalMetadataReferenceCut {
 readonly format:'breditor/selected-local-metadata-reference-cut';readonly formatVersion:1;
 readonly scope:'complete-base-history-and-before-stored-current-local-metadata';
 readonly parent:LocalMetadataResumeChoice['bundle'];
 /** Exact earlier committed state, not a claim based on a counter alone. */
 readonly stored:LocalMetadataDeliveryState;
 readonly base:PhysicalOperationV3HistoryRead;
 readonly points:readonly LocalMetadataReferencePoint[];
 readonly outcome:
  |Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>
  |Readonly<{kind:'pending';pending:readonly LocalMetadataReferencePending[]}>;
}
export interface LocalMetadataReferenceBundle {
 readonly format:'breditor/selected-local-metadata-reference-bundle';readonly formatVersion:1;
 readonly parent:LocalMetadataRoomBundle;
 readonly references:Readonly<{file:Blob;bytes:number;sha256:string}>;
}
