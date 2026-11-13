import type {SharedContinuedRoomCatalogStore} from '../continued_room_catalog/storage.js';
import type {ContinuedRoomCatalogSelection} from '../continued_room_catalog/contract.js';

import type {SharedParticipantBackupSelection} from '../participant_backup/types.js';
import type {SharedParticipantRecoveryOptions} from '../participant_recovery/types.js';
import type {SharedGenerationParticipantSelection} from '../generation_participant/contract.js';
import type {SharedGenerationRecoveryFactory} from '../generation_participant/recovery_contract.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';

export interface ContinuedRoomIndependentRecoveryPolicy {
 readonly id:string;
 readonly expected:SharedIndependentParticipantSelection;
 /** Exact native factory with document and review access both read-only. */
 readonly session:SharedIndependentRecoveryFactory;
 readonly limits?:Partial<AssetLimits>;
}
export interface ContinuedRoomDeliveryRecoveryPolicy {
 readonly id:string;
 readonly expected:SharedIndependentDeliveryParticipantSelection;
 /** Exact native and delivery policy with both editing lanes read-only for recovery. */
 readonly session:SharedIndependentDeliveryRecoveryFactory;
 readonly limits?:Partial<AssetLimits>;
}
export interface ContinuedRoomGenerationRecoveryPolicy {
 readonly id:string;
 readonly expected:SharedGenerationParticipantSelection;
 /** Exact retained generation family and current read-only native policy. */
 readonly session:SharedGenerationRecoveryFactory;
 readonly limits?:Partial<AssetLimits>;
}
/** The original native family and exact metadata bindings are selected by the host. */
export interface ContinuedRoomOriginalRecoveryPolicy extends Pick<SharedParticipantRecoveryOptions,'session'|'suggestions'|'limits'> {
 readonly id:string;
 readonly expected:SharedParticipantBackupSelection;
 readonly revisions?:Readonly<{binding:string}>;
 readonly versions?:Readonly<Pick<NonNullable<SharedParticipantRecoveryOptions['versions']>,'identity'>>;
}
export interface ContinuedRoomRecoveryDestination {
 readonly id:string;
 readonly source:string;
 readonly uploads:string;
 /** Required for restored graphs and local operation snapshots or flat archives. */
 readonly operation?:Readonly<{parent:string;journal:string}>;
 /** Required for original archives. Name each retained store declared by the archive. */
 readonly original?:Readonly<{suggestions?:string;revisions?:string;versions?:string}>;
}
export interface ContinuedRoomRecoveryOptions {
 readonly database:string;
 readonly catalog:SharedContinuedRoomCatalogStore;
 readonly expected:ContinuedRoomCatalogSelection;
 readonly destinations:readonly ContinuedRoomRecoveryDestination[];
 /** Current host authority to restore these local namespaces and reacquire native writers. */
 readonly checkAuthority:()=>void;
 readonly writerRecovery:'host-reacquired';
 /** One independently supplied policy per original participant. */
 readonly originalPolicies?:readonly ContinuedRoomOriginalRecoveryPolicy[];
 /** One independently supplied policy per independent-local participant. */
 readonly independentPolicies?:readonly ContinuedRoomIndependentRecoveryPolicy[];
 /** One independently supplied policy per independent-delivery participant. */
 readonly deliveryPolicies?:readonly ContinuedRoomDeliveryRecoveryPolicy[];
 /** One independently supplied policy per generation participant. */
 readonly generationPolicies?:readonly ContinuedRoomGenerationRecoveryPolicy[];
 readonly signal?:AbortSignal;
}
export interface ContinuedRoomRecoveryResult {
 readonly format:'breditor/continued-room-local-recovery';
 readonly formatVersion:1;
 readonly catalog:ContinuedRoomCatalogSelection;
 readonly participants:readonly ContinuedRoomRecoveryDestination[];
}
