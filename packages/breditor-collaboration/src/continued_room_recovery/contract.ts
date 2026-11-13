import type {SharedContinuedRoomCatalogStore} from '../continued_room_catalog/storage.js';
import type {ContinuedRoomCatalogSelection} from '../continued_room_catalog/contract.js';

import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';

export interface ContinuedRoomIndependentRecoveryPolicy {
 readonly id:string;
 readonly expected:SharedIndependentParticipantSelection;
 /** Exact native factory with document and review access both read-only. */
 readonly session:SharedIndependentRecoveryFactory;
 readonly limits?:Partial<AssetLimits>;
}
export interface ContinuedRoomRecoveryDestination {
 readonly id:string;
 readonly source:string;
 readonly uploads:string;
}
export interface ContinuedRoomRecoveryOptions {
 readonly database:string;
 readonly catalog:SharedContinuedRoomCatalogStore;
 readonly expected:ContinuedRoomCatalogSelection;
 readonly destinations:readonly ContinuedRoomRecoveryDestination[];
 /** Current host authority to restore these local namespaces and reacquire native writers. */
 readonly checkAuthority:()=>void;
 readonly writerRecovery:'host-reacquired';
 /** One independently supplied policy per independent-local participant. */
 readonly independentPolicies?:readonly ContinuedRoomIndependentRecoveryPolicy[];
 readonly signal?:AbortSignal;
}
export interface ContinuedRoomRecoveryResult {
 readonly format:'breditor/continued-room-local-recovery';
 readonly formatVersion:1;
 readonly catalog:ContinuedRoomCatalogSelection;
 readonly participants:readonly ContinuedRoomRecoveryDestination[];
}
