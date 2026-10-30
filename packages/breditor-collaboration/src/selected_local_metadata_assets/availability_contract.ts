/** Current byte-availability DATA over a source-owned complete metadata cut.
 * This is neither an upload receipt nor permission to activate or serve. */
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';
import type {RoomAssetApprovalSelection} from '../physical_room_asset_approval/contract.js';
import type {PhysicalRoomRecordCutSelection} from '../physical_room_record_cut/contract.js';
import type {LocalMetadataReferenceBundle} from './room_contract.js';
interface LocalMetadataAssetAvailabilitySelection {
 readonly format:'breditor/local-metadata-asset-availability-read';readonly formatVersion:1;
 readonly scope:'complete-base-and-metadata-references-and-origin-selected-upload-bytes';
 readonly references:Readonly<{bytes:number;sha256:string}>;
 readonly control:
  |Readonly<{kind:'source';selection:SharedServerLogGenerationRecoveryControlSelection}>
  |Readonly<{kind:'native-continuation';selection:SharedServerLogGenerationDeliveryRecoveryControlSelection}>;
 readonly approval:RoomAssetApprovalSelection;readonly current:PhysicalRoomRecordCutSelection;
 readonly uploads:readonly SelectedRoomUploadPin[];
}
/** Null means native/packet dependencies are incomplete, so no partial
 * requirements were submitted as though they represented the whole cut. */
export type LocalMetadataAssetAvailabilityRead=LocalMetadataAssetAvailabilitySelection&(
 |Readonly<{kind:'checked';provider:SharedServerLogGenerationRecoveryAssetRead}>
 |Readonly<{kind:'pending';provider:SharedServerLogGenerationRecoveryAssetRead|null}>
);
export interface LocalMetadataAssetAvailabilityBundle {
 readonly format:'breditor/selected-local-metadata-asset-availability-bundle';readonly formatVersion:1;
 readonly references:LocalMetadataReferenceBundle;
 readonly availability:LocalMetadataAssetAvailabilityRead;
}
