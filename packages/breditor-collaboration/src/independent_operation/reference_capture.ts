/** Complete original/current/pending/live native and packet references without
 * fetching later raster bytes or requiring a current upload store. The retained
 * original still follows its existing complete file admission. This holds a
 * genuine journal read, not uploads, a writer grant or activation authority. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {recordReadMode,retainSourceRecordPayload,forgetSourceRecordPayload,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {sameRetainedCutLists} from '../operation_read/retained_cuts.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {prepareIndependentDeliveryRecovery,type PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {portableReadPolicy,type IndependentOperationReadOptions} from './portable_policy.js';
import {portableRecoveryReferences} from './portable_references.js';
import {replayPortableRecovery} from './portable_replay.js';
import {IndependentNativeOperationOrigin} from './native_origin.js';
import {operationJournalFailure as fail} from './journal_failure.js';

export interface IndependentOperationReferenceOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends IndependentOperationReadOptions<P>{readonly source:SharedIndependentDeliverySession<P>}
export interface IndependentOperationReferenceState{
 readonly slot:'original'|'current'|'pending'|'live';
 readonly cut:string|null;
 readonly references:readonly RichRetainedAssetReference[];
 /** Missing native packet dependencies, not missing raster bytes. */
 readonly pending:readonly SharedAssetCapturePending[];
}
export interface IndependentOperationReferenceMetadata{
 readonly format:'breditor/independent-operation-reference-capture';readonly formatVersion:1;
 readonly scope:'original-current-pending-live-native-and-retained-packets';
 readonly operation:string;readonly original:SharedIndependentDeliveryParticipantSelection;
 readonly sequence:string;readonly observed:string|null;
 readonly states:readonly IndependentOperationReferenceState[];
 readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[];
}
const token=Object.freeze({}),readOrigin=IndependentNativeOperationOrigin.read,verifyOrigin=IndependentNativeOperationOrigin.prototype.verifyReadableCore,disposeOrigin=IndependentNativeOperationOrigin.prototype.dispose;
/** Detached metadata is diagnostic. Only this genuine live handle can recheck
 * the read; disposal releases the journal borrow, never the source or uploads. */
