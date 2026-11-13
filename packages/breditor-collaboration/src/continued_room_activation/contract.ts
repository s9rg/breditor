import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {ContinuedRoomRecoveryResult} from '../continued_room_recovery/contract.js';
import type {RoomActivationBlobPin} from '../room_native_activation_intent/contract.js';
import type {ActivationStoredChoice} from '../room_native_activation_intent/store_contract.js';

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
