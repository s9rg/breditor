/** Local-only native history and ordered version references across all retained
 * cuts. No relay/outbox is invented and no current upload store is required.
 * Existing complete original admission and native continuation remain mandatory. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {recordReadMode,retainSourceRecordPayload,forgetSourceRecordPayload,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {sameRetainedCutLists} from '../operation_read/retained_cuts.js';
import {retainedLocalReferences} from '../operation_read/retained_local_references.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {prepareIndependentRecovery,type PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {localOperationJournalBinding,type IndependentLocalOperationCutJournal} from './cut_journal.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from './portable_policy.js';
import {localPortableReferences} from './portable_references.js';
import {localPortableCutRecovery} from './portable_cut.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from './portable_replay.js';
import {localJournalFailure as fail} from './journal_failure.js';

export interface LocalOperationReferenceOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationReadOptions<P>{readonly source:SharedIndependentHistoryPersistentSession<P>}
export interface LocalOperationReferenceState{readonly slot:'original'|'current'|'pending'|'live';readonly cut:string|null;readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly SharedAssetCapturePending[]}
export interface LocalOperationReferenceMetadata{
 readonly format:'breditor/local-operation-reference-capture';readonly formatVersion:1;
 readonly scope:'original-current-pending-live-local-native-and-versions';
 readonly operation:string;readonly original:SharedIndependentParticipantSelection;
 readonly sequence:string;readonly observed:string|null;readonly kind:'ready'|'pending';
 readonly states:readonly LocalOperationReferenceState[];readonly references:readonly RichRetainedAssetReference[];
}
const key=Object.freeze({});
export class LocalOperationReferenceCapture{
 readonly #metadata:LocalOperationReferenceMetadata;#check:(()=>void)|undefined;#current:(()=>void)|undefined;#verify:(()=>Promise<void>)|undefined;#release:(()=>void)|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:LocalOperationReferenceMetadata,check:()=>void,current:()=>void,verify:()=>Promise<void>,release:()=>void){if(token!==key)throw fail('independent_local_operation_reference_source');this.#metadata=frozen(structuredClone(metadata));this.#check=check;this.#current=current;this.#verify=verify;this.#release=release;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('independent_local_operation_reference_closed');if(this.#checking)throw fail('independent_local_operation_reference_busy');this.#checking=true;try{this.#check!();if(this.#closed)throw fail('independent_local_operation_reference_closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('independent_local_operation_reference_closed');this.#current!();if(this.#closed)throw fail('independent_local_operation_reference_closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('independent_local_operation_reference_closed');if(this.#verifying)throw fail('independent_local_operation_reference_busy');this.#verifying=true;try{checkCapture.call(this);await this.#verify!();checkCapture.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;forgetSourceRecordPayload(this);const release=this.#release;this.#check=undefined;this.#current=undefined;this.#verify=undefined;this.#release=undefined;release?.();}
 static async capture<P extends SharedSelectionPolicy>(provided:LocalOperationReferenceOptions<P>,mode?:OperationalRecordReadMode):Promise<LocalOperationReferenceCapture>{
  recordReadMode(mode);
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail('independent_local_operation_reference_policy');const names=Object.keys(provided);if(names.some(name=>!['source','session','checkAuthority','signal','limits'].includes(name))||['source','session','checkAuthority'].some(name=>!Object.hasOwn(provided,name)))throw fail('independent_local_operation_reference_policy');const values:Record<string,unknown>={};for(const name of names){const field=Object.getOwnPropertyDescriptor(provided,name);if(!field||!('value'in field))throw fail('independent_local_operation_reference_policy');values[name]=field.value;}
  const input=values as unknown as LocalOperationReferenceOptions<P>,{source,...readOptions}=input,port=independentHistoryNative(source);if(!port.localOperation||port.companion)throw fail('independent_local_operation_required');const binding=localOperationJournalBinding(port.localOperation as IndependentLocalOperationCutJournal),policy=localPortableReadPolicy(binding.expected,readOptions),reader=binding.borrowRead(source,policy.guard,policy.options.signal);
  let prepared:PreparedIndependentRecovery<P>|undefined,stamp:object|undefined,retained:(()=>void)|undefined,result:LocalOperationReferenceCapture|undefined,success=false;
  const current=()=>{reader.checkCurrent();retained?.();if(stamp&&port.stamp()!==stamp)throw fail('independent_local_operation_reference_changed');retained?.();},check=()=>{policy.guard();reader.check();current();};
  try{
   check();retained=reader.pinRetained();stamp=port.stamp();const live=reader.readSource();check();const cut=await reader.readSnapshot(mode);check();prepared=await prepareIndependentRecovery(policy,cut.file);check();
   const values:{slot:LocalOperationReferenceState['slot'];cut:string|null;data:SharedIndependentHistoryRecovery}[]=[{slot:'original',cut:null,data:archive.recovery.call(prepared.backup)}];for(const[slot,selected,digest]of [['current',cut.current,cut.record.current],['pending',cut.pending,cut.record.pending]]as const)if(selected){const data=await localPortableCutRecovery(reader.identity,selected);check();values.push({slot,cut:digest,data});}values.push({slot:'live',cut:null,data:live});
   const states:LocalOperationReferenceState[]=[],union=new Map<string,RichRetainedAssetReference>();let previous:LocalPortableReplay|undefined;
   try{for(const selected of values){const replay=await replayLocalOperationRecovery(reader.expected,policy.options.session,selected.data,check);let kept=false;try{if(previous)verifyLocalOperationContinuation(replay,previous);const refs=localPortableReferences(replay.core,selected.data,replay.check);for(const reference of refs.references){union.set(JSON.stringify([reference.asset,reference.generation]),reference);if(union.size>100000)throw fail('independent_local_operation_reference_budget');}states.push({slot:selected.slot,cut:selected.cut,...refs});replay.check();previous?.dispose();previous=replay;kept=true;}finally{if(!kept)replay.dispose();}check();}}finally{previous?.dispose();}
   const references=[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),metadata:LocalOperationReferenceMetadata={format:'breditor/local-operation-reference-capture',formatVersion:1,scope:'original-current-pending-live-local-native-and-versions',operation:reader.identity.operation,original:reader.expected,sequence:cut.record.sequence,observed:cut.observed,kind:states.some(row=>row.pending.length)?'pending':'ready',states,references};
   const retainedReferences=mode?await retainedLocalReferences(cut.retained,archive.recovery.call(prepared.backup),reader.expected,policy.options.session,value=>localPortableCutRecovery(reader.identity,value),check):undefined;
   const verify=async()=>{check();const actual=await reader.readSnapshot(mode);check();if(JSON.stringify(actual.record)!==JSON.stringify(cut.record)||actual.observed!==cut.observed||mode&&!sameRetainedCutLists(actual.retained,cut.retained))throw fail('independent_local_operation_reference_changed');};result=new LocalOperationReferenceCapture(key,metadata,check,current,verify,reader.release);
   if(mode){const{file,...snapshot}=cut;retainSourceRecordPayload(result,current,()=>({family:'independent-local',state:{format:'breditor/local-source-record-payload',formatVersion:1,identity:reader.identity,original:reader.expected,snapshot,live,retainedReferences},files:[{role:'source-origin',file}]}));}
   checkCapture.call(result);success=true;return result;
  }finally{try{if(prepared)archive.dispose.call(prepared.backup);if(success)checkCapture.call(result!);else result?.dispose();}catch(error){result?.dispose();throw error;}finally{if(!success||!result)reader.release();}}
 }
}
const checkCapture=LocalOperationReferenceCapture.prototype.check;
export const captureLocalOperationReferences=LocalOperationReferenceCapture.capture;
