/** Reread the original operation archive and ready recovery marker without
 * invoking any old writer/job callback. The original recovery journal has one
 * marker, not a second archive. Native replay/reference closure is separate. */
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {participantSelection} from '../participant_backup/policy.js';
import {readRecoveryJournal} from '../participant_recovery/journal.js';
import {readOperationDatabase} from './read_database.js';
import {operationFailure} from './errors.js';
import type {OperationalParticipantCustody} from './operation.js';
import type {SharedSelectionPolicy} from '../types.js';
const readBackup=SharedParticipantBackup.read,selection=SharedParticipantBackup.prototype.selection,dispose=SharedParticipantBackup.prototype.dispose;
/** The caller holds the genuine parent's private busy reservation and leases. */
export async function readOriginalOperationalRecords<P extends SharedSelectionPolicy>(s:OperationalParticipantCustody<P>,check:()=>void,signal:AbortSignal|undefined){
 check();const recovery=await readRecoveryJournal(s.recoveryDb,s.p.record);check();if(recovery.phase!=='ready')throw operationFailure('operation_diverged');
 const operation=await readOperationDatabase(s.db,s.record);check();if(operation.record.phase!==s.record.phase)throw operationFailure('operation_diverged');
 const expected=participantSelection(s.p.expected),backup=await readBackup.call(SharedParticipantBackup,operation.file,expected,{limits:s.p.limits,...(signal?{signal}:{})});
 try{check();const admitted=selection.call(backup);if(JSON.stringify(admitted)!==JSON.stringify(expected))throw operationFailure('operation_diverged');return{metadata:{format:'breditor/original-operational-record-read' as const,formatVersion:1 as const,scope:'held-original-parent-marker-and-archive' as const,selection:expected,operation:operation.record,recovery,files:[{role:'operation-origin' as const,bytes:operation.file.size,sha256:expected.sha256}]},files:Object.freeze([Object.freeze({role:'operation-origin' as const,file:operation.file})])};}
 finally{dispose.call(backup);}
}
