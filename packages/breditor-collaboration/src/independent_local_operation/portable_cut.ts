/** Decode the exact local operation wrapper and its raw native files. A parsed
 * hash is data admission, not a native replay or permission to open a writer. */
import {readOperationCut} from '../independent_operation/cut_codec.js';
import {readLocalOperationHead} from './operation_head.js';
import type {IndependentHistoryCut,SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {LocalOperationJournalIdentity} from './journal_identity.js';
export function readLocalPortableCut(identity:LocalOperationJournalIdentity,cut:IndependentHistoryCut){return readOperationCut(cut,head=>readLocalOperationHead(head,identity));}
export async function localPortableCutRecovery(identity:LocalOperationJournalIdentity,cut:IndependentHistoryCut):Promise<SharedIndependentHistoryRecovery>{
 const selected=await readLocalPortableCut(identity,cut);return{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:structuredClone(selected.record.identity),documentCheckpoint:selected.documentCheckpoint,reviewCheckpoint:selected.reviewCheckpoint,versions:[...selected.record.versions]};
}
