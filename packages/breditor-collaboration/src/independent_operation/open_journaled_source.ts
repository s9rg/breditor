/** Actual source ownership consumes a journal only after successful constructor autosave. */
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {withOperationCutJournal} from './journal_binding.js';
const open=SharedIndependentDeliverySession.open;
export async function openJournaledIndependentDelivery<P extends SharedSelectionPolicy>(input:SharedIndependentDeliveryOptions<P>,journal:IndependentOperationCutJournal):Promise<SharedIndependentDeliverySession<P>>{
 const binding=operationJournalBinding(journal),reservation=binding.reserve();let source:SharedIndependentDeliverySession<P>|undefined;
 try{source=await open.call(SharedIndependentDeliverySession,withOperationCutJournal(input,journal)) as SharedIndependentDeliverySession<P>;reservation.claim(source);return source;}
 catch(error){await source?.discardAndClose();throw error;}finally{reservation.abandon();}
}
/** Internal readable native/outbox data; deliberately not a portable operational export. */
export const readJournaledSourceData=(source:SharedIndependentDeliverySession<SharedSelectionPolicy>,journal:IndependentOperationCutJournal)=>operationJournalBinding(journal).readSource(source);
