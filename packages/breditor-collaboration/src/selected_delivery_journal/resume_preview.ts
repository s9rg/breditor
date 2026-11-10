
/** Existing-only, complete factual preview. It grants no editing permission. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkSelectedNativeDeliveryScope,retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import {DeliveryJournalResources} from './resources.js';
import {DeliveryPreparationResources} from '../selected_delivery_preparation/resources.js';
import {deliveryResumeInputs,inspectDeliveryResume} from './resume_admission.js';
import type {DeliveryJournalResumeInspectionInput} from './resume_contract.js';
import {handoverResumeInputs,inspectHandoverResume,type DeliveryJournalHandoverInspectionInput} from './handover_resume.js';
import type {DeliveryJournalIdentity} from './contract.js';
const open=DeliveryJournalResources.prototype.open,close=DeliveryJournalResources.prototype.close,preparedOpen=DeliveryPreparationResources.prototype.open,preparedClose=DeliveryPreparationResources.prototype.close;
export async function previewSelectedNativeDeliveryJournalResume(scope:SelectedNativeRecoveryScope,supplied:DeliveryJournalResumeInspectionInput){
 checkSelectedNativeDeliveryScope(scope);const input=deliveryResumeInputs(supplied,false);
 return preview(scope,input,(journal,check)=>inspectDeliveryResume(scope,journal,input,check));
}
export async function previewSelectedNativeDeliveryJournalHandover(scope:SelectedNativeRecoveryScope,supplied:DeliveryJournalHandoverInspectionInput){
 checkSelectedNativeDeliveryScope(scope);const input=handoverResumeInputs(supplied,false);
 return preview(scope,input,(journal,check)=>inspectHandoverResume(scope,journal,input,input.identity,check));
}
async function preview<T>(scope:SelectedNativeRecoveryScope,input:{identity:DeliveryJournalIdentity;authority:()=>void},inspect:(journal:DeliveryJournalResources,check:()=>void)=>Promise<{choice:T}>){
 const journal=new DeliveryJournalResources(),prepared=new DeliveryPreparationResources(),check=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();journal.check();prepared.check();};
 const cleanup=Object.freeze({check,async close(){try{await close.call(journal);}finally{await preparedClose.call(prepared);}}});retainSelectedNativeDeliveryResource(scope,cleanup);
 try{const actual=await scope.retainCurrent(),integrity={wasm:actual.integrity.wasm,checkAuthority:check,signal:scope.signal};await open.call(journal,input.identity,integrity);await preparedOpen.call(prepared,input.identity.prepared,integrity);return (await inspect(journal,check)).choice;}finally{await cleanup.close();}
}
