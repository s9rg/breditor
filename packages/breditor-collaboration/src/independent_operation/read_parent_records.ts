/** Read actual completed first-stage records with fresh permission. The live
 * source's separate operation journal is admitted by its reference reader. */
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import type {SharedSelectionPolicy} from '../types.js';
import {readIndependentDeliveryRecoveryDatabase} from '../independent_delivery_recovery/database.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {inspectIndependentDeliveryDestination} from '../independent_delivery_recovery/destination.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export async function readDeliveryParentRecords<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,db:IDBDatabase,check:()=>void,signal:AbortSignal|undefined){
 check();const saved=await readIndependentDeliveryRecoveryDatabase(db,p.record);check();if(saved.record.phase!=='ready'||saved.record.source!=='complete'||saved.record.uploads!=='complete')throw fail('independent_operation_recovery_incomplete');if(await independentDeliveryParticipantDigest(saved.file,signal)!==p.options.expected.sha256)throw fail('independent_operation_recovery_diverged');check();
 const{signal:_oldSignal,checkAuthority:_oldAuthority,...old}=p.options,fresh={...p,guard:check,options:{...old,checkAuthority:check,...(signal?{signal}:{})}};if(await inspectIndependentDeliveryDestination(fresh)!=='exact')throw fail('independent_operation_recovery_diverged');check();
 return{format:'breditor/fresh-independent-delivery-parent-records' as const,formatVersion:1 as const,recovery:saved.record,original:p.options.expected,file:{role:'recovery-origin' as const,bytes:saved.file.size,sha256:p.options.expected.sha256}};
}
