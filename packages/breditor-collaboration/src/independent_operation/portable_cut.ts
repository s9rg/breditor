/** Recover one exact cut's original native strings and retained delivery records, without saving. */
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {IndependentOperationJournalIdentity} from './cut_intent.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {readOperationCut} from './cut_codec.js';
import {unwrapOperationHead} from './operation_head.js';
const load=IndependentDeliveryCompanion.prototype.load,current=IndependentDeliveryCompanion.prototype.current,records=IndependentDeliveryCompanion.prototype.records;
export function readPortableCut(factory:SharedIndependentDeliveryOptions,id:IndependentOperationJournalIdentity,cut:IndependentHistoryCut){const companion=new IndependentDeliveryCompanion(factory);return readOperationCut(cut,head=>companion.readHead(unwrapOperationHead(head,id)));}
export async function portableCutRecovery(factory:SharedIndependentDeliveryOptions,id:IndependentOperationJournalIdentity,cut:IndependentHistoryCut):Promise<SharedIndependentDeliveryRecovery>{
 const companion=new IndependentDeliveryCompanion(factory),readHead=(head:string)=>companion.readHead(unwrapOperationHead(head,id)),selected=await readOperationCut(cut,readHead);load.call(companion,unwrapOperationHead(selected.head,id));return{format:'breditor/shared-independent-delivery-recovery',formatVersion:1,source:{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:structuredClone(selected.record.identity),documentCheckpoint:selected.documentCheckpoint,reviewCheckpoint:selected.reviewCheckpoint,versions:[...selected.record.versions]},relay:current.call(companion),retainedBinding:structuredClone(companion.retainedBinding),retained:records.call(companion)};
}