export class IndependentOperationReferenceCapture{
 readonly #metadata:IndependentOperationReferenceMetadata;#check:(()=>void)|undefined;#current:(()=>void)|undefined;#verify:(()=>Promise<void>)|undefined;#release:(()=>void)|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(key:object,metadata:IndependentOperationReferenceMetadata,check:()=>void,current:()=>void,verify:()=>Promise<void>,release:()=>void){if(key!==token)throw fail('independent_operation_reference_source');this.#metadata=frozen(structuredClone(metadata));this.#check=check;this.#current=current;this.#verify=verify;this.#release=release;Object.freeze(this);}
 metadata():IndependentOperationReferenceMetadata{return this.#metadata;}
 check():void{if(this.#closed)throw fail('independent_operation_reference_closed');if(this.#checking)throw fail('independent_operation_reference_busy');this.#checking=true;try{this.#check!();if(this.#closed)throw fail('independent_operation_reference_closed');}finally{this.#checking=false;}}
 /** Pure final managed-native, retained-intent, cancellation and lifetime fence.
  * Run after every selected source's host callbacks, before using a read result. */
 checkCurrent():void{if(this.#closed)throw fail('independent_operation_reference_closed');this.#current!();if(this.#closed)throw fail('independent_operation_reference_closed');}
 /** Re-admit actual durable intent, cuts, original and observed source state.
  * This I/O is separate from the final managed-persistence epoch fence. */
 async verify():Promise<void>{if(this.#closed)throw fail('independent_operation_reference_closed');if(this.#verifying)throw fail('independent_operation_reference_busy');this.#verifying=true;try{checkCapture.call(this);await this.#verify!();checkCapture.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;forgetSourceRecordPayload(this);const release=this.#release;this.#check=undefined;this.#current=undefined;this.#verify=undefined;this.#release=undefined;release?.();}
 static async capture<P extends SharedSelectionPolicy>(provided:IndependentOperationReferenceOptions<P>,mode?:OperationalRecordReadMode):Promise<IndependentOperationReferenceCapture>{
  recordReadMode(mode);
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail('independent_operation_reference_policy');
  const names=Object.keys(provided);if(names.some(name=>!['source','session','checkAuthority','signal','limits'].includes(name))||['source','session','checkAuthority'].some(name=>!Object.hasOwn(provided,name)))throw fail('independent_operation_reference_policy');
  // Snapshot plain own data before any callback; accessors cannot select another source.
  const values:Record<string,unknown>={};for(const name of names){const field=Object.getOwnPropertyDescriptor(provided,name);if(!field||!('value'in field))throw fail('independent_operation_reference_policy');values[name]=field.value;}
  const input=values as unknown as IndependentOperationReferenceOptions<P>,{source,signal}=input,authority=participantAuthority(input.checkAuthority),initial=()=>{checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);},port=independentDeliverySource(source);
  if(!port.operation)throw fail('independent_operation_required');initial();const reader=operationJournalBinding(port.operation as IndependentOperationCutJournal).borrowRead(source,initial,signal);
  let policy:ReturnType<typeof portableReadPolicy<P>>;try{policy=portableReadPolicy(reader.expected,input);}catch(error){reader.release();throw error;}
  let prepared:PreparedIndependentDeliveryRecovery<P>|undefined,origin:IndependentNativeOperationOrigin|undefined,stamp:readonly object[]|undefined,result:IndependentOperationReferenceCapture|undefined,retained:(()=>void)|undefined,success=false;
  const current=()=>{reader.checkCurrent();retained?.();if(stamp){const actual=port.stamp();if(actual.length!==stamp.length||actual.some((value,index)=>value!==stamp![index]))throw fail('independent_operation_reference_changed');}retained?.();};
  const check=()=>{policy.guard();reader.check();current();};
  try{
   check();retained=reader.pinRetained();stamp=port.stamp();const live=reader.readSource(),liveReferences=portableRecoveryReferences(port.core,live,check);check();
   const cut=await reader.readSnapshot(mode);check();prepared=await prepareIndependentDeliveryRecovery(policy,cut.file);check();origin=await readOrigin.call(IndependentNativeOperationOrigin,prepared);check();
   const states:IndependentOperationReferenceState[]=[],union=new Map<string,RichRetainedAssetReference>();
   const add=(slot:IndependentOperationReferenceState['slot'],digest:string|null,read:ReturnType<typeof portableRecoveryReferences>)=>{for(const reference of read.references){union.set(JSON.stringify([reference.asset,reference.generation]),reference);if(union.size>100000)throw fail('independent_operation_reference_budget');}states.push({slot,cut:digest,references:read.references,pending:read.pending});};
   const selections:{slot:IndependentOperationReferenceState['slot'];cut:string|null;data:ReturnType<typeof archive.recovery>}[]=[{slot:'original',cut:null,data:archive.recovery.call(prepared.backup)}];
   // Keep one state for each actual slot; a forgotten LIVE proposal must not hide PENDING.
   for(const [slot,selected,digest]of [['current',cut.current,cut.record.current],['pending',cut.pending,cut.record.pending]]as const)if(selected){const data=await reader.recovery(selected);check();selections.push({slot,cut:digest,data});}
   for(const selected of selections){const replica=await replayPortableRecovery(prepared.factory,selected.data,check);try{verifyOrigin.call(origin,replica.core,selected.data.source.versions);add(selected.slot,selected.cut,portableRecoveryReferences(replica.core,selected.data,replica.check));replica.check();}finally{replica.dispose();}check();}
   add('live',null,liveReferences);check();
   const references=[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),metadata:IndependentOperationReferenceMetadata={format:'breditor/independent-operation-reference-capture',formatVersion:1,scope:'original-current-pending-live-native-and-retained-packets',operation:reader.identity.operation,original:reader.expected,sequence:cut.record.sequence,observed:cut.observed,states,kind:states.some(state=>state.pending.length)?'pending':'ready',references};
   const retainedReferences:({id:string}&ReturnType<typeof portableRecoveryReferences>)[]=[];if(mode){if(!cut.retained)throw fail('independent_operation_reference_source');for(const row of cut.retained){const data=await reader.recovery(row.cut);check();const replica=await replayPortableRecovery(prepared.factory,data,check);try{verifyOrigin.call(origin,replica.core,data.source.versions);retainedReferences.push({id:row.id,...portableRecoveryReferences(replica.core,data,replica.check)});replica.check();}finally{replica.dispose();}check();}}
   const verify=async()=>{check();const actual=await reader.readSnapshot(mode);check();if(JSON.stringify(actual.record)!==JSON.stringify(cut.record)||actual.observed!==cut.observed||mode&&!sameRetainedCutLists(actual.retained,cut.retained))throw fail('independent_operation_reference_changed');};
   result=new IndependentOperationReferenceCapture(token,metadata,check,current,verify,reader.release);
   if(mode){const{file,...snapshot}=cut;retainSourceRecordPayload(result,current,()=>({family:'independent-delivery',state:{format:'breditor/delivery-source-record-payload',formatVersion:1,identity:reader.identity,original:reader.expected,snapshot,live,retainedReferences},files:[{role:'source-origin',file}]}));}
   checkCapture.call(result);success=true;return result;
  }finally{
   try{if(origin)disposeOrigin.call(origin);if(prepared)archive.dispose.call(prepared.backup);if(success)checkCapture.call(result!);else result?.dispose();}catch(error){result?.dispose();throw error;}finally{if(!success||!result)reader.release();}
  }
 }
}
export const captureIndependentOperationReferences=IndependentOperationReferenceCapture.capture;
const checkCapture=IndependentOperationReferenceCapture.prototype.check;
