/** Compatible native branch coverage, not a strict source-journal continuation
 * or permission to replace packet stores. Both native lanes and ordered local
 * versions must survive independently. Actual readonly replays are required. */
import{SharedRichEditor}from'../core.js';
import type{LocalPortableReplay}from'./portable_replay.js';
import{localJournalFailure as fail}from'./journal_failure.js';
const verify=SharedRichEditor.prototype.verifyRetainedNativeBranch;
export function verifyLocalOperationBranchCoverage(newer:LocalPortableReplay,older:LocalPortableReplay):void{
 const check=()=>{older.check();newer.check();};check();
 if(JSON.stringify(newer.recovery.identity)!==JSON.stringify(older.recovery.identity))throw fail('independent_local_operation_branch');
 verify.call(newer.core,older.core);
 if(newer.recovery.versions.length<older.recovery.versions.length||older.recovery.versions.some((packet,index)=>newer.recovery.versions[index]!==packet))throw fail('independent_local_operation_branch');
 check();verify.call(newer.core,older.core);
}
