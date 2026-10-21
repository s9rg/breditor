/** Exact native strings remain separate records; outer archive hashes are not native replay. */
import {SharedEditorError} from '../core.js';
import {canonicalIndependentHistoryIdentity,makeIndependentHistoryCut} from '../independent_history/cut.js';
import type {IndependentHistoryIdentity,SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import {MAX_INDEPENDENT_SOURCE_BYTES,MAX_INDEPENDENT_SOURCE_RECORDS,type SharedIndependentSourceRecord} from './contract.js';
import {generationFields} from '../generation_source/identity.js';
export const independentFailure=(code='independent_source_policy')=>new SharedEditorError(code,'Select the complete exact independent document and comment histories');
export function independentRecordLimit(kind:SharedIndependentSourceRecord['kind'],identity:IndependentHistoryIdentity):number{
 return kind==='version'?4*1024*1024:(kind==='document'?identity.documentHistory:identity.reviewHistory)==='original'?16*1024*1024:64*1024*1024;
}
export function independentRecords(recovery:SharedIndependentHistoryRecovery):readonly SharedIndependentSourceRecord[]{
 return Object.freeze([{kind:'document' as const,index:0,json:recovery.documentCheckpoint},{kind:'review' as const,index:0,json:recovery.reviewCheckpoint},...recovery.versions.map((json,index)=>({kind:'version' as const,index,json}))].map(row=>Object.freeze(row)));
}
export function independentRecovery(identity:IndependentHistoryIdentity,records:readonly SharedIndependentSourceRecord[]):SharedIndependentHistoryRecovery{
 const selected=canonicalIndependentHistoryIdentity(identity);if(!Array.isArray(records)||records.length<2||records.length>MAX_INDEPENDENT_SOURCE_RECORDS)throw independentFailure();let bytes=0;
 for(const [index,row]of records.entries()){
  if(!generationFields(row,'index,json,kind'))throw independentFailure();
  const selectedRow=row as unknown as SharedIndependentSourceRecord;
  if(selectedRow.kind!==(index===0?'document':index===1?'review':'version')||selectedRow.index!==(index<2?0:index-2)||typeof selectedRow.json!=='string')throw independentFailure();
  const size=new TextEncoder().encode(selectedRow.json).byteLength;if(!size||size>independentRecordLimit(selectedRow.kind,selected)||(bytes+=size)>MAX_INDEPENDENT_SOURCE_BYTES)throw independentFailure('independent_source_budget');
 }
 return{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:selected,documentCheckpoint:records[0]!.json,reviewCheckpoint:records[1]!.json,versions:records.slice(2).map(row=>row.json)};
}
export async function checkIndependentRecords(identity:IndependentHistoryIdentity,records:readonly SharedIndependentSourceRecord[]):Promise<SharedIndependentHistoryRecovery>{
 const recovery=independentRecovery(identity,records);await makeIndependentHistoryCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);return recovery;
}
