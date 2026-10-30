/** Report actual admitted outbox intent. A published pending suggestion is
 * settled transport work; it need not be accepted into the document. */
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import type {LocalMetadataReconciliationPending} from './reconciliation_contract.js';
import {MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS} from '../selected_room_reconciliation/generation_heads.js';
import {fail} from './error.js';
export function localMetadataPendingRecords(participant:string,records:SegmentedRetainedRecords):LocalMetadataReconciliationPending[]{
 const pending:LocalMetadataReconciliationPending[]=[];
 const add=(value:LocalMetadataReconciliationPending)=>{if(pending.length>=MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS)throw fail('local_metadata_assets_reference_budget');pending.push(value);};
 for(const [index,row]of (records.suggestions?.retained??[]).entries()){
  if(row.publish&&!row.publication)add({kind:'metadata',participant,store:'suggestions',index,operation:'publish'});
  if(row.intent&&!row.decision)add({kind:'metadata',participant,store:'suggestions',index,operation:'decide'});
 }
 for(const [index,row]of (records.revisions?.retained??[]).entries())if(row.retry)add({kind:'metadata',participant,store:'revisions',index,operation:'revise'});
 for(const [index,row]of (records.versions?.packets??[]).entries())if(row.publish&&!row.accepted)add({kind:'metadata',participant,store:'versions',index,operation:'publish'});
 return pending;
}
