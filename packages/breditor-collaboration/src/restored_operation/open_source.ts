/** Functional source-only restore. Upload custody and whole-room activation belong to
 * the subsequent coordinator; this private entry point is not a complete participant. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {RestoredOperationJournal,restoredOperationJournalBinding} from './journal.js';
import {withRestoredOperationJournal} from './source_binding.js';
import type {RestoredOperationInputOptions} from './input.js';
import {restoredOperationPolicy} from './policy.js';
const open=SharedIndependentDeliverySession.open;
/** The caller cannot receive an intermediate original/current/pending source. */
export async function openRestoredOperationSource<P extends SharedSelectionPolicy>(options:RestoredOperationInputOptions<P>,file?:Blob){
 const selected=restoredOperationPolicy(options).options,journal=file===undefined?await RestoredOperationJournal.resume(selected):await RestoredOperationJournal.begin(file,selected),binding=restoredOperationJournalBinding(journal);
 const factory={...selected.session,database:binding.sourceDatabase,create:()=>{throw new Error('Restored source requires its selected native history');}} as SharedIndependentDeliveryOptions<P>;
 let source:SharedIndependentDeliverySession<P>|undefined,transferred=false;
 try{
  for(;;){const reservation=binding.reserve();try{source=await open.call(SharedIndependentDeliverySession,withRestoredOperationJournal(factory,journal)) as SharedIndependentDeliverySession<P>;reservation.claim(source);}finally{reservation.abandon();}
   const state=await binding.progress();if(state.ready){binding.consume(source);transferred=true;return Object.freeze({source,journal});}
   // The genuine restore hold keeps archive/origins alive while both actual author
   // callbacks finish. A borrowed read promise would deadlock this close.
   await source.close();source=undefined;
  }
 }finally{if(!transferred){try{await source?.discardAndClose();}finally{await journal.close();}}}
}
