/** Only a genuine restored journal can select this new source storage family. */
import type {IndependentHistoryCompanion} from '../independent_history/driver.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {restoredOperationJournalBinding,type RestoredOperationJournal} from './journal.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
const selected=new WeakMap<object,RestoredOperationJournal>(),p=IndependentDeliveryCompanion.prototype,load=p.load,capture=p.capture,admit=p.admit,wrap=p.wrap,acknowledged=p.acknowledged,retire=p.retire;
export function withRestoredOperationJournal<T extends object>(input:T,journal:RestoredOperationJournal):T{restoredOperationJournalBinding(journal);const copy={...input};selected.set(copy,journal);return copy;}
export const selectedRestoredOperationJournal=(input:object)=>selected.get(input);
export function restoredIndependentCompanion(input:object,base:IndependentDeliveryCompanion):IndependentHistoryCompanion|undefined{
 const journal=selected.get(input);if(!journal)return;const binding=restoredOperationJournalBinding(journal);
 if((input as {database?:unknown}).database!==binding.sourceDatabase||JSON.stringify(base.identity)!==JSON.stringify(binding.identity))throw fail('restored_operation_source');
 return Object.freeze({storage:'restored-operation-v1',nativeCaptureGuard:binding.nativeCaptureGuard,persistence:binding.persistence,readHead:binding.readHead,load:(head:string)=>load.call(base,binding.unwrap(head)),capture:()=>capture.call(base),admit:(core:Parameters<IndependentHistoryCompanion['admit']>[0])=>admit.call(base,core),wrap:(source:Parameters<IndependentHistoryCompanion['wrap']>[0],cut:string)=>binding.wrap(wrap.call(base,source,cut)),acknowledged:(cut:string)=>acknowledged.call(base,cut),retire:()=>retire.call(base)});
}
