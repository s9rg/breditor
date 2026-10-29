/** Restore complete DATA only. A successful copy is never a writer, actor,
 * server grant or resumed delivery gate. Original nested formats stay literal. */
import type {LocalReviewResumeInspectionInput} from '../selected_local_review_delivery/resume_contract.js';
import type {LocalReviewDeliveryChoice} from '../selected_local_review_delivery/contract.js';
import type {DeliveryPreparationChoice} from '../selected_delivery_preparation/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/contract.js';
export type LocalReviewRestorePresence='absent'|'identical';
export interface LocalReviewRestoreDestinations {readonly prepared:LocalReviewRestorePresence;readonly delivery:LocalReviewRestorePresence}
export interface LocalReviewRestoreChoice {
 readonly format:'breditor/selected-local-review-data-restore';readonly formatVersion:1;
 readonly prepared:DeliveryPreparationChoice;readonly delivery:LocalReviewDeliveryChoice;
 readonly bundle:Readonly<{current:SelectedRoomCurrentSelection;bytes:number;sha256:string}>;
 readonly destinations:LocalReviewRestoreDestinations;
 readonly current:SelectedRoomCurrentSelection;readonly path:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;
}
export type LocalReviewRestoreInspectionInput=LocalReviewResumeInspectionInput;
export interface LocalReviewRestoreInput extends LocalReviewRestoreInspectionInput {readonly expected:LocalReviewRestoreChoice;readonly approve:(choice:LocalReviewRestoreChoice)=>boolean|Promise<boolean>}
export interface LocalReviewRestoreResult {readonly format:'breditor/selected-local-review-data-restored';readonly formatVersion:1;readonly choice:LocalReviewRestoreChoice}
