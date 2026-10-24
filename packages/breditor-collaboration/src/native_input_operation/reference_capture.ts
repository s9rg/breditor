/** Read-only discovery across imported native provenance and every local cut.
 * Only genuine snapshot/flat journal brands select the closed family. This is
 * neither a portable backup nor byte availability, writer or activation proof. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {recordReadMode,retainSourceRecordPayload,forgetSourceRecordPayload,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {sameRetainedCutLists} from '../operation_read/retained_cuts.js';
import {retainedLocalReferences} from '../operation_read/retained_local_references.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {ownsRestoredLocalJournal,restoredLocalJournalBinding} from '../restored_local_operation/journal.js';
import {readRestoredLocalHead} from '../restored_local_operation/head.js';
import {ownsFlatLocalJournal,flatLocalJournalBinding} from '../flat_local_operation/journal.js';
import {readFlatLocalHead} from '../flat_local_operation/head.js';
import {readOperationCut} from '../independent_operation/cut_codec.js';
import {readLocalInputReferenceStates} from './input_references.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {SharedEditorError} from '../core.js';
const fail=(suffix:string)=>new SharedEditorError('local_input_reference_'+suffix,'Use genuine local input source custody and current independent read permission');
export interface LocalInputReferenceOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationReadOptions<P>{readonly source:SharedIndependentHistoryPersistentSession<P>}
export interface LocalInputReferenceState{readonly slot:'input'|'current'|'pending'|'live';readonly inputIndex:number|null;readonly cut:string|null;readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly SharedAssetCapturePending[]}
export interface LocalInputReferenceMetadata{
 readonly format:'breditor/local-input-reference-capture';readonly formatVersion:1;
 readonly scope:'input-all-retained-states-current-pending-live-local-native-and-versions';
 readonly inputKind:'snapshot-v1'|'flat-local-v1';readonly operation:string;readonly input:LocalOperationBackupSelection;
 readonly sequence:string;readonly observed:string|null;readonly kind:'ready'|'pending';
 readonly states:readonly LocalInputReferenceState[];readonly references:readonly RichRetainedAssetReference[];
 readonly inputBindings:Awaited<ReturnType<typeof readLocalInputReferenceStates>>['bindings'];
}
const key=Object.freeze({});
export class LocalInputReferenceCapture{
 readonly #metadata:LocalInputReferenceMetadata;#check:(()=>void)|undefined;#current:(()=>void)|undefined;#verify:(()=>Promise<void>)|undefined;#release:(()=>void)|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:LocalInputReferenceMetadata,check:()=>void,current:()=>void,verify:()=>Promise<void>,release:()=>void){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#check=check;this.#current=current;this.#verify=verify;this.#release=release;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#check!();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#current!();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{checkCapture.call(this);await this.#verify!();checkCapture.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;forgetSourceRecordPayload(this);const release=this.#release;this.#check=undefined;this.#current=undefined;this.#verify=undefined;this.#release=undefined;release?.();}
 static async capture<P extends SharedSelectionPolicy>(provided:LocalInputReferenceOptions<P>,mode?:OperationalRecordReadMode):Promise<LocalInputReferenceCapture>{
  recordReadMode(mode);
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail('policy');const names=Object.keys(provided);if(names.some(name=>!['source','session','checkAuthority','signal','limits'].includes(name))||['source','session','checkAuthority'].some(name=>!Object.hasOwn(provided,name)))throw fail('policy');const values:Record<string,unknown>={};for(const name of names){const field=Object.getOwnPropertyDescriptor(provided,name);if(!field||!('value'in field))throw fail('policy');values[name]=field.value;}
  const{source,...options}=values as unknown as LocalInputReferenceOptions<P>,port=independentHistoryNative(source),operation=port.localOperation;if(!operation||port.companion)throw fail('source');
  let kind:'snapshot-v1'|'flat-local-v1',binding:ReturnType<typeof restoredLocalJournalBinding>|ReturnType<typeof flatLocalJournalBinding>;
  if(ownsRestoredLocalJournal(operation)){kind='snapshot-v1';binding=restoredLocalJournalBinding(operation);}else if(ownsFlatLocalJournal(operation)){kind='flat-local-v1';binding=flatLocalJournalBinding(operation);}else throw fail('source');
  const policy=localPortableReadPolicy(binding.expected.original,options),reader=binding.borrowRead(source,policy.guard,policy.options.signal,policy.options.session);let stamp:object|undefined,retained:(()=>void)|undefined,result:LocalInputReferenceCapture|undefined,success=false;
  const current=()=>{reader.checkCurrent();retained?.();if(stamp&&port.stamp()!==stamp)throw fail('changed');retained?.();},check=()=>{policy.guard();reader.check();current();};
  try{
   check();retained=reader.pinRetained();stamp=port.stamp();const live=reader.readSource();check();const cut=await reader.readSnapshot(mode);check();const incoming=await readLocalInputReferenceStates(kind,cut.input,reader.expected,{session:policy.options.session,checkAuthority:check,limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();
   const values:{slot:LocalInputReferenceState['slot'];inputIndex:number|null;cut:string|null;data:SharedIndependentHistoryRecovery}[]=incoming.states.map((data,inputIndex)=>({slot:'input',inputIndex,cut:null,data}));
   for(const[slot,selected,digest]of[['current',cut.current,cut.record.current],['pending',cut.pending,cut.record.pending]]as const)if(selected){const data=await readOperationCut(selected,h=>(kind==='snapshot-v1'?readRestoredLocalHead:readFlatLocalHead)(h,reader.identity));check();values.push({slot,inputIndex:null,cut:digest,data:{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:data.record.identity,documentCheckpoint:data.documentCheckpoint,reviewCheckpoint:data.reviewCheckpoint,versions:data.record.versions}});}values.push({slot:'live',inputIndex:null,cut:null,data:live});
   const states:LocalInputReferenceState[]=[],union=new Map<string,RichRetainedAssetReference>();let previous:LocalPortableReplay|undefined;
   try{for(const selected of values){const replay=await replayLocalOperationRecovery(reader.expected.original,policy.options.session,selected.data,check);let kept=false;try{if(previous)verifyLocalOperationContinuation(replay,previous);const refs=localPortableReferences(replay.core,selected.data,replay.check);for(const reference of refs.references){union.set(JSON.stringify([reference.asset,reference.generation]),reference);if(union.size>100000)throw fail('budget');}states.push({slot:selected.slot,inputIndex:selected.inputIndex,cut:selected.cut,...refs});replay.check();previous?.dispose();previous=replay;kept=true;}finally{if(!kept)replay.dispose();}check();}}finally{previous?.dispose();}
   const metadata:LocalInputReferenceMetadata={format:'breditor/local-input-reference-capture',formatVersion:1,scope:'input-all-retained-states-current-pending-live-local-native-and-versions',inputKind:kind,operation:reader.identity.operation,input:reader.expected,sequence:cut.record.sequence,observed:cut.observed,kind:states.some(row=>row.pending.length)?'pending':'ready',states,references:[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),inputBindings:incoming.bindings};
   const retainedReferences=mode?await retainedLocalReferences(cut.retained,incoming.states.at(-1)!,reader.expected.original,policy.options.session,async value=>{const data=await readOperationCut(value,h=>(kind==='snapshot-v1'?readRestoredLocalHead:readFlatLocalHead)(h,reader.identity));check();return{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:data.record.identity,documentCheckpoint:data.documentCheckpoint,reviewCheckpoint:data.reviewCheckpoint,versions:data.record.versions};},check):undefined;
   const verify=async()=>{check();const actual=await reader.readSnapshot(mode);check();if(JSON.stringify(actual.record)!==JSON.stringify(cut.record)||actual.observed!==cut.observed||mode&&!sameRetainedCutLists(actual.retained,cut.retained))throw fail('changed');};result=new LocalInputReferenceCapture(key,metadata,check,current,verify,reader.release);
   if(mode){const{input,...snapshot}=cut;retainSourceRecordPayload(result,current,()=>({family:kind==='snapshot-v1'?'local-operation-snapshot':'local-operation-flat',state:{format:'breditor/input-source-record-payload',formatVersion:1,inputKind:kind,identity:reader.identity,original:reader.expected,snapshot,live,retainedReferences,inputBindings:incoming.bindings},files:[{role:'parent-input',file:input}]}));}
   checkCapture.call(result);success=true;return result;
  }finally{try{if(success)checkCapture.call(result!);else result?.dispose();}catch(error){result?.dispose();throw error;}finally{if(!success||!result)reader.release();}}
 }
}
const checkCapture=LocalInputReferenceCapture.prototype.check;
export const captureLocalInputOperationReferences=LocalInputReferenceCapture.capture;
