/** Exact host-selected recovery choice. This new data family never changes an
 * old participant baseline or supplies a native owner/server writer grant. */
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {PhysicalRoomRecordCutSelection} from '../physical_room_record_cut/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
export interface RoomAssetApprovalChoice{readonly format:'breditor/room-asset-approval-choice';readonly formatVersion:1;readonly cut:PhysicalRoomRecordCutSelection;readonly adoption:RoomAssetAdoptionRecord}
export interface RoomAssetApprovalSelection{readonly format:'breditor/room-asset-approval-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface RoomAssetApprovalFile{readonly selection:RoomAssetApprovalSelection;readonly file:Blob;readonly choice:RoomAssetApprovalChoice}
/** A fresh host decision for this call, never deserialized from storage. The
 * independent expected choice is checked BEFORE calling the decision hook. */
export interface RoomAssetApprovalOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends PhysicalOperationV3HistoryReadOptions<P>{readonly expected:RoomAssetApprovalChoice;readonly approve:(choice:RoomAssetApprovalChoice)=>boolean|Promise<boolean>}
