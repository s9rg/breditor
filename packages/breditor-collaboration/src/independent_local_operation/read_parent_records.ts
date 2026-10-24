/** Actual protected local parent and first recovery readback. No writable
 * guard, source autosave, old abort scope or cached archive verifies this read. */
import type {LocalParticipantState} from './participant_state.js';
import type {SharedSelectionPolicy} from '../types.js';
import {readLocalParticipantDatabase} from './participant_database.js';
import {readIndependentRecoveryDatabase} from '../independent_recovery/database.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {inspectIndependentDestination} from '../independent_recovery/destination.js';
import {localJournalFailure as fail} from './journal_failure.js';
export async function readLocalParentRecords<P extends SharedSelectionPolicy>(s:LocalParticipantState<P>,check:()=>void,signal:AbortSignal|undefined){
 check();if(!s.parentDb||!s.recoveryDb)throw fail('independent_local_participant_missing');const parent=await readLocalParticipantDatabase(s.parentDb,s.record,check);check();if(parent.phase!=='operational'||JSON.stringify(parent)!==JSON.stringify(s.record))throw fail('independent_local_participant_record');
 const saved=await readIndependentRecoveryDatabase(s.recoveryDb,s.p.record,check);check();if(saved.record.phase!=='ready'||saved.record.source!=='complete'||saved.record.uploads!=='complete')throw fail('independent_local_participant_recovery_incomplete');if(await independentParticipantDigest(saved.file,signal)!==s.p.options.expected.sha256)throw fail('independent_local_participant_recovery_diverged');check();
 const{signal:_oldSignal,checkAuthority:_oldAuthority,...old}=s.p.options,p={...s.p,guard:check,options:{...old,checkAuthority:check,...(signal?{signal}:{})}};if(await inspectIndependentDestination(p)!=='exact')throw fail('independent_local_participant_recovery_diverged');check();
 return{format:'breditor/fresh-independent-local-parent-records' as const,formatVersion:1 as const,parent,recovery:saved.record,original:s.p.options.expected,file:{role:'recovery-origin' as const,bytes:saved.file.size,sha256:s.p.options.expected.sha256}};
}
