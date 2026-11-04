/** Reuse original closed snapshot/binding admission, retaining exact canonical
 * text. No later caller DTO or replacement text can enter this validation. */
import {localSnapshot,localJson} from '../selected_local_review_delivery/policy.js';
import {metadataSnapshot,metadataJson} from '../selected_local_metadata_delivery/policy.js';
import {metadataPinsFailure as fail} from './policy.js';
import type {PreparedMetadataPinCapture} from './prepare_capture.js';
export async function validateMetadataPinCapture(plan:PreparedMetadataPinCapture):Promise<void>{
 if(plan.reviewText!==null&&localJson(await localSnapshot(JSON.parse(plan.reviewText),plan.choice.review))!==plan.reviewText)throw fail();
 if(plan.metadataText!==null&&metadataJson(await metadataSnapshot(JSON.parse(plan.metadataText),plan.choice.metadata))!==plan.metadataText)throw fail();
}
