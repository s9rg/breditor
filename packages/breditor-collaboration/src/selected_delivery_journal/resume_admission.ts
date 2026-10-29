
/** SDK-private full-history admission. Only successful real native/source reads
 * and a fresh decision create this one-shot same-scope runtime token. Neither
 * copied choices, journal resources nor old gates can construct one. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkSelectedNativeDeliveryScope,retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import {generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import {generationDeliveryPathRecoveryHostPort} from '../generation_delivery_path_control/host.js';
import {DeliveryPreparationResources} from '../selected_delivery_preparation/resources.js';
import type {DeliveryPreparationFile} from '../selected_delivery_preparation/contract.js';
import {DeliveryJournalResources} from './resources.js';
import {journalIdentity} from './identity.js';
import {journalNativeInputs} from './native_inputs.js';
import {deliveryJournalResumeChoice} from './resume_identity.js';
import {fields,fail} from './policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import type {DeliveryJournalResumeInspectionInput,DeliveryJournalResumeInput} from './resume_contract.js';
const read=DeliveryJournalResources.prototype.readFresh,openPrepared=DeliveryPreparationResources.prototype.open,closePrepared=DeliveryPreparationResources.prototype.close,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function deliveryResumeInputs(supplied:DeliveryJournalResumeInspectionInput|DeliveryJournalResumeInput,resume:boolean){
 const r={...supplied};fields(r,['identity','baseline','previous','path','server','inventory','checkAuthority',...(resume?['expected','approve']:[])]);
 const identity=journalIdentity(r.identity),baseline=generationDeliveryRecoveryHostPort(r.baseline),previous=generationDeliveryRecoveryHostPort(r.previous),path=generationDeliveryPathRecoveryHostPort(r.path),native=journalNativeInputs(r.server,r.inventory),authority=participantAuthority(r.checkAuthority),provided=r as DeliveryJournalResumeInput,expected=resume?deliveryJournalResumeChoice(provided.expected):undefined,approve=resume?provided.approve:undefined;
 if(resume&&(typeof approve!=='function'||!equal(expected!.journal,identity)))throw fail('delivery_journal_policy');
 return Object.freeze({identity,host:r.baseline,baseline,previous,path,native,authority,expected,approve});
}
export type DeliveryResumeInputs=ReturnType<typeof deliveryResumeInputs>;
export async function inspectDeliveryResume(scope:SelectedNativeRecoveryScope,journal:DeliveryJournalResources,input:DeliveryResumeInputs,guard:()=>void){
 checkSelectedNativeDeliveryScope(scope);guard();input.native.check();const snapshot=await read.call(journal),last=snapshot.entries.at(-1)!,base=input.baseline.selection.continuation,previous=input.previous.selection.continuation,path=input.path.selection;
 if(!equal(snapshot.identity,input.identity)||!equal(snapshot.entries[0]!.event.current,input.identity.prepared.before)||!equal(base.previous,input.identity.prepared.server.source.server)||!equal(previous.previous,last.event.server.identity)||!equal(base.current,previous.current)||!equal(path.current,input.baseline.selection)||!equal(base.current.origin,input.identity.prepared.server.source.origin)||!equal(input.native.source,base.current.server)||!equal(input.native.participants,base.current.participants))throw fail();
 // A genuine path may contain extra observed cuts. Every saved cut must occur
 // in literal order, with multiplicity: never deduplicate no-op checkpoints.
 let at=0;for(const entry of snapshot.entries){while(at<path.path.ancestors.length&&!equal(path.path.ancestors[at],entry.event.server.identity))at++;if(at===path.path.ancestors.length)throw fail();at++;}
 await input.path.check(scope.signal);await input.previous.check(scope.signal);guard();
 const current=await scope.retainExtendingAll(snapshot.entries.map(row=>row.current));
 await scope.readDeliveryReconciliation(input.host,input.native.reader);input.native.check();guard();
 await input.path.check(scope.signal);await input.previous.check(scope.signal);
 const after=await read.call(journal);if(!equal(after.head,snapshot.head)||!equal(after.entries.map(row=>row.sha256),snapshot.entries.map(row=>row.sha256))||!equal((await scope.retainCurrent()).current.selection,current.current.selection))throw fail();guard();
 return Object.freeze({snapshot:after,current,choice:deliveryJournalResumeChoice({format:'breditor/selected-native-delivery-journal-resume',formatVersion:1,journal:input.identity,head:after.head,current:current.current.selection,path:input.path.selection})});
}
declare const admissionBrand:unique symbol;
export interface DeliveryResumeAdmission{readonly [admissionBrand]:true}
interface Held{readonly scope:SelectedNativeRecoveryScope;readonly resources:DeliveryPreparationResources;readonly prepared:DeliveryPreparationFile;readonly check:()=>void}
const admissions=new WeakMap<DeliveryResumeAdmission,Held>();
/** Consume once, cheaply, before callbacks. A token expires with its real scope. */
export function consumeDeliveryResumeAdmission(value:DeliveryResumeAdmission,scope:SelectedNativeRecoveryScope):Held{const held=admissions.get(value);if(!held||held.scope!==scope)throw fail('delivery_journal_policy');admissions.delete(value);return held;}
/** Existing-only preparation verification plus full reinspection on both sides
 * of THIS decision. Failure closes its actual pending resource lifetime. */
export async function authorizeDeliveryResume(scope:SelectedNativeRecoveryScope,journal:DeliveryJournalResources,input:DeliveryResumeInputs,guard:()=>void){
 checkSelectedNativeDeliveryScope(scope);if(!input.expected||typeof input.approve!=='function')throw fail('delivery_journal_policy');const preparedResources=new DeliveryPreparationResources(),check=()=>{checkSelectedNativeDeliveryScope(scope);guard();preparedResources.check();};let success=false;
 retainSelectedNativeDeliveryResource(scope,Object.freeze({check,close:()=>closePrepared.call(preparedResources)}));
 try{const actual=await scope.retainCurrent(),prepared=await openPrepared.call(preparedResources,input.identity.prepared,{wasm:actual.integrity.wasm,checkAuthority:check,signal:scope.signal}),before=await inspectDeliveryResume(scope,journal,input,check);
  if(!equal(before.choice,input.expected))throw fail();
  await decideFreshAssetChoice(input.expected,input.approve,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});
  const after=await inspectDeliveryResume(scope,journal,input,check);if(!equal(after.choice,input.expected))throw fail();check();
  const admission=Object.freeze({}) as DeliveryResumeAdmission;admissions.set(admission,{scope,resources:preparedResources,prepared,check});success=true;return Object.freeze({admission,...after});
 }finally{if(!success)await closePrepared.call(preparedResources);}
}
