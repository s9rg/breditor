/** Four actual namespaces, fresh native policy and storage context. Saved stages do not
 * choose factories, change transport identities or grant current authority. */
import type {SharedSelectionPolicy} from '../types.js';
import type {RestoredOperationInputOptions} from '../restored_operation/input.js';
import {restoredOperationPolicy} from '../restored_operation/policy.js';
import {operationDatabaseName} from '../independent_operation/journal_identity.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export interface RestoredParticipantOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<RestoredOperationInputOptions<P>,'database'|'sourceDatabase'|'cohort'>{
 readonly database:string;readonly journalDatabase:string;readonly sourceDatabase:string;readonly uploadsDatabase:string;
}
export function restoredParticipantPolicy<P extends SharedSelectionPolicy>(input:RestoredParticipantOptions<P>){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['kind','expected','database','journalDatabase','sourceDatabase','uploadsDatabase','writerRecovery','session','checkAuthority','signal','limits'].includes(k)))throw fail('restored_participant_policy');
 const database=operationDatabaseName(input.database),journalDatabase=operationDatabaseName(input.journalDatabase),sourceDatabase=operationDatabaseName(input.sourceDatabase),uploadsDatabase=operationDatabaseName(input.uploadsDatabase),names=[database,journalDatabase,sourceDatabase,uploadsDatabase];if(new Set(names).size!==4)throw fail('restored_participant_policy');
 const base=restoredOperationPolicy({kind:input.kind,expected:input.expected,database:journalDatabase,sourceDatabase,cohort:{coordinatorDatabase:database,uploadsDatabase},writerRecovery:input.writerRecovery,session:input.session,checkAuthority:input.checkAuthority,...(input.signal?{signal:input.signal}:{}),...(input.limits?{limits:input.limits}:{})}),context=globalThis.indexedDB,locks=globalThis.navigator?.locks,life={changed:false};
 const guard=()=>{if(life.changed||!context||!locks||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_participant_storage_changed');base.guard();if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_participant_storage_changed');};guard();
 return{database,journalDatabase,sourceDatabase,uploadsDatabase,names:Object.freeze(names),sourceOptions:base.options,context:context!,life,guard};
}
export type RestoredParticipantPolicy=ReturnType<typeof restoredParticipantPolicy>;
