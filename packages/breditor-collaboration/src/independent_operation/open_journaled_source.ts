import {openJournalSource} from '../persistence/journal_source_opening.js';
/** Constructor autosave precedes synchronous admission. Failed native cleanup
 * retains the actual unreturned source for the genuine journal Close to retry. */
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {withOperationCutJournal} from './journal_binding.js';
const open=SharedIndependentDeliverySession.open,discard=SharedIndependentDeliverySession.prototype.discardAndClose;
export async function openJournaledIndependentDelivery<P extends SharedSelectionPolicy>(input:SharedIndependentDeliveryOptions<P>,journal:IndependentOperationCutJournal):Promise<SharedIndependentDeliverySession<P>>{
 const binding=operationJournalBinding(journal),reservation=binding.reserve();
 try{return await openJournalSource(journal,()=>open.call(SharedIndependentDeliverySession,withOperationCutJournal(input,journal)) as Promise<SharedIndependentDeliverySession<P>>,source=>reservation.claim(source),source=>discard.call(source));}finally{reservation.abandon();}
}
/** Internal readable native/outbox data; deliberately not a portable operational export. */
export const readJournaledSourceData=(source:SharedIndependentDeliverySession<SharedSelectionPolicy>,journal:IndependentOperationCutJournal)=>operationJournalBinding(journal).readSource(source);
