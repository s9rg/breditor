import {localReviewHandoverResumeChoice} from './handover_identity.js';
import type {LocalReviewHandoverResumeChoice,LocalReviewHandoverResumeInput,LocalReviewHandoverInspectionInput} from './handover_contract.js';
import {containsOrderedDeliveryCuts,handoverDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
/** Genuine full native path + literal complete room/receipt files + fresh
 * decision. Only this module can create the one-shot preparation transfer.
 * Metadata is never a server grant; original adapters authenticate again. */
import {checkSelectedNativeDeliveryScope,retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import {generationDeliveryPathRecoveryHostPort} from '../generation_delivery_path_control/host.js';
import {journalNativeInputs} from '../selected_delivery_journal/native_inputs.js';
import {DeliveryPreparationResources} from '../selected_delivery_preparation/resources.js';
import type {DeliveryPreparationFile} from '../selected_delivery_preparation/contract.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {fields} from '../physical_room_record_cut/policy.js';



import {LocalReviewDeliveryStore} from './store.js';
import {localChoice,localJson,localSnapshot,fail,equal,MAX_LOCAL_REVIEW_BYTES} from './policy.js';
import {detachLocalReviewBundle} from './bundle.js';
import {admitLocalReviewRoomSource} from './bundle_native.js';
import {verifyLocalReviewSnapshotContinuation} from './continuation.js';
import {localReviewResumeChoice} from './resume_identity.js';
import type {LocalReviewDeliverySnapshot} from './contract.js';
export {localReviewResumeChoice} from './resume_identity.js';
import type {LocalReviewResumeChoice,LocalReviewResumeInput,LocalReviewResumeInspectionInput} from './resume_contract.js';
const prepared={open:DeliveryPreparationResources.prototype.open,close:DeliveryPreparationResources.prototype.close},store={open:LocalReviewDeliveryStore.prototype.open,read:LocalReviewDeliveryStore.prototype.readFresh,close:LocalReviewDeliveryStore.prototype.close},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
type ResumeInput=LocalReviewResumeInput|LocalReviewHandoverResumeInput;
type InspectionInput=LocalReviewResumeInspectionInput|LocalReviewHandoverInspectionInput;
function inputs(scope:SelectedNativeRecoveryScope,provided:InspectionInput|ResumeInput,resume:boolean,handover=false){
 checkSelectedNativeDeliveryScope(scope);
 const r=fields(provided,['choice','bundle',...(handover?[]:['baseline']),'path','server','inventory','checkAuthority',...(resume?['expected','approve']:[])]);
 const choice=localChoice(r['choice']),bundle=detachLocalReviewBundle(r['bundle']);
 const host=handover?undefined:r['baseline'] as LocalReviewResumeInput['baseline'];
 const baseline=handover?undefined:generationDeliveryRecoveryHostPort(host!);
 const pathHost=r['path'] as LocalReviewResumeInput['path'],path=generationDeliveryPathRecoveryHostPort(pathHost);
 const selectedHandover=handover?path.handover:undefined;
 if(handover&&!selectedHandover)throw fail('local_review_delivery_policy');
 const native=journalNativeInputs(r['server'] as LocalReviewResumeInput['server'],r['inventory'] as LocalReviewResumeInput['inventory']);
 const authority=participantAuthority(r['checkAuthority'] as ()=>void);
 const expected=resume?(handover?localReviewHandoverResumeChoice(r['expected']):localReviewResumeChoice(r['expected'])):undefined;
 const approve=r['approve'] as (choice:LocalReviewResumeChoice|LocalReviewHandoverResumeChoice)=>boolean|Promise<boolean>;
 if(resume&&typeof approve!=='function')throw fail('local_review_delivery_policy');
 const decide=resume&&expected?()=>approve(expected):undefined;
 if(!equal(bundle.prepared.choice.before,choice.before))throw fail();
 return {choice,bundle,host,baseline,pathHost,path,native,authority,expected,decide,handover:selectedHandover};
}
async function inspect(scope:SelectedNativeRecoveryScope,input:ReturnType<typeof inputs>,guard:()=>void){
 guard();input.native.check();
 const path=input.path.selection,current=path.path.current,original=input.bundle.prepared.choice.server.source;
 if(input.handover){
  const pins=equal(original.origin,original.server)?[original.origin]:[original.origin,original.server];
  if(!containsOrderedDeliveryCuts(handoverDeliveryCuts(input.handover.path),pins))throw fail();
 }else{
  const baseline=input.baseline?.selection,base=baseline?.continuation;
  if(!baseline||!base||!equal(path.current,baseline)||!equal(base.previous,original.server)||!equal(base.current.origin,original.origin)||!path.path.ancestors.some(row=>equal(row,base.previous)))throw fail();
 }
 if(!equal(input.native.source,current.server)||!equal(input.native.participants,current.participants))throw fail();
 await input.path.check(scope.signal);const actual=await scope.retainExtendingAll([{file:input.bundle.prepared.file,selection:input.choice.before},input.bundle.current]),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:guard});
 if(input.bundle.delivery.file.size!==input.bundle.delivery.bytes||await integrity.digest(input.bundle.delivery.file)!==input.bundle.delivery.sha256)throw fail();const text=await input.bundle.delivery.file.text(),snapshot=await localSnapshot(JSON.parse(text),input.choice);if(localJson(snapshot)!==text)throw fail();
 // Existing-only fresh storage read, before any decision or gate construction.
 // Namespace custody is released only after its actual requests have settled.
 const records=new LocalReviewDeliveryStore(input.choice,guard);let saved:LocalReviewDeliverySnapshot;retainSelectedNativeDeliveryResource(scope,Object.freeze({check:guard,close:()=>store.close.call(records)}));try{saved=await store.open.call(records);}finally{await store.close.call(records);}
 await admitLocalReviewRoomSource(scope,input.bundle.prepared.file,input.choice.before,snapshot.before,guard);await admitLocalReviewRoomSource(scope,input.bundle.current.file,input.bundle.current.selection,snapshot.current,guard);
 await verifyLocalReviewSnapshotContinuation(scope,input.bundle.current,snapshot,saved,guard);await admitLocalReviewRoomSource(scope,input.bundle.current.file,input.bundle.current.selection,saved.current,guard,false);const savedText=localJson(saved),savedFile=new Blob([savedText]),stored={revision:saved.current.revision,bytes:savedFile.size,sha256:await integrity.digest(savedFile)};
 if(input.handover)await scope.readHandoverDeliveryReconciliation(input.pathHost,input.native.reader);
 else await scope.readDeliveryReconciliation(input.host!,input.native.reader);
 input.native.check();await input.path.check(scope.signal);
 if(!equal((await scope.retainCurrent()).current.selection,actual.current.selection))throw fail();
 guard();
 const common={formatVersion:1,delivery:input.choice,bundle:{current:input.bundle.current.selection,bytes:input.bundle.delivery.bytes,sha256:input.bundle.delivery.sha256},stored,current:actual.current.selection};
 const selected=input.handover?
  localReviewHandoverResumeChoice({...common,format:'breditor/selected-local-review-handover-resume',path:input.handover}):
  localReviewResumeChoice({...common,format:'breditor/selected-local-review-delivery-resume',path:input.path.selection});
 return {current:actual.current.selection,choice:selected};
}
export async function previewSelectedLocalReviewResume(scope:SelectedNativeRecoveryScope,provided:LocalReviewResumeInspectionInput):Promise<LocalReviewResumeChoice>{const input=inputs(scope,provided,false),guard=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();checkSelectedNativeDeliveryScope(scope);};return(await inspect(scope,input,guard)).choice as LocalReviewResumeChoice;}
declare const brand:unique symbol;export interface LocalReviewResumeAdmission{readonly [brand]:true}
interface Held{readonly scope:SelectedNativeRecoveryScope;readonly resources:DeliveryPreparationResources;readonly prepared:DeliveryPreparationFile;readonly anchor:LocalReviewResumeChoice['current'];readonly check:()=>void}
const admissions=new WeakMap<LocalReviewResumeAdmission,Held>();
/** Callback-free, one-shot transfer; the recipient must own all later cleanup. */
export function consumeLocalReviewResumeAdmission(value:LocalReviewResumeAdmission,scope:SelectedNativeRecoveryScope):Held{const held=admissions.get(value);if(!held||held.scope!==scope)throw fail('local_review_delivery_policy');admissions.delete(value);return held;}
export async function previewSelectedLocalReviewHandover(scope:SelectedNativeRecoveryScope,provided:LocalReviewHandoverInspectionInput):Promise<LocalReviewHandoverResumeChoice>{
 const input=inputs(scope,provided,false,true),guard=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();checkSelectedNativeDeliveryScope(scope);};
 return (await inspect(scope,input,guard)).choice as LocalReviewHandoverResumeChoice;
}
export async function authorizeSelectedLocalReviewResume(scope:SelectedNativeRecoveryScope,provided:LocalReviewResumeInput){
 return authorize(scope,inputs(scope,provided,true));
}
export async function authorizeSelectedLocalReviewHandover(scope:SelectedNativeRecoveryScope,provided:LocalReviewHandoverResumeInput){
 return authorize(scope,inputs(scope,provided,true,true));
}
async function authorize(scope:SelectedNativeRecoveryScope,input:ReturnType<typeof inputs>){
 if(!input.expected||!input.decide)throw fail('local_review_delivery_policy');
 const resources=new DeliveryPreparationResources(),check=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();resources.check();checkSelectedNativeDeliveryScope(scope);};let success=false;
 retainSelectedNativeDeliveryResource(scope,Object.freeze({check,close:()=>prepared.close.call(resources)}));
 try{const actual=await scope.retainCurrent(),beforeFile=await prepared.open.call(resources,input.bundle.prepared.choice,{wasm:actual.integrity.wasm,checkAuthority:check,signal:scope.signal}),before=await inspect(scope,input,check);if(!equal(before.choice,input.expected))throw fail();
  await decideFreshAssetChoice(input.expected,input.decide,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});
  const after=await inspect(scope,input,check);if(!equal(after.choice,input.expected))throw fail();check();const admission=Object.freeze({}) as LocalReviewResumeAdmission;admissions.set(admission,{scope,resources,prepared:beforeFile,anchor:after.current,check});success=true;return Object.freeze({admission,bundle:input.bundle,choice:input.choice,stored:after.choice.stored,authority:input.authority});
 }finally{if(!success)await prepared.close.call(resources);}
}
