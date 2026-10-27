/** Complete immutable execution intent. None of these DATA types retires a
 * writer, acquires an actor, creates a replacement or authorizes serving. */
import type {AssetLimits,RichAssetReconciliationChoice} from '@breditor/experimental-rich-content';
import type {RoomPreparationChoice,RoomPreparationFile} from '../native_room_preparation/contract.js';
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
export interface RoomExecutionLayout {
 readonly database:string;readonly catalogDatabase:string;readonly operationDatabase:string;
 readonly adoptionDatabase:string;readonly approvalDatabase:string;
 readonly participants:readonly Readonly<{id:string;selectedUploadsDatabase:string}>[];
}
export interface RoomExecutionAssetChoices {readonly id:string;readonly union:readonly RichAssetReconciliationChoice[];readonly adoption:readonly RichAssetReconciliationChoice[]}
export interface RoomExecutionPart {readonly bytes:number;readonly sha256:string}
export interface RoomExecutionAssetPlan extends RoomExecutionAssetChoices {readonly limits:Readonly<AssetLimits>;readonly unionBase:RoomExecutionPart;readonly adoptionBase:RoomExecutionPart}
export interface RoomExecutionPlan {readonly format:'breditor/native-room-execution-plan';readonly formatVersion:1;readonly preparation:RoomPreparationChoice;readonly layout:RoomExecutionLayout;readonly catalog:PhysicalRoomCatalogV3Selection;readonly assets:readonly RoomExecutionAssetPlan[]}
export interface RoomExecutionSelection extends RoomExecutionPart {readonly format:'breditor/native-room-execution-selection';readonly formatVersion:1}
export interface RoomExecutionChoice {readonly format:'breditor/native-room-execution-choice';readonly formatVersion:1;readonly plan:RoomExecutionPlan;readonly selection:RoomExecutionSelection}
export interface RoomExecutionFile {readonly choice:RoomExecutionChoice;readonly file:Blob}
export interface RoomExecutionManifest {readonly format:'breditor/native-room-execution';readonly formatVersion:1;readonly plan:RoomExecutionPlan;readonly parts:readonly RoomExecutionPart[]}
/** Current native readers remain independent of the retained file's policies. */
export interface RoomExecutionReadOptions extends SharedArchiveIntegrityOptions {readonly reads:PhysicalOperationV3HistoryReadOptions['reads'];readonly assets?:SharedAssetBytesOptions}

/** Closed DATA construction input. Decisions cover every participant and both
 * conflict edges explicitly; no callback can silently choose a losing queue. */
export interface RoomExecutionCaptureInput {readonly preparation:RoomPreparationFile;readonly layout:RoomExecutionLayout;readonly decisions:readonly RoomExecutionAssetChoices[]}
