import type {SharedContinuedRoomCatalogStore} from '../continued_room_catalog/storage.js';
import type {ContinuedRoomCatalogSelection} from '../continued_room_catalog/contract.js';
import type {ContinuedDocumentOnlyPrefix,ContinuedParticipantPrefix} from '../continued_participant/inventory.js';
import type {SharedRoomParticipantCoverage} from '../room_participant_inventory/types.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';
import type {SharedParticipantBackupSelection} from '../participant_backup/types.js';
import type {OriginalReferenceRestore,OriginalReferenceEditor} from '../persistence/original_reference_replay.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';

import type {ContinuedRoomDeliveryRecoveryPolicy,ContinuedRoomGenerationRecoveryPolicy,ContinuedRoomIndependentRecoveryPolicy,ContinuedRoomRecoveryOptions,ContinuedRoomRecoveryResult} from '../continued_room_recovery/contract.js';

export interface ContinuedRoomOriginalReadPolicy {
 readonly id:string;
 readonly expected:SharedParticipantBackupSelection;
 /** Factory for the exact original native policy. The replay is always read-only. */
 readonly restore:OriginalReferenceRestore;
 readonly editor?:OriginalReferenceEditor;
 readonly limits?:Partial<AssetLimits>;
}

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
 /** Select exact original participant archives and their native read factories. */
 readonly originalPolicies?:readonly ContinuedRoomOriginalReadPolicy[];
 /** Include operation archives using their exact read policies pinned by the catalog. */
 readonly includeOperationArchives?:true;
 readonly signal?:AbortSignal;
}
export interface ContinuedRoomReconciliationRead {
 readonly format:'breditor/continued-room-reconciliation-read';
 readonly formatVersion:1;
 readonly catalog:ContinuedRoomCatalogSelection;
 readonly kind:'pending';
 readonly coverage:SharedRoomParticipantCoverage;
 readonly participants:readonly Readonly<{id:string;prefix:ContinuedParticipantPrefix}>[];
 /** Present when a selected archive has no review journal. */
 readonly documentOnlyParticipants?:readonly Readonly<{id:string;prefix:ContinuedDocumentOnlyPrefix}>[];
 readonly uploads:readonly Omit<SelectedRoomUploadPin,'role'>[];
 readonly provider:SharedServerLogGenerationRecoveryAssetRead|null;
 readonly unreconciledParticipants:readonly string[];
}

/** Compare the catalog's exact restored destinations with its authenticated provider. */
export interface RecoveredContinuedRoomReconciliationOptions {
 readonly recovery:ContinuedRoomRecoveryOptions;
 /** Uses the catalog selection and storage owner from recovery. */
 readonly reconciliation:Omit<ContinuedRoomReconciliationOptions,'catalog'|'expected'>;
}
export interface RecoveredContinuedRoomReconciliationRead {
 readonly format:'breditor/recovered-continued-room-reconciliation-read';
 readonly formatVersion:1;
 readonly recovery:ContinuedRoomRecoveryResult;
 readonly reconciliation:ContinuedRoomReconciliationRead;
}

/** Reconstructed continued-delivery cuts for an explicit replacement plan. */
export interface RecoveredContinuedRoomCatchUpPreview {
 readonly format:'breditor/recovered-continued-room-catch-up-preview';
 readonly formatVersion:1;
 readonly catalog:ContinuedRoomCatalogSelection;
 readonly server:import('../generation_recovery_control/contract.js').SharedServerLogGenerationRecoveryControlSelection;
 readonly participants:readonly Readonly<{id:string;prefix:ContinuedParticipantPrefix;
  recovery:import('../continued_delivery/contract.js').SharedContinuedDeliveryRecovery}>[];
}
