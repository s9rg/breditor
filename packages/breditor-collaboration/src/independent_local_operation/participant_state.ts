/** Concrete returned or unreturned ownership. No completion flag releases an
 * actual resource; failed cleanup keeps the same owners reachable for retry. */
import type {SharedSelectionPolicy} from '../types.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import type {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import type {PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import type {RecoveryLease} from '../participant_recovery/lease.js';
import type {IndependentLocalOperationCutJournal} from './cut_journal.js';
import type {LocalParticipantChoice} from './participant_prepare.js';
import type {LocalParticipantRecord} from './participant_record.js';
import {readLocalParticipantDatabase,writeLocalParticipantRecord} from './participant_database.js';
import type {LocalParticipantBaseline} from './participant_assets.js';
import {closeLocalParticipantOwners,type LocalParticipantOwners} from './participant_owners.js';
import {localJournalFailure as fail} from './journal_failure.js';
export interface LocalParticipantState<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly choice:LocalParticipantChoice<P>;readonly p:PreparedIndependentRecovery<P>;readonly baseline:LocalParticipantBaseline;readonly journal:IndependentLocalOperationCutJournal;readonly owners:LocalParticipantOwners<P>;readonly leases:RecoveryLease[];
 parentDb?:IDBDatabase;recoveryDb?:IDBDatabase;record:LocalParticipantRecord;pending?:LocalParticipantRecord;
 legacySession?:Session<P>;legacyBackup?:SharedIndependentParticipantBackup;backupDisposed:boolean;
}
const close=Session.prototype.close,discard=Session.prototype.discardAndClose;
export function fenceLocalParticipantDatabase(state:LocalParticipantState,db:IDBDatabase):void{db.onversionchange=()=>{state.choice.life.changed=true;db.close();};}
/** A late rejected handoff may already have closed coordinator handles. Reopen
 * only actual retained databases; acknowledged storage is never reconstructed. */
export async function localParticipantHandles(state:LocalParticipantState):Promise<void>{
 for(const[key,name]of [['parentDb',state.choice.database],['recoveryDb',state.p.options.database]] as const){state.choice.guard();if(!state[key]){const db=await existingDatabase(name);if(!db)throw fail('independent_local_participant_missing');state[key]=db;fenceLocalParticipantDatabase(state,db);state.choice.guard();}}
}
export function closeLocalParticipantHandles(state:LocalParticipantState):void{if(state.parentDb){state.parentDb.close();delete state.parentDb;}if(state.recoveryDb){state.recoveryDb.close();delete state.recoveryDb;}}
export async function retainedLocalParticipantRecord(state:LocalParticipantState):Promise<void>{
 await localParticipantHandles(state);state.choice.guard();const actual=await readLocalParticipantDatabase(state.parentDb!,state.record,state.choice.guard);state.choice.guard();if(JSON.stringify(actual)!==JSON.stringify(state.record)&&(!state.pending||JSON.stringify(actual)!==JSON.stringify(state.pending)))throw fail('independent_local_participant_record');state.record=actual;delete state.pending;
}
export async function updateLocalParticipant(state:LocalParticipantState,phase:LocalParticipantRecord['phase']):Promise<void>{
 await retainedLocalParticipantRecord(state);state.choice.guard();const next={...state.record,phase};state.pending=next;await writeLocalParticipantRecord(state.parentDb!,state.record,next,state.choice.guard,state.p.options.signal);state.choice.guard();await retainedLocalParticipantRecord(state);if(state.record.phase!==phase)throw fail('independent_local_participant_record');
}
export async function releaseLocalParticipantLeases(state:Pick<LocalParticipantState,'leases'>):Promise<void>{const results=await Promise.allSettled([...state.leases].reverse().map(lease=>lease.close()));if(results.some(row=>row.status==='rejected'))throw fail('independent_local_participant_cleanup');}
/** Baseline values are separately retained, so a denied final barrier can retry
 * even after archive disposal invoked a replaced inner wrapper callback. */
export function disposeLocalParticipantBackups(state:LocalParticipantState):void{if(state.legacyBackup){archive.dispose.call(state.legacyBackup);delete state.legacyBackup;}if(!state.backupDisposed){archive.dispose.call(state.p.backup);state.backupDisposed=true;}}
export async function closeLocalParticipantState(state:LocalParticipantState,discardMemory:boolean):Promise<void>{
 if(state.legacySession){await(discardMemory?discard:close).call(state.legacySession);delete state.legacySession;}
 await closeLocalParticipantOwners(state.owners,state.journal,discardMemory);await releaseLocalParticipantLeases(state);disposeLocalParticipantBackups(state);closeLocalParticipantHandles(state);
}
