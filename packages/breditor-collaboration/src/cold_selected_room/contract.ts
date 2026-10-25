/** A separate cold-owner choice; old staged readiness and approval formats keep
 * their meanings. Both complete files are data, never writer or server grants. */
import type {SelectedRoomCurrentSelection,SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
export interface ColdSelectedRoomChoice{
 readonly format:'breditor/cold-selected-room-choice';readonly formatVersion:1;
 readonly basis:SelectedRoomCurrentSelection;readonly current:SelectedRoomCurrentSelection;
 readonly intentDatabase:string;
}
export interface ColdSelectedRoomPreview{readonly choice:ColdSelectedRoomChoice;readonly current:SelectedRoomCurrentFile}
export interface ColdSelectedRoomPreviewOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends PhysicalOperationV3HistoryReadOptions<P>{readonly expectedBasis:SelectedRoomCurrentSelection;readonly intentDatabase:string}
export interface ColdSelectedRoomResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends PhysicalOperationV3HistoryReadOptions<P>{readonly expected:ColdSelectedRoomChoice;readonly approve:(choice:ColdSelectedRoomChoice)=>boolean|Promise<boolean>;readonly checkAssetAuthority:()=>void}
