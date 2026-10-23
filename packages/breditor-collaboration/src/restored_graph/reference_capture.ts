/** Genuine original/input/CURRENT/PENDING/LIVE reference discovery. Later
 * raster availability is independent; immutable input admission stays complete.
 * No upload owner, native writer, network connection or activation is created. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {IndependentOperationReferenceOptions,IndependentOperationReferenceState} from '../independent_operation/reference_capture.js';
import type {IndependentOperationBackupSelection} from '../independent_operation/portable_contract.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {restoredOperationJournalBinding,type RestoredOperationJournal} from '../restored_operation/journal.js';
import {prepareIndependentDeliveryRecovery,type PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as originalArchive} from '../independent_delivery_recovery/archive.js';
import {IndependentOperationBackup,portableOperationArchive as snapshot} from '../independent_operation/portable_backup.js';
import {IndependentOperationLineageBackup,operationLineageArchive as lineage} from '../independent_operation/lineage_archive.js';
import {RestoredOperationGraphArchive,restoredGraphArchive as graph} from './archive.js';
import {restoredGraphReaderOrigin,type RestoredGraphReaderInput} from './reader_origin.js';
import {restoredInputReferenceStates} from './input_references.js';
import {portableReadPolicy} from '../independent_operation/portable_policy.js';
import {portableRecoveryReferences} from '../independent_operation/portable_references.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';

export interface RestoredGraphReferenceState{
 readonly slot:IndependentOperationReferenceState['slot']|'input';readonly cut:string|null;
 readonly inputState?:Readonly<{kind:'snapshot-v1'|'state-v2';manifestSha256:string}>;
 readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly SharedAssetCapturePending[];
}
export interface RestoredGraphReferenceMetadata{
 readonly format:'breditor/restored-graph-reference-capture';readonly formatVersion:1;
 readonly scope:'original-input-current-pending-live-native-and-retained-packets';
 readonly operation:string;readonly original:SharedIndependentDeliveryParticipantSelection;
 readonly input:Readonly<{kind:RestoredGraphReaderInput['kind'];selection:IndependentOperationBackupSelection;fileSha256:string}>;
 readonly sequence:string;readonly observed:string|null;readonly kind:'ready'|'pending';
 readonly states:readonly RestoredGraphReferenceState[];readonly references:readonly RichRetainedAssetReference[];
}
const key=Object.freeze({});
function disposeInput(input:RestoredGraphReaderInput){if(input.kind==='snapshot-v1')snapshot.dispose.call(input.owner);else if(input.kind==='lineage-v1')lineage.dispose.call(input.owner);else graph.dispose.call(input.owner);}
/** Metadata is detached diagnostic data, not a durable read or provider grant. */
export class RestoredGraphReferenceCapture{
 readonly #metadata:RestoredGraphReferenceMetadata;#check:(()=>void)|undefined;#current:(()=>void)|undefined;#verify:(()=>Promise<void>)|undefined;#release:(()=>void)|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:RestoredGraphReferenceMetadata,check:()=>void,current:()=>void,verify:()=>Promise<void>,release:()=>void){if(token!==key)throw fail('restored_graph_reference_source');this.#metadata=frozen(structuredClone(metadata));this.#check=check;this.#current=current;this.#verify=verify;this.#release=release;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('restored_graph_reference_closed');if(this.#checking)throw fail('restored_graph_reference_busy');this.#checking=true;try{this.#check!();if(this.#closed)throw fail('restored_graph_reference_closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('restored_graph_reference_closed');this.#current!();if(this.#closed)throw fail('restored_graph_reference_closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('restored_graph_reference_closed');if(this.#verifying)throw fail('restored_graph_reference_busy');this.#verifying=true;try{checkCapture.call(this);await this.#verify!();checkCapture.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;const release=this.#release;this.#check=undefined;this.#current=undefined;this.#verify=undefined;this.#release=undefined;release?.();}
 static async capture<P extends SharedSelectionPolicy>(provided:IndependentOperationReferenceOptions<P>):Promise<RestoredGraphReferenceCapture>{
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail('restored_graph_reference_policy');const names=Object.keys(provided);if(names.some(name=>!['source','session','checkAuthority','signal','limits'].includes(name))||['source','session','checkAuthority'].some(name=>!Object.hasOwn(provided,name)))throw fail('restored_graph_reference_policy');const values:Record<string,unknown>={};for(const name of names){const field=Object.getOwnPropertyDescriptor(provided,name);if(!field||!('value'in field))throw fail('restored_graph_reference_policy');values[name]=field.value;}
  const input=values as unknown as IndependentOperationReferenceOptions<P>,{source,signal}=input,authority=participantAuthority(input.checkAuthority),initial=()=>{checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);},port=independentDeliverySource(source);if(!port.operation)throw fail('restored_graph_reference_source');initial();const reader=restoredOperationJournalBinding(port.operation as RestoredOperationJournal).borrowRead(source,initial,signal);let policy:ReturnType<typeof portableReadPolicy<P>>;try{policy=portableReadPolicy(reader.expected,input);}catch(error){reader.release();throw error;}
  let prepared:PreparedIndependentDeliveryRecovery<P>|undefined,incoming:RestoredGraphReaderInput|undefined,origins:Awaited<ReturnType<typeof restoredGraphReaderOrigin>>|undefined,stamp:readonly object[]|undefined,retained:(()=>void)|undefined,result:RestoredGraphReferenceCapture|undefined,success=false;
  const current=()=>{reader.checkCurrent();retained?.();if(stamp){const actual=port.stamp();if(actual.length!==stamp.length||actual.some((value,index)=>value!==stamp![index]))throw fail('restored_graph_reference_changed');}retained?.();},check=()=>{policy.guard();reader.check();current();};
  try{
   check();retained=reader.pinRetained();stamp=port.stamp();const live=reader.readSource(),liveRefs=portableRecoveryReferences(port.core,live,check);check();const cut=await reader.readSnapshot();check();prepared=await prepareIndependentDeliveryRecovery(policy,cut.original);check();
   const readOptions={session:policy.options.session,checkAuthority:check,limits:policy.options.limits,...(signal?{signal}:{})},kind:unknown=reader.inputKind;if(kind==='snapshot-v1')incoming={kind,owner:await snapshot.read.call(IndependentOperationBackup,cut.input,reader.inputSelection,readOptions)};else if(kind==='lineage-v1')incoming={kind,owner:await lineage.read.call(IndependentOperationLineageBackup,cut.input,reader.inputSelection,readOptions)};else if(kind==='lineage-v2')incoming={kind,owner:await graph.read.call(RestoredOperationGraphArchive,cut.input,reader.inputSelection,readOptions)};else throw fail('restored_graph_reference_input');check();
   origins=await restoredGraphReaderOrigin(incoming,originalArchive.recovery.call(prepared.backup),prepared.factory,check);check();const states:RestoredGraphReferenceState[]=[],union=new Map<string,RichRetainedAssetReference>();
   const add=(row:RestoredGraphReferenceState)=>{for(const reference of row.references){union.set(JSON.stringify([reference.asset,reference.generation]),reference);if(union.size>100000)throw fail('restored_graph_reference_budget');}states.push(row);};
   add({slot:'original',cut:null,...origins.originalReferences});for(const state of await restoredInputReferenceStates(incoming)){check();add({slot:'input',cut:null,inputState:{kind:state.kind,manifestSha256:state.manifestSha256},references:state.references,pending:[]});}check();
   for(const[slot,selected,digest]of [['current',cut.current,cut.record.current],['pending',cut.pending,cut.record.pending]]as const)if(selected){const data=await reader.recovery(selected);check();const replay=await replayPortableRecovery(prepared.factory,data,check);try{origins.verify(replay.core,data.source.versions);add({slot,cut:digest,...portableRecoveryReferences(replay.core,data,replay.check)});replay.check();}finally{replay.dispose();}check();}
   add({slot:'live',cut:null,...liveRefs});check();const references=[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),metadata:RestoredGraphReferenceMetadata={format:'breditor/restored-graph-reference-capture',formatVersion:1,scope:'original-input-current-pending-live-native-and-retained-packets',operation:reader.identity.operation,original:reader.expected,input:{kind:incoming.kind,selection:reader.inputSelection,fileSha256:reader.inputFileSha256},sequence:cut.record.sequence,observed:cut.observed,kind:states.some(row=>row.pending.length)?'pending':'ready',states,references};
   const verify=async()=>{check();const actual=await reader.readSnapshot();check();if(JSON.stringify(actual.record)!==JSON.stringify(cut.record)||actual.observed!==cut.observed)throw fail('restored_graph_reference_changed');};result=new RestoredGraphReferenceCapture(key,metadata,check,current,verify,reader.release);checkCapture.call(result);success=true;return result;
  }finally{try{origins?.dispose();if(prepared)originalArchive.dispose.call(prepared.backup);if(incoming)disposeInput(incoming);if(success)checkCapture.call(result!);else result?.dispose();}catch(error){result?.dispose();throw error;}finally{if(!success||!result)reader.release();}}
 }
}
const checkCapture=RestoredGraphReferenceCapture.prototype.check;
export const captureRestoredGraphReferences=RestoredGraphReferenceCapture.capture;
