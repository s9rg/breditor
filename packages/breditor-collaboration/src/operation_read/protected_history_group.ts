/** Fresh read barrier for original and generation parents. This deliberately
 * uses only the synchronous private-brand reservation and abandon portions of
 * their old group interface: never verify, consume, retire or release leases.
 * Other delivery/local families need their own fresh admission before joining. */
import {SharedEditorError} from '../core.js';
import {recordReadMode,forwardSourceRecordPayload,sourceRecordPayload,type OperationalRecordReadMode,type SourceRecordPayload} from './record_payload.js';
import type {SharedSelectionPolicy} from '../types.js';
import {OperationalSharedParticipant,reserveOperationalParticipantGroup,type OriginalOperationalReferenceOptions} from '../participant_operation/operation.js';
import {OperationalSharedGenerationParticipant,reserveOperationalGenerationGroup,type GenerationOperationalReferenceOptions} from '../generation_operation/operation.js';
import {readOriginalOperationalRecords} from '../participant_operation/read_records.js';
import {readGenerationOperationalRecords} from '../generation_operation/read_records.js';
import {originalHistoryRecords} from '../participant_operation/history_records.js';
import {generationHistoryRecords} from '../generation_operation/history_records.js';
import {captureOriginalRecordReferencesAfterOrigins,type OriginalRecordReferenceMetadata} from '../persistence/original_record_reference_capture.js';
import {captureGenerationRecordReferencesAfterOrigins,type GenerationRecordReferenceMetadata} from '../generation_source/record_reference_capture.js';
import {composeOperationalHistoryReferences,type OperationalHistoryReferenceMetadata} from './history_references.js';
import type {ParentReferenceProducer} from './reference_read.js';
import {OperationalReadCancellation} from './cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {parentReferenceOptions} from './reference_options.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {checkRecoveryOwnerBindings,checkManagedRecoveryOwners,ownerSources} from '../participant_recovery/components.js';
import {generationOwnerSource} from '../generation_participant/recovery_components.js';
import {originalNativeRetention,generationNativeRetention,type NativeRetentionSource} from './native_retention.js';
import {managedSourceCore,checkManagedSource} from '../managed_custody.js';
import {generationSource} from '../generation_source/admission.js';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {frozen} from '../room_participant_inventory/policy.js';
import {protectedHistoryGroupBudget} from './protected_history_budget.js';
export type ProtectedHistoryParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'original';operation:OperationalSharedParticipant<P>;read:Omit<OriginalOperationalReferenceOptions,'checkAuthority'|'signal'>}>
 |Readonly<{id:string;family:'generation';operation:OperationalSharedGenerationParticipant<P>;read:Omit<GenerationOperationalReferenceOptions,'checkAuthority'|'signal'>}>;
