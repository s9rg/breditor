/** Only a genuine local journal selects the distinct lower storage profile.
 * Source factories are snapshotted before reservation/authority callbacks. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {bindIndependentLocalOperationDriver,selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {forwardIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from './source_policy.js';
import {snapshotLocalOperationFactory} from './factory_policy.js';
import {localOperationJournalBinding,type IndependentLocalOperationCutJournal} from './cut_journal.js';
import {localJournalFailure as fail} from './journal_failure.js';
export function prepareLocalOperationSource<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,journal:IndependentLocalOperationCutJournal){
 const binding=localOperationJournalBinding(journal);if(!provided||typeof provided!=='object'||independentDeliveryCompanion(provided)||independentLocalHistoryCapturePolicy(provided)||selectedLocalOperationDriver(provided))throw fail('independent_local_operation_policy');const options=snapshotLocalOperationFactory(binding.expected,provided);if(options.database!==binding.sourceDatabase)throw fail('independent_local_operation_source');bindIndependentLocalOperationDriver(options,binding.driver);return{binding,options,forwardBootstrap:()=>forwardIndependentBootstrapPolicy(provided,options)};
}
