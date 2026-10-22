/** The actual paired source publishes input LIVE once, without releasing either
 * writer lease between selected historical cuts. Failed unreturned source opens
 * abandon the reservation; a successful source owns journal/input cleanup. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import {prepareRestoredLocalSource} from './source_binding.js';
import type {RestoredLocalOperationJournal} from './journal.js';
const open=SharedIndependentHistoryPersistentSession.open,discard=SharedIndependentHistoryPersistentSession.prototype.discardAndClose;
export async function openRestoredLocalHistory<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,journal:RestoredLocalOperationJournal):Promise<SharedIndependentHistoryPersistentSession<P>>{
 const choice=prepareRestoredLocalSource(provided,journal),reservation=choice.binding.reserve();let source:SharedIndependentHistoryPersistentSession<P>|undefined;
 try{source=await open.call(SharedIndependentHistoryPersistentSession,choice.options) as SharedIndependentHistoryPersistentSession<P>;reservation.claim(source);return source;}
 catch(error){if(source)await discard.call(source);throw error;}
 finally{reservation.abandon();}
}
