/** Detached point-in-time data only. Neither this report nor a local receipt
 * grants stream coverage, writer authority, room activation or provider leases. */
import type {RichAssetArchiveEntry} from '@breditor/experimental-rich-content';
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
import type {SharedPhysicalRecoveryAssetRead} from '../physical_recovery_control/asset_contract.js';
import type {PhysicalOperationV3HistoryRead} from '../physical_room_operation_v3/history_read_contract.js';
import type {PhysicalRoomRecordCutSelection} from '../physical_room_record_cut/contract.js';
import type {RoomAssetApprovalSelection} from '../physical_room_asset_approval/contract.js';
export interface SelectedRoomUploadPin{readonly id:string;readonly role:'origin'|'selected';readonly bytes:number;readonly sha256:string;readonly entries:readonly RichAssetArchiveEntry[]}
export interface SelectedRoomProviderRead{
 readonly format:'breditor/selected-room-provider-read';readonly formatVersion:1;
 readonly scope:'held-current-native-selected-and-origin-whole-uploads';
 readonly kind:'checked'|'pending';readonly control:SharedPhysicalRecoveryControlSelection;
 readonly approval:RoomAssetApprovalSelection;readonly current:PhysicalRoomRecordCutSelection;
 readonly history:PhysicalOperationV3HistoryRead;readonly uploads:readonly SelectedRoomUploadPin[];
 readonly provider:SharedPhysicalRecoveryAssetRead|null;
}