type Metadata=OperationalHistoryReferenceMetadata<OriginalRecordReferenceMetadata|GenerationRecordReferenceMetadata>;
export interface ProtectedHistoryGroupMetadata{readonly format:'breditor/protected-operational-history-group-read';readonly formatVersion:1;readonly scope:'held-original-and-generation-archives-and-current-records';readonly participants:readonly Readonly<{id:string;family:'original'|'generation';history:Metadata}>[];readonly kind:'ready'|'pending'}
interface Callbacks{prepare():Promise<ProtectedHistoryGroupMetadata>;check():void;current():void;verify():Promise<void>;release():void;uploads():readonly Readonly<{id:string;store:RichAssetStore}>[];records():readonly Readonly<{id:string;payload:SourceRecordPayload}>[];native():readonly Readonly<{id:string;source:NativeRetentionSource}>[]}
const token=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('protected_history_group_'+suffix,'Reserve every selected genuine original/generation parent before fresh read callbacks');
let create:(callbacks:Callbacks)=>ProtectedOperationalHistoryGroupRead;
let heldCurrent:(owner:ProtectedOperationalHistoryGroupRead)=>void;
let heldUploads:(owner:ProtectedOperationalHistoryGroupRead)=>readonly Readonly<{id:string;store:RichAssetStore}>[];
let heldRecords:(owner:ProtectedOperationalHistoryGroupRead)=>readonly Readonly<{id:string;payload:SourceRecordPayload}>[];
let heldNative:(owner:ProtectedOperationalHistoryGroupRead)=>readonly Readonly<{id:string;source:NativeRetentionSource}>[];
/** No mutable producer or individual unlock operation escapes this barrier. */
export class ProtectedOperationalHistoryGroupRead{
 #callbacks:Callbacks|undefined;#metadata:ProtectedHistoryGroupMetadata|undefined;#working=false;#closed=false;
 private constructor(key:object,callbacks:Callbacks){if(key!==token)throw fail('source');this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){if(!this.#metadata)throw fail('not_prepared');return this.#metadata;}
 async prepare():Promise<void>{if(this.#closed||this.#working||this.#metadata)throw fail('busy');this.#working=true;let complete=false;try{const value=await this.#callbacks!.prepare(),metadata=frozen(structuredClone(value));this.#callbacks!.current();this.#metadata=metadata;complete=true;}finally{this.#working=false;if(!complete)this.close();}}
 check():void{if(this.#closed||this.#working||!this.#metadata)throw fail('busy');this.#working=true;try{this.#callbacks!.check();this.#callbacks!.current();}finally{this.#working=false;}}
 checkCurrent():void{if(this.#closed||this.#working||!this.#metadata)throw fail('busy');this.#callbacks!.current();}
 async verify():Promise<void>{if(this.#closed||this.#working||!this.#metadata)throw fail('busy');this.#working=true;try{await this.#callbacks!.verify();this.#callbacks!.current();}finally{this.#working=false;}}
 /** Clear callbacks only after cleanup succeeds, so partial cleanup can retry. */
 close():void{if(this.#closed)return;if(this.#working)throw fail('busy');this.#callbacks!.release();this.#callbacks=undefined;this.#closed=true;}
 static reserve<P extends SharedSelectionPolicy>(input:readonly ProtectedHistoryParticipant<P>[],checkAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode):ProtectedOperationalHistoryGroupRead{return reserve(input,checkAuthority,signal,mode);}
 static{heldRecords=owner=>{if(!owner||typeof owner!=='object'||!(#callbacks in owner)||owner.#closed||owner.#working||!owner.#metadata)throw fail('source');owner.#callbacks!.current();return owner.#callbacks!.records();};}
 static{heldNative=owner=>{if(!owner||typeof owner!=='object'||!(#callbacks in owner)||owner.#closed||owner.#working||!owner.#metadata)throw fail('source');owner.#callbacks!.current();const value=owner.#callbacks!.native();owner.#callbacks!.current();return value;};}
 static{create=callbacks=>new ProtectedOperationalHistoryGroupRead(token,callbacks);heldCurrent=owner=>{if(owner.#closed)throw fail('closed');owner.#callbacks!.current();};heldUploads=owner=>{if(!owner||typeof owner!=='object'||!(#callbacks in owner)||owner.#closed)throw fail('source');owner.#callbacks!.current();return owner.#callbacks!.uploads();};}
}
/** Closed data properties only; no caller iterator, field getter or source/store selector. */
function dataObject(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail('policy');const names=Object.keys(value),copy:Record<string,unknown>={};if(required.some(name=>!Object.hasOwn(value,name))||names.some(name=>!required.includes(name)&&!optional.includes(name)))throw fail('policy');for(const name of names){const d=Object.getOwnPropertyDescriptor(value,name);if(!d||!('value'in d))throw fail('policy');copy[name]=d.value;}return copy;}
function reserve<P extends SharedSelectionPolicy>(provided:readonly ProtectedHistoryParticipant<P>[],providedAuthority:()=>void,signal:AbortSignal|undefined,mode?:OperationalRecordReadMode){
 recordReadMode(mode);
 if(!Array.isArray(provided))throw fail('policy');const length=Object.getOwnPropertyDescriptor(provided,'length')?.value;if(!Number.isSafeInteger(length)||length<1||length>1024)throw fail('policy');const authority=participantAuthority(providedAuthority),rows:ProtectedHistoryParticipant<P>[]=[];
 for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(provided,String(i));if(!d||!('value'in d))throw fail('policy');const r=dataObject(d.value,['id','family','operation','read']);if(typeof r['id']!=='string'||!r['id']||r['id'].length>200||!['original','generation'].includes(r['family'] as string))throw fail('policy');const key=r['family']==='original'?'restore':'restoreSegmented',read=dataObject(r['read'],[key],['editor']);if(typeof read[key]!=='function')throw fail('policy');rows.push({...r,read} as unknown as ProtectedHistoryParticipant<P>);}
 if(new Set(rows.map(row=>row.id)).size!==rows.length||new Set(rows.map(row=>row.operation)).size!==rows.length)throw fail('policy');
 const originals=rows.filter((row):row is Extract<ProtectedHistoryParticipant<P>,{family:'original'}>=>row.family==='original'),generations=rows.filter((row):row is Extract<ProtectedHistoryParticipant<P>,{family:'generation'}>=>row.family==='generation');let original:ReturnType<typeof reserveOperationalParticipantGroup>|undefined,generation:ReturnType<typeof reserveOperationalGenerationGroup>|undefined,observation:OperationalReadCancellation|undefined,prepared=false,closed=false;
 const reads=new Map<string,ParentReferenceProducer<Metadata>>(),pending=new Set<ParentReferenceProducer<Metadata>>();
 const local=()=>{if(closed)throw fail('closed');observation?.check(()=>fail('aborted'));original?.checkBindings();for(const s of original?.states??[]){if(s.life.changed||!s.owners.session||!s.owners.uploads)throw fail('changed');checkRecoveryLeasesHeld(s.leases);checkRecoveryOwnerBindings(s.owners);const core=managedSourceCore(s.owners.session);checkManagedSource(s.owners.session,core);for(const selected of[s.owners.versions,s.owners.suggestions,s.owners.revisions])if(selected&&managedSourceCore(selected)!==core)throw fail('changed');RichAssetStore.prototype.checkOpen.call(s.owners.uploads);}for(const s of generation?.states??[]){if(s.life.changed)throw fail('changed');checkRecoveryLeasesHeld(s.leases);const port=generationSource(s.owners.session!);port.checkManaged();if(JSON.stringify(port.identity)!==JSON.stringify(s.p.options.expected.identity.source))throw fail('changed');RichAssetStore.prototype.checkOpen.call(s.owners.uploads!);}};
 const current=()=>{local();for(const read of reads.values())read.checkCurrent();local();},check=()=>{current();authority();current();},parentCheck=()=>{local();authority();local();};
 const release=()=>{if(closed)return;let error:unknown;for(const read of [...pending].reverse())try{read.dispose();pending.delete(read);}catch(cause){error??=cause;}if(pending.size)throw error??fail('cleanup');observation?.close();generation?.abandon();original?.abandon();closed=true;};
 try{
  // Neither constructor invokes any old/new authority or cancellation hook.
  original=reserveOperationalParticipantGroup(originals.map(row=>row.operation) as unknown as Parameters<typeof reserveOperationalParticipantGroup>[0]);generation=reserveOperationalGenerationGroup(generations.map(row=>row.operation) as unknown as Parameters<typeof reserveOperationalGenerationGroup>[0]);
  return create({prepare:async()=>{if(prepared)throw fail('busy');observation=new OperationalReadCancellation(signal);check();const budget=protectedHistoryGroupBudget();
   for(const row of rows){let capture:ParentReferenceProducer<OriginalRecordReferenceMetadata|GenerationRecordReferenceMetadata>|undefined,result:ParentReferenceProducer<Metadata>|undefined,complete=false;try{
    if(row.family==='original'){const s=original!.states[originals.indexOf(row)]!,stored=await readOriginalOperationalRecords(s,check,signal),origins=await originalHistoryRecords(s,stored.files[0]!.file,check,signal),o=parentReferenceOptions({...row.read,checkAuthority:check,...(signal?{signal}:{})},'restore'),value=await captureOriginalRecordReferencesAfterOrigins({source:s.owners.session!,...o,...(s.owners.versions?{versions:s.owners.versions}:{}),...(s.owners.revisions?{revisions:s.owners.revisions}:s.owners.suggestions?{suggestions:s.owners.suggestions}:{})},origins,mode);capture=value.capture;result=composeOperationalHistoryReferences('original',{check:parentCheck,checkCurrent:local,verify:async()=>{const actual=await readOriginalOperationalRecords(s,check,signal);check();if(JSON.stringify(actual.metadata)!==JSON.stringify(stored.metadata))throw fail('changed');},dispose(){}},value.capture,value.origins);if(mode)forwardSourceRecordPayload(result,value.capture,local,source=>({family:'original',state:{parent:stored.metadata,source:source.state},files:[...stored.files,...source.files]}));}
    else{const s=generation!.states[generations.indexOf(row)]!,stored=await readGenerationOperationalRecords(s,check,signal),origins=await generationHistoryRecords(s,stored.files,check,signal),o=parentReferenceOptions({...row.read,checkAuthority:check,...(signal?{signal}:{})},'restoreSegmented'),value=await captureGenerationRecordReferencesAfterOrigins({source:s.owners.session!,...o},origins,mode);capture=value.capture;result=composeOperationalHistoryReferences('generation',{check:parentCheck,checkCurrent:local,verify:async()=>{const actual=await readGenerationOperationalRecords(s,check,signal);check();if(JSON.stringify(actual.metadata)!==JSON.stringify(stored.metadata))throw fail('changed');},dispose(){}},value.capture,value.origins);if(mode)forwardSourceRecordPayload(result,value.capture,local,source=>({family:'generation',state:{parent:stored.metadata,source:source.state},files:[...stored.files,...source.files]}));}
    budget.add(result.metadata());reads.set(row.id,result);pending.add(result);check();complete=true;
   }finally{if(!complete){if(result)result.dispose();else capture?.dispose();}}}
   prepared=true;current();return{format:'breditor/protected-operational-history-group-read',formatVersion:1,scope:'held-original-and-generation-archives-and-current-records',participants:rows.map(row=>({id:row.id,family:row.family,history:reads.get(row.id)!.metadata()})),kind:[...reads.values()].some(read=>read.metadata().kind==='pending')?'pending':'ready'};
  },check:()=>{check();for(const read of reads.values())read.check();current();},current,verify:async()=>{check();for(const read of reads.values()){await read.verify();current();}check();},release,records:()=>{current();if(!mode||!prepared)throw fail('source');return Object.freeze(rows.map(row=>Object.freeze({id:row.id,payload:sourceRecordPayload(reads.get(row.id)!)})));},native:()=>{current();if(!mode||!prepared)throw fail('source');return Object.freeze([...original!.states.map((s,i)=>Object.freeze({id:originals[i]!.id,source:originalNativeRetention(ownerSources(s.p,s.owners),()=>{if(s.life.changed)throw fail('changed');checkRecoveryLeasesHeld(s.leases);checkManagedRecoveryOwners(s.owners);})})),...generation!.states.map((s,i)=>Object.freeze({id:generations[i]!.id,source:generationNativeRetention(generationOwnerSource(s.p,s.owners),()=>{if(s.life.changed)throw fail('changed');checkRecoveryLeasesHeld(s.leases);generationSource(s.owners.session!).checkManaged();})}))]);},uploads:()=>{current();return Object.freeze([...original!.states.map((s,i)=>Object.freeze({id:originals[i]!.id,store:s.owners.uploads!})),...generation!.states.map((s,i)=>Object.freeze({id:generations[i]!.id,store:s.owners.uploads!}))]);}});
 }catch(error){release();throw error;}
}
export const reserveProtectedOperationalHistoryRead=<P extends SharedSelectionPolicy>(input:readonly ProtectedHistoryParticipant<P>[],checkAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode)=>ProtectedOperationalHistoryGroupRead.reserve(input,checkAuthority,signal,mode);
/** Internal nested-barrier fence: private held flags and already captured pins
 * only, including during preparation/verification. No grant, signal getter,
 * metadata projection or I/O. The ordinary checkCurrent busy policy is intact. */
export const checkProtectedHistoryHeldCurrent=(owner:ProtectedOperationalHistoryGroupRead):void=>heldCurrent(owner);
/** Internal legacy stores: caller must acquire their actual temporary custody
 * before any fresh read authority runs. This accessor performs no acquisition. */
export const protectedHistoryUploads=(owner:ProtectedOperationalHistoryGroupRead)=>heldUploads(owner);
/** Full data from the opt-in SAME protected source reads, not another snapshot. */
export const protectedHistoryRecordPayloads=(owner:ProtectedOperationalHistoryGroupRead)=>heldRecords(owner);
/** Actual sources selected by the SAME fully prepared original/generation read. */
export const protectedHistoryNativeRetention=(owner:ProtectedOperationalHistoryGroupRead)=>heldNative(owner);
