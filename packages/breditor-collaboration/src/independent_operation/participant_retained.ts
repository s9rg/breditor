/** The completed first-stage recovery remains immutable while the new live source advances. */
import {readIndependentDeliveryRecoveryDatabase} from '../independent_delivery_recovery/database.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {inspectIndependentDeliveryDestination} from '../independent_delivery_recovery/destination.js';
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import type {SharedSelectionPolicy} from '../types.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export async function verifyOperationRetainedRecovery<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,db:IDBDatabase):Promise<void>{
 p.guard();const saved=await readIndependentDeliveryRecoveryDatabase(db,p.record);p.guard();if(saved.record.phase!=='ready'||saved.record.source!=='complete'||saved.record.uploads!=='complete')throw fail('independent_operation_recovery_incomplete');
 if(await independentDeliveryParticipantDigest(saved.file,p.options.signal)!==p.options.expected.sha256)throw fail('independent_operation_recovery_diverged');p.guard();if(await inspectIndependentDeliveryDestination(p)!=='exact')throw fail('independent_operation_recovery_diverged');p.guard();
}
