import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import {SelectedLocalReviewDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {previewSelectedLocalReviewHandover} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_admission.js';
import type {LocalReviewHandoverResumeInput,LocalReviewHandoverResumeChoice} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/handover_contract.js';
import type {LocalReviewResumeChoice} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_contract.js';
import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {LocalMetadataHandoverReconciliationInput,HandoverServerPacketReconciliationRead} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/handover_reconciliation.js';

declare const scope:SelectedNativeRecoveryScope,input:LocalReviewHandoverResumeInput;
declare const metadata:SelectedLocalMetadataDelivery,reconciliation:LocalMetadataHandoverReconciliationInput;
const preview:Promise<LocalReviewHandoverResumeChoice>=previewSelectedLocalReviewHandover(scope,input);
const recovered:Promise<SelectedLocalReviewDelivery>=SelectedLocalReviewDelivery.resumeAcrossHandover(scope,input);
const current:Promise<HandoverServerPacketReconciliationRead>=metadata.captureServerPacketReconciliationAcrossHandover(reconciliation);
void [preview,recovered,current];
declare const oldChoice:LocalReviewResumeChoice;
// @ts-expect-error An ordinary successor path cannot replace a selected handover.
const handoverChoice:LocalReviewHandoverResumeChoice=oldChoice;
void handoverChoice;
