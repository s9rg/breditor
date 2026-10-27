/** Pure joint admission. A late revision/version conflict exposes none of the earlier staged rows. */
import type{SharedRichEditor}from'../core.js';
import type{SharedSelectionPolicy}from'../types.js';
import type{SharedIndependentDeliveryRecovery as Recovery}from'../independent_delivery/contract.js';
import{reconcileRetainedSuggestions}from'../suggestions/reconcile_retained.js';
import{reconcileRetainedRevisions}from'../suggestion_revisions/reconcile_retained.js';
import{reconcileRetainedVersionRecord}from'../versions/reconcile_retained.js';
import{admitDeliveryRetainedRecords}from'../delivery_state/retained.js';
import{unionFailure as fail}from'./policy.js';
export function unionDeliveryRetained(core:SharedRichEditor<SharedSelectionPolicy>,a:Recovery,b:Recovery){
 if(JSON.stringify(a.retainedBinding)!==JSON.stringify(b.retainedBinding))throw fail('independent_delivery_union_identity');
 const left=a.retained,right=b.retained;
 for(const kind of['suggestions','revisions','versions']as const)if((left[kind]===null)!==(right[kind]===null))throw fail('independent_delivery_union_identity');
 const suggestions=left.suggestions&&right.suggestions?reconcileRetainedSuggestions(core,left.suggestions,right.suggestions,a.retainedBinding.suggestions?.ownedHistory??undefined):null;
 const revisions=left.revisions&&right.revisions?reconcileRetainedRevisions(core,left.revisions,right.revisions,[left.suggestions!,right.suggestions!,suggestions!.record]):null;
 const versions=left.versions&&right.versions?reconcileRetainedVersionRecord(core,left.versions,right.versions):null;
 const records={suggestions:suggestions?.record??null,revisions:revisions?.record??null,versions:versions?.record??null};
 admitDeliveryRetainedRecords(core,a.retainedBinding,records);
 return{records,result:{suggestions:suggestions?.result??null,revisions:revisions?.result??null,versions:versions?.result??null}};
}
