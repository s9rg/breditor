import {openJournalSource} from '../persistence/journal_source_opening.js';
/** Constructor autosave precedes synchronous journal admission. An unreturned
 * source stays journal-owned if its actual native cleanup needs a retry. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import {prepareLocalOperationSource} from './storage_binding.js';
import {localOperationJournalBinding,type IndependentLocalOperationCutJournal} from './cut_journal.js';
const open=SharedIndependentHistoryPersistentSession.open,discard=SharedIndependentHistoryPersistentSession.prototype.discardAndClose;
export async function openJournaledIndependentLocalHistory<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,journal:IndependentLocalOperationCutJournal):Promise<SharedIndependentHistoryPersistentSession<P>>{
 const choice=prepareLocalOperationSource(provided,journal),reservation=choice.binding.reserve();
 try{return await openJournalSource(journal,()=>open.call(SharedIndependentHistoryPersistentSession,choice.forwardBootstrap()) as Promise<SharedIndependentHistoryPersistentSession<P>>,source=>reservation.claim(source),source=>discard.call(source));}finally{reservation.abandon();}
}
/** Internal readable native data, deliberately not a complete operation backup. */
export const readJournaledLocalSourceData=(source:SharedIndependentHistoryPersistentSession,journal:IndependentLocalOperationCutJournal)=>localOperationJournalBinding(journal).readSource(source);
