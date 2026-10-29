/** Private complete-DATA restore and separately approved existing-only resume. */
import {previewSelectedLocalReviewRestore,restoreSelectedLocalReviewData} from '../../../packages/breditor-collaboration/dist/selected_local_review_restore/coordinator.js';
import {SelectedLocalReviewDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import type {LocalReviewRestoreInput,LocalReviewRestoreResult} from '../../../packages/breditor-collaboration/dist/selected_local_review_restore/contract.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
declare const scope:SelectedNativeRecoveryScope,input:LocalReviewRestoreInput;
async function example(){const expected=await previewSelectedLocalReviewRestore(scope,input),result:LocalReviewRestoreResult=await restoreSelectedLocalReviewData(scope,{...input,expected});
 // @ts-expect-error Restored DATA is not a native prepared gate.
 SelectedLocalReviewDelivery.open(scope,result,{expected:input.choice,approve:()=>true,checkAuthority(){}});
 // @ts-expect-error A restore result does not itself create executable delivery.
 result.createDelivery();
}
// @ts-expect-error An overwrite choice does not exist.
const invalid:LocalReviewRestoreInput['expected']['destinations']={prepared:'overwrite',delivery:'absent'};
void example;void invalid;
