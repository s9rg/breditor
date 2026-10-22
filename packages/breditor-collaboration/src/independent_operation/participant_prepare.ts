/** Capture one current host/storage context before opening any native or upload owner. */
import type {SharedSelectionPolicy} from '../types.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {snapshotIndependentDeliveryRecovery,prepareIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {existingOperationJournalDatabase,readOperationJournalDatabase} from './journal_database.js';
import {operationDatabaseName,operationJournalIdentity} from './journal_identity.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import type {IndependentOperationParticipantOptions,IndependentOperationParticipantBeginOptions} from './participant_contract.js';
export function snapshotOperationParticipant<P extends SharedSelectionPolicy>(input:IndependentOperationParticipantOptions<P>|IndependentOperationParticipantBeginOptions<P>,begin:boolean){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['database','sourceDatabase','recovery','writerRecovery',...(begin?['recovered']:[])].includes(k)))throw fail('independent_operation_policy');
 requireBackupRecovery(input.writerRecovery);const database=operationDatabaseName(input.database),sourceDatabase=operationDatabaseName(input.sourceDatabase),base=snapshotIndependentDeliveryRecovery(input.recovery,false,false),context=recoveryOpeningContext(),locks=navigator.locks,life={changed:false};
 if(new Set([database,sourceDatabase,base.options.database,...Object.values(base.options.destinations)]).size!==5)throw fail('independent_operation_policy');
 const guard=()=>{if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_operation_storage_changed');base.guard();if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_operation_storage_changed');};guard();
 return{database,sourceDatabase,base:{...base,guard},context,life,guard,recovered:begin?(input as IndependentOperationParticipantBeginOptions<P>).recovered:undefined};
}
export type OperationParticipantSnapshot<P extends SharedSelectionPolicy=SharedSelectionPolicy>=ReturnType<typeof snapshotOperationParticipant<P>>;
/** Read the actual retained original before a factory runs; never obtain it from a phase marker. */
export async function prepareColdOperationParticipant<P extends SharedSelectionPolicy>(s:OperationParticipantSnapshot<P>){
 const id=await operationJournalIdentity(s.database,s.sourceDatabase,s.base);s.guard();const db=await existingOperationJournalDatabase(s.database);
 try{s.guard();const saved=await readOperationJournalDatabase(db,id);s.guard();return await prepareIndependentDeliveryRecovery(s.base,saved.file);}finally{db.close();}
}
