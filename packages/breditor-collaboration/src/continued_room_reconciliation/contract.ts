import type {SharedContinuedRoomCatalogStore} from '../continued_room_catalog/storage.js';
import type {ContinuedRoomCatalogSelection} from '../continued_room_catalog/contract.js';
import type {ContinuedDocumentOnlyPrefix,ContinuedParticipantPrefix} from '../continued_participant/inventory.js';
import type {SharedRoomParticipantCoverage} from '../room_participant_inventory/types.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';

import type {ContinuedRoomDeliveryRecoveryPolicy,ContinuedRoomGenerationRecoveryPolicy,ContinuedRoomIndependentRecoveryPolicy} from '../continued_room_recovery/contract.js';

export interface ContinuedRoomReconciliationOptions {
 readonly catalog:SharedContinuedRoomCatalogStore;
 readonly expected:ContinuedRoomCatalogSelection;
 readonly host:SharedServerLogGenerationRecoveryHost;
 readonly checkAuthority:()=>void;
 /** Select exact independent local factories to include in the provider read. */
 readonly independentPolicies?:readonly ContinuedRoomIndependentRecoveryPolicy[];
 /** Select exact independent delivery factories to include their bound review prefixes. */
 readonly deliveryPolicies?:readonly ContinuedRoomDeliveryRecoveryPolicy[];
 /** Select exact generation archives and read-only factories for native and provider admission. */
 readonly generationPolicies?:readonly ContinuedRoomGenerationRecoveryPolicy[];
 readonly signal?:AbortSignal;
}
export interface ContinuedRoomReconciliationRead {
 readonly format:'breditor/continued-room-reconciliation-read';
 readonly formatVersion:1;
 readonly catalog:ContinuedRoomCatalogSelection;
 readonly kind:'pending';
 readonly coverage:SharedRoomParticipantCoverage;
 readonly participants:readonly Readonly<{id:string;prefix:ContinuedParticipantPrefix}>[];
 /** Present when a selected generation archive has no review journal. */
 readonly documentOnlyParticipants?:readonly Readonly<{id:string;prefix:ContinuedDocumentOnlyPrefix}>[];
 readonly uploads:readonly Omit<SelectedRoomUploadPin,'role'>[];
 readonly provider:SharedServerLogGenerationRecoveryAssetRead|null;
 readonly unreconciledParticipants:readonly string[];
}
