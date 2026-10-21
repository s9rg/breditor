/** Internal discriminated lanes cannot be widened into owner capabilities. */
import type {CapturedNativeHistoryRead} from '../../../packages/breditor-collaboration/dist/native_history_read/contract.js';
declare const native:CapturedNativeHistoryRead;
native.check();native.document.checkpointJson();native.document.writerClock('101');
if(native.review.kind==='original'||native.review.kind==='segmented-v1'){
 native.review.checkpointJson();native.review.reviewWriterClock('comments','alice');
}else{
 // @ts-expect-error Absent or unselected native comments have no checkpoint read.
 native.review.checkpointJson();
}
if(native.review.kind==='unselected'){const family:'original'|'segmented-v1'=native.review.nativeKind;void family;}
// @ts-expect-error The opaque brand cannot be constructed from a reader-shaped DTO.
const copied:CapturedNativeHistoryRead={document:native.document,review:native.review,check(){}};
// @ts-expect-error No borrowed native owner or editing capability.
native.document.dispatch({commands:[]});
// @ts-expect-error Readers do not own the native core's lifetime.
native.dispose();
void copied;
