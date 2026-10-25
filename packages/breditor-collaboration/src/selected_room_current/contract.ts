/** New complete DATA family. The immutable approved baseline and current full
 * native/packet/journal cut remain distinct. No owner, writer grant or activation
 * can be deserialized from these selections or files. */
import type {RoomAssetApprovalSelection} from '../physical_room_asset_approval/contract.js';
import type {PhysicalRoomRecordCutSelection} from '../physical_room_record_cut/contract.js';
export interface SelectedRoomCurrentSelection{readonly format:'breditor/selected-room-current-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface SelectedRoomCurrentFile{readonly selection:SelectedRoomCurrentSelection;readonly file:Blob}
export interface SelectedRoomCurrentManifest{
 readonly format:'breditor/selected-room-current';readonly formatVersion:1;
 readonly approval:RoomAssetApprovalSelection;readonly current:PhysicalRoomRecordCutSelection;
 readonly uploads:readonly Readonly<{id:string;database:string;bytes:number;sha256:string}>[];
}
