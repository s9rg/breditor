/** Publish selected LIVE once through the actual paired source primitive. A
 * failed unreturned source abandons its reservation; a claimed source owns its
 * genuine journal/input/provider lifetime, independently of a later parent. */
import {completedSourceOpen} from '../persistence/completed_source_open.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {bindIndependentLocalOperationDriver,selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from '../independent_local_operation/source_policy.js';
import {snapshotLocalOperationFactory} from '../independent_local_operation/factory_policy.js';
import {flatLocalJournalBinding,type FlatLocalOperationJournal} from './journal.js';
import {flatLocalFailure as fail} from './failure.js';
const open=Session.open,discard=Session.prototype.discardAndClose;
export async function openFlatLocalHistory<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,journal:FlatLocalOperationJournal,completeOnly=false):Promise<Session<P>>{
 const binding=flatLocalJournalBinding(journal);if(!provided||typeof provided!=='object'||independentDeliveryCompanion(provided)||selectedLocalOperationDriver(provided)||independentLocalHistoryCapturePolicy(provided)||independentBootstrapPolicy(provided)||independentBootstrapSignal(provided))throw fail('flat_local_input_source');
 const options=snapshotLocalOperationFactory(binding.expected.original,provided);if(options.database!==binding.sourceDatabase)throw fail('flat_local_input_source');bindIndependentLocalOperationDriver(options,binding.driver);const reservation=binding.reserve();let source:Session<P>|undefined;
 try{source=await open.call(Session,completeOnly?completedSourceOpen(options):options) as Session<P>;reservation.claim(source);return source;}catch(error){if(source)await discard.call(source);throw error;}finally{reservation.abandon();}
}
