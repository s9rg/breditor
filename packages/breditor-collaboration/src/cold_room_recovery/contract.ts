/** Process-independent cold entry: complete pinned DATA and separately supplied
 * current factories. No old source/actor owner, saved grant or "stopped" DTO. */
import type {PhysicalOperationV3ResumeOptions} from '../physical_room_operation_v3/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {ColdSelectedRoomChoice} from '../cold_selected_room/contract.js';
export interface ColdRoomRecoveryOptions{
 readonly root:PhysicalOperationV3ResumeOptions;readonly basis:SelectedRoomCurrentFile;
 readonly reads:PhysicalOperationV3HistoryReadOptions;readonly intentDatabase:string;
}
export interface ColdRoomPromotionOptions{
 readonly expected:ColdSelectedRoomChoice;
 readonly approve:(choice:ColdSelectedRoomChoice)=>boolean|Promise<boolean>;
 readonly checkAssetAuthority:()=>void;
}
