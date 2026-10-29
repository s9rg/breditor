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
function inputs(scope:SelectedNativeRecoveryScope,provided:LocalReviewResumeInspectionInput|LocalReviewResumeInput,resume:boolean){checkSelectedNativeDeliveryScope(scope);const r=fields(provided,['choice','bundle','baseline','path','server','inventory','checkAuthority',...(resume?['expected','approve']:[])]),choice=localChoice(r['choice']),bundle=detachLocalReviewBundle(r['bundle']),host=r['baseline'] as LocalReviewResumeInput['baseline'],baseline=generationDeliveryRecoveryHostPort(host),path=generationDeliveryPathRecoveryHostPort(r['path'] as LocalReviewResumeInput['path']),native=journalNativeInputs(r['server'] as LocalReviewResumeInput['server'],r['inventory'] as LocalReviewResumeInput['inventory']),authority=participantAuthority(r['checkAuthority'] as ()=>void),expected=resume?localReviewResumeChoice(r['expected']):undefined,approve=r['approve'] as LocalReviewResumeInput['approve'];if(resume&&typeof approve!=='function')throw fail('local_review_delivery_policy');if(!equal(bundle.prepared.choice.before,choice.before))throw fail();return {choice,bundle,host,baseline,path,native,authority,expected,approve};}
async function inspect(scope:SelectedNativeRecoveryScope,input:ReturnType<typeof inputs>,guard:()=>void){
 guard();input.native.check();const base=input.baseline.selection.continuation,path=input.path.selection;
 if(!equal(path.current,input.baseline.selection)||!equal(base.previous,input.bundle.prepared.choice.server.source.server)||!equal(base.current.origin,input.bundle.prepared.choice.server.source.origin)||!equal(input.native.source,base.current.server)||!equal(input.native.participants,base.current.participants)||!path.path.ancestors.some(row=>equal(row,base.previous)))throw fail();
 await input.path.check(scope.signal);const actual=await scope.retainExtendingAll([{file:input.bundle.prepared.file,selection:input.choice.before},input.bundle.current]),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:guard});
 if(input.bundle.delivery.file.size!==input.bundle.delivery.bytes||await integrity.digest(input.bundle.delivery.file)!==input.bundle.delivery.sha256)throw fail();const text=await input.bundle.delivery.file.text(),snapshot=await localSnapshot(JSON.parse(text),input.choice);if(localJson(snapshot)!==text)throw fail();
 // Existing-only fresh storage read, before any decision or gate construction.
 // Namespace custody is released only after its actual requests have settled.
 const records=new LocalReviewDeliveryStore(input.choice,guard);let saved:LocalReviewDeliverySnapshot;retainSelectedNativeDeliveryResource(scope,Object.freeze({check:guard,close:()=>store.close.call(records)}));try{saved=await store.open.call(records);}finally{await store.close.call(records);}
 await admitLocalReviewRoomSource(scope,input.bundle.prepared.file,input.choice.before,snapshot.before,guard);await admitLocalReviewRoomSource(scope,input.bundle.current.file,input.bundle.current.selection,snapshot.current,guard);
 await verifyLocalReviewSnapshotContinuation(scope,input.bundle.current,snapshot,saved,guard);await admitLocalReviewRoomSource(scope,input.bundle.current.file,input.bundle.current.selection,saved.current,guard,false);const savedText=localJson(saved),savedFile=new Blob([savedText]),stored={revision:saved.current.revision,bytes:savedFile.size,sha256:await integrity.digest(savedFile)};
 await scope.readDeliveryReconciliation(input.host,input.native.reader);input.native.check();await input.path.check(scope.signal);if(!equal((await scope.retainCurrent()).current.selection,actual.current.selection))throw fail();guard();return{current:actual.current.selection,choice:localReviewResumeChoice({format:'breditor/selected-local-review-delivery-resume',formatVersion:1,delivery:input.choice,bundle:{current:input.bundle.current.selection,bytes:input.bundle.delivery.bytes,sha256:input.bundle.delivery.sha256},stored,current:actual.current.selection,path:input.path.selection})};
}
export async function previewSelectedLocalReviewResume(scope:SelectedNativeRecoveryScope,provided:LocalReviewResumeInspectionInput):Promise<LocalReviewResumeChoice>{const input=inputs(scope,provided,false),guard=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();checkSelectedNativeDeliveryScope(scope);};return(await inspect(scope,input,guard)).choice;}
declare const brand:unique symbol;export interface LocalReviewResumeAdmission{readonly [brand]:true}
interface Held{readonly scope:SelectedNativeRecoveryScope;readonly resources:DeliveryPreparationResources;readonly prepared:DeliveryPreparationFile;readonly anchor:LocalReviewResumeChoice['current'];readonly check:()=>void}
const admissions=new WeakMap<LocalReviewResumeAdmission,Held>();
/** Callback-free, one-shot transfer; the recipient must own all later cleanup. */
export function consumeLocalReviewResumeAdmission(value:LocalReviewResumeAdmission,scope:SelectedNativeRecoveryScope):Held{const held=admissions.get(value);if(!held||held.scope!==scope)throw fail('local_review_delivery_policy');admissions.delete(value);return held;}
export async function authorizeSelectedLocalReviewResume(scope:SelectedNativeRecoveryScope,provided:LocalReviewResumeInput){
 const input=inputs(scope,provided,true),resources=new DeliveryPreparationResources(),check=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();resources.check();checkSelectedNativeDeliveryScope(scope);};let success=false;
 retainSelectedNativeDeliveryResource(scope,Object.freeze({check,close:()=>prepared.close.call(resources)}));
 try{const actual=await scope.retainCurrent(),beforeFile=await prepared.open.call(resources,input.bundle.prepared.choice,{wasm:actual.integrity.wasm,checkAuthority:check,signal:scope.signal}),before=await inspect(scope,input,check);if(!equal(before.choice,input.expected))throw fail();
  await decideFreshAssetChoice(input.expected!,input.approve,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});
  const after=await inspect(scope,input,check);if(!equal(after.choice,input.expected))throw fail();check();const admission=Object.freeze({}) as LocalReviewResumeAdmission;admissions.set(admission,{scope,resources,prepared:beforeFile,anchor:after.current,check});success=true;return Object.freeze({admission,bundle:input.bundle,choice:input.choice,stored:after.choice.stored,authority:input.authority});
 }finally{if(!success)await prepared.close.call(resources);}
}
