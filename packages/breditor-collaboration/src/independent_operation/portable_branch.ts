/** Native branch coverage keeps the existing immutable-version membership and
 * monotonic delivery-progress laws. It does not resurrect stopped queue rows,
 * acknowledge inputs, adopt comments or prove complete queue/provider union. */
import{SharedRichEditor}from'../core.js';
import type{replayPortableRecovery}from'./portable_replay.js';
import type{SharedIndependentDeliveryRecovery}from'../independent_delivery/contract.js';
import{forwardProgress}from'../segmented_relay/validation.js';
import{operationJournalFailure as fail}from'./journal_failure.js';
const verify=SharedRichEditor.prototype.verifyRetainedNativeBranch;
type ReadonlyReplay=Awaited<ReturnType<typeof replayPortableRecovery>>;
export function verifyPortableBranchCoverage(newer:ReadonlyReplay,later:SharedIndependentDeliveryRecovery,older:ReadonlyReplay,before:SharedIndependentDeliveryRecovery):void{
 const check=()=>{older.check();newer.check();};check();
 if(JSON.stringify(later.source.identity)!==JSON.stringify(before.source.identity))throw fail('independent_operation_branch');
 verify.call(newer.core,older.core);
 for(const packet of before.source.versions)if(!later.source.versions.includes(packet))throw fail('independent_operation_branch');
 forwardProgress(before.relay,later.relay);check();verify.call(newer.core,older.core);
}
