/** Private joint orchestration. Applications supply policies and genuine
 * controls; no callback returns a fabricated owner, receipt or history. */
import type {JointRoomActivationCaptureInput} from './intent_capture.js';
import type {JointRoomActivationIntentChoice} from './intent_contract.js';
import type {RoomRunReadOptions,RoomRunOptions,RoomRunApproval,RoomRunPromotionChoice} from '../native_room_execution_run/contract.js';
import type {CommitRoomNativeActivationInput} from '../room_native_activation_intent/coordinator_contract.js';
import type {JointMetadataContinuationInspectionInput} from './metadata_continuation_contract.js';
import type {MetadataContinuationChoice} from '../selected_local_metadata_continuation/contract.js';
export interface JointRoomActivationPreparationInput extends JointRoomActivationCaptureInput {
 readonly reads:RoomRunReadOptions;readonly run:RoomRunOptions;
 /** Save the independently selected full descriptor before absent-only creation.
  * This callback is DATA retention; it cannot issue custody or readiness. */
 readonly retainChoice:(choice:JointRoomActivationIntentChoice)=>void|Promise<void>;
}
export type JointRoomNativeCommitInput=Omit<CommitRoomNativeActivationInput,'expected'>;
export interface JointRoomReplacementInput {
 readonly approveRetirement:(choice:JointRoomActivationIntentChoice['plan']['execution']['execution']['plan']['preparation'])=>boolean|Promise<boolean>;
 readonly approveExecution:(choice:RoomRunApproval)=>boolean|Promise<boolean>;
 readonly approvePromotion:(choice:RoomRunPromotionChoice)=>boolean|Promise<boolean>;
 readonly checkAssetAuthority:()=>void;
}
export type JointRoomMetadataInput=Omit<JointMetadataContinuationInspectionInput,'database'|'preparationDatabase'|'reviewDatabase'|'metadataDatabase'> & Readonly<{approve:(choice:MetadataContinuationChoice)=>boolean|Promise<boolean>}>;
export interface JointRoomPublicationInput extends JointRoomMetadataInput {
 /** This fresh final decision is distinct from Native activation, retirement,
  * reconstruction, metadata continuation and their stored observations. */
 readonly approvePublication:(choice:JointRoomActivationIntentChoice)=>boolean|Promise<boolean>;
}
