/** Factory-only journal selection; neither JSON nor a public option chooses this storage family. */
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import type {IndependentHistoryCompanion} from '../independent_history/driver.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {operationJournalFailure as fail} from './journal_failure.js';
const selected=new WeakMap<object,IndependentOperationCutJournal>(),p=IndependentDeliveryCompanion.prototype;
const load=p.load,capture=p.capture,admit=p.admit,wrap=p.wrap,acknowledged=p.acknowledged,retire=p.retire;
export function withOperationCutJournal<T extends object>(input:T,journal:IndependentOperationCutJournal):T{operationJournalBinding(journal);const copy={...input};selected.set(copy,journal);return copy;}
export const operationJournalSelected=(input:object):boolean=>selected.has(input);
/** The exact selected genuine journal, never a copied identity or stored marker. */
export const selectedOperationJournal=(input:object):IndependentOperationCutJournal|undefined=>selected.get(input);
export function journaledIndependentCompanion(input:object,base:IndependentDeliveryCompanion):IndependentHistoryCompanion|undefined{
 const journal=selected.get(input);if(!journal)return;const binding=operationJournalBinding(journal);
 if((input as {database?:unknown}).database!==binding.sourceDatabase||JSON.stringify(base.identity)!==JSON.stringify(binding.identity))throw fail('independent_operation_source');
 return Object.freeze({storage:'operation-v1',nativeCaptureGuard:binding.nativeCaptureGuard,persistence:binding.persistence,readHead:binding.readHead,
  load:(head:string)=>load.call(base,binding.unwrap(head)),capture:()=>capture.call(base),admit:(core:Parameters<IndependentHistoryCompanion['admit']>[0])=>admit.call(base,core),
  wrap:(source:Parameters<IndependentHistoryCompanion['wrap']>[0],cut:string)=>binding.wrap(wrap.call(base,source,cut)),acknowledged:(cut:string)=>acknowledged.call(base,cut),retire:()=>retire.call(base)});
}
