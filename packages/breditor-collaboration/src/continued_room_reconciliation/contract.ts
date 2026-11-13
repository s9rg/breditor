import type {SharedContinuedRoomCatalogStore} from '../continued_room_catalog/storage.js';
import type {ContinuedRoomCatalogSelection} from '../continued_room_catalog/contract.js';
import type {ContinuedParticipantPrefix} from '../continued_participant/inventory.js';
import type {SharedRoomParticipantCoverage} from '../room_participant_inventory/types.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';

export interface ContinuedRoomReconciliationOptions {
 readonly catalog:SharedContinuedRoomCatalogStore;
 readonly expected:ContinuedRoomCatalogSelection;
 readonly host:SharedServerLogGenerationRecoveryHost;
 readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;
}
export interface ContinuedRoomReconciliationRead {
 readonly format:'breditor/continued-room-reconciliation-read';
 readonly formatVersion:1;
 readonly catalog:ContinuedRoomCatalogSelection;
 readonly kind:'pending';
 readonly coverage:SharedRoomParticipantCoverage;
 readonly participants:readonly Readonly<{id:string;prefix:ContinuedParticipantPrefix}>[];
 readonly uploads:readonly Omit<SelectedRoomUploadPin,'role'>[];
 readonly provider:SharedServerLogGenerationRecoveryAssetRead;
}
