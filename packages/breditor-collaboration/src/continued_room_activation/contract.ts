import type {SharedDurableNativeActivationReceipt,SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {ContinuedRoomRecoveryResult} from '../continued_room_recovery/contract.js';
import type {RoomActivationBlobPin} from '../room_native_activation_intent/contract.js';
import type {ActivationStoredChoice} from '../room_native_activation_intent/store_contract.js';
import type {SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import type {SharedNativeRoomPublicationReceipt,SharedNativeRoomPublicationSelection} from '../native_publication_control/contract.js';

/** Inert selection for the completed recovery, exact relay checkpoint and local intent. */
export interface ContinuedRoomActivationChoice extends ActivationStoredChoice {
 readonly format:'breditor/continued-room-activation-intent';
 readonly formatVersion:1;
 readonly objects:readonly [];
}

export interface ContinuedRoomActivationPlan {
 readonly format:'breditor/continued-room-activation-plan';
 readonly formatVersion:1;
 readonly catalogDatabase:string;
 readonly recoveryDatabase:string;
 readonly recovery:ContinuedRoomRecoveryResult;
 readonly server:SharedServerLogGenerationRecoveryControlSelection;
 readonly activation:SharedDurableNativeActivationSelection;
 /** Covers all observations, including remaining provider and review obligations. */
 readonly reconciliation:RoomActivationBlobPin;
}

export interface ContinuedRoomActivationCommitOptions {
 readonly expected:ContinuedRoomActivationChoice;
 readonly activation:SharedDurableNativeActivationHost;
 readonly approve:(plan:ContinuedRoomActivationPlan)=>boolean|Promise<boolean>;
}

export interface ContinuedRoomActivationCommitResult {
 readonly choice:ContinuedRoomActivationChoice;
 readonly receipt:SharedDurableNativeActivationReceipt;
}

export interface ContinuedRoomPublicationChoice extends ActivationStoredChoice {
 readonly format:'breditor/continued-room-publication-intent';
 readonly formatVersion:1;
 readonly publication:SharedNativeRoomPublicationSelection;
 readonly activationIntent:ContinuedRoomActivationChoice;
 readonly objects:readonly [];
}

export interface ContinuedRoomPublicationPlan {
 readonly format:'breditor/continued-room-publication-plan';
 readonly formatVersion:1;
 readonly database:string;
 readonly activationIntent:ContinuedRoomActivationChoice;
 readonly publication:SharedNativeRoomPublicationSelection;
}

interface ContinuedRoomPublicationHosts {
 readonly activation:SharedDurableNativeActivationHost;
 readonly publication:SharedNativeRoomPublicationHost;
}
export interface ContinuedRoomPublicationPrepareOptions extends ContinuedRoomPublicationHosts {
 readonly database:string;
 readonly expected:ContinuedRoomActivationChoice;
 readonly retainChoice:(choice:ContinuedRoomPublicationChoice)=>void|Promise<void>;
}
export interface ContinuedRoomPublicationOptions extends ContinuedRoomPublicationHosts {
 readonly expected:ContinuedRoomPublicationChoice;
 readonly approve:(plan:ContinuedRoomPublicationPlan)=>boolean|Promise<boolean>;
}
export interface ContinuedRoomPublicationResult {
 readonly choice:ContinuedRoomPublicationChoice;
 readonly receipt:SharedNativeRoomPublicationReceipt;
}
