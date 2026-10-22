/** Constructor autosave must finish before the genuine source consumes its
 * journal. A failed unreturned open abandons only its opening reservation. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import {prepareLocalOperationSource} from './storage_binding.js';
import {localOperationJournalBinding,type IndependentLocalOperationCutJournal} from './cut_journal.js';
const open=SharedIndependentHistoryPersistentSession.open,discard=SharedIndependentHistoryPersistentSession.prototype.discardAndClose;
export async function openJournaledIndependentLocalHistory<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,journal:IndependentLocalOperationCutJournal):Promise<SharedIndependentHistoryPersistentSession<P>>{
 const choice=prepareLocalOperationSource(provided,journal),reservation=choice.binding.reserve();let source:SharedIndependentHistoryPersistentSession<P>|undefined;try{source=await open.call(SharedIndependentHistoryPersistentSession,choice.forwardBootstrap()) as SharedIndependentHistoryPersistentSession<P>;reservation.claim(source);return source;}catch(error){if(source)await discard.call(source);throw error;}finally{reservation.abandon();}
}
/** Internal readable native data, deliberately not a complete operation backup. */
export const readJournaledLocalSourceData=(source:SharedIndependentHistoryPersistentSession,journal:IndependentLocalOperationCutJournal)=>localOperationJournalBinding(journal).readSource(source);
