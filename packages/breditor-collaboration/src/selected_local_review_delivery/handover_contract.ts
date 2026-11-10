/** A fresh decision for complete local-review facts across a sealed restore origin. */
import type {LocalReviewResumeChoice,LocalReviewResumeInspectionInput} from './resume_contract.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';

export interface LocalReviewHandoverResumeChoice extends Omit<LocalReviewResumeChoice,'format'|'path'> {
 readonly format:'breditor/selected-local-review-handover-resume';
 readonly path:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
}
export interface LocalReviewHandoverInspectionInput extends Omit<LocalReviewResumeInspectionInput,'baseline'> {}
export interface LocalReviewHandoverResumeInput extends LocalReviewHandoverInspectionInput {
 readonly expected:LocalReviewHandoverResumeChoice;
 readonly approve:(choice:LocalReviewHandoverResumeChoice)=>boolean|Promise<boolean>;
}
