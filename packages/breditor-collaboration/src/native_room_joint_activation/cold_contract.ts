/** Explicit cold continuation of one existing immutable joint descriptor.
 * All callbacks are fresh decisions. Stored observations grant no authority. */
import type {ColdRoomExecutionOptions,ColdRoomExecutionChoice} from '../cold_room_execution/contract.js';
import type {RoomRunPromotionChoice} from '../native_room_execution_run/contract.js';
import type {JointRoomActivationIntentChoice} from './intent_contract.js';
import type {JointHandoverActivationIntentChoice} from './handover_contract.js';
export interface ColdJointRoomActivationOptions {
 readonly expected:JointRoomActivationIntentChoice;
 readonly execution:ColdRoomExecutionOptions;
}
export interface ColdJointHandoverActivationOptions extends Omit<ColdJointRoomActivationOptions,'expected'> {
 readonly expected:JointHandoverActivationIntentChoice;
}
export interface ColdJointRoomReplacementInput {
 readonly approveExecution:(choice:ColdRoomExecutionChoice)=>boolean|Promise<boolean>;
 readonly approvePromotion:(choice:RoomRunPromotionChoice)=>boolean|Promise<boolean>;
 readonly checkAssetAuthority:()=>void;
}
