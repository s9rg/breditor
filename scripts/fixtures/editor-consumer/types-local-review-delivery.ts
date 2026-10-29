/** Private composition types only; this is not a stabilized public root API. */
import {SelectedLocalReviewDelivery,previewSelectedLocalReviewDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {previewSelectedLocalReviewResume} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_admission.js';
import type {LocalReviewRoomBundle,LocalReviewDeliveryChoice,LocalReviewBinding} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/contract.js';
import type {LocalReviewResumeInput} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_contract.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import type {PreparedSelectedNativeDelivery} from '../../../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
declare const scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,bindings:readonly LocalReviewBinding[],input:LocalReviewResumeInput;
const expected:LocalReviewDeliveryChoice=previewSelectedLocalReviewDelivery(scope,gate,{database:'named-new-local-review-delivery',bindings});
const opened:Promise<SelectedLocalReviewDelivery>=SelectedLocalReviewDelivery.open(scope,gate,{expected,approve:choice=>choice===expected,checkAuthority(){}});
async function complete(){const owner=await opened,bundle:LocalReviewRoomBundle=await owner.capture();await SelectedLocalReviewDelivery.reopen(scope,gate,bundle,{expected,approve:()=>true,checkAuthority(){}});const choice=await previewSelectedLocalReviewResume(scope,input);await SelectedLocalReviewDelivery.resume(scope,{...input,expected:choice});}
// @ts-expect-error A saved choice is not a native prepared gate.
SelectedLocalReviewDelivery.open(scope,expected,{expected,approve:()=>true,checkAuthority(){}});
// @ts-expect-error Fresh explicit current approval is required.
SelectedLocalReviewDelivery.open(scope,gate,{expected,checkAuthority(){}});
// @ts-expect-error Complete new-layer export cannot masquerade as the old room file.
const oldRoom:import('../../../packages/breditor-collaboration/dist/selected_room_current/contract.js').SelectedRoomCurrentFile={} as LocalReviewRoomBundle;
void complete;void oldRoom;
