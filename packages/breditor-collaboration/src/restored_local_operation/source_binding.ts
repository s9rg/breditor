/** Bind only a genuine restored-local journal to the existing physical native
 * pair primitive. Its new logical head/schema never widens old readers. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {bindIndependentLocalOperationDriver,selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from '../independent_local_operation/source_policy.js';
import {snapshotLocalOperationFactory} from '../independent_local_operation/factory_policy.js';
import {restoredLocalJournalBinding,type RestoredLocalOperationJournal} from './journal.js';
import {restoredLocalFailure as fail} from './failure.js';
export function prepareRestoredLocalSource<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,journal:RestoredLocalOperationJournal){
 const binding=restoredLocalJournalBinding(journal);
 if(!provided||typeof provided!=='object'||independentDeliveryCompanion(provided)||selectedLocalOperationDriver(provided)||independentLocalHistoryCapturePolicy(provided)||independentBootstrapPolicy(provided)||independentBootstrapSignal(provided))throw fail();
 const options=snapshotLocalOperationFactory(binding.expected.original,provided);if(options.database!==binding.sourceDatabase)throw fail('restored_local_operation_source');
 bindIndependentLocalOperationDriver(options,binding.driver);return{binding,options};
}
