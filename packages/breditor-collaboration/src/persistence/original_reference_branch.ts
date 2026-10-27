/** Compatible document coverage plus exact paired comment origin and versions.
 * This separate read does not relax the original exact-journal continuation. */
import{SharedRichEditor}from'../core.js';
import type{OriginalReferenceReplay}from'./original_reference_replay.js';
import{SharedEditorError}from'../core.js';
const verify=SharedRichEditor.prototype.verifyRetainedNativeBranch;
export function verifyOriginalReferenceBranchCoverage(next:OriginalReferenceReplay,previous:OriginalReferenceReplay):void{
 const check=()=>{previous.check();next.check();};check();verify.call(next.core,previous.core);
 if(previous.state.paired?.versions.some((packet,index)=>next.state.paired?.versions[index]!==packet))throw new SharedEditorError('original_record_reference_branch','Preserve exact original local-version prefixes');
 check();verify.call(next.core,previous.core);
}
