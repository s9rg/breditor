/** Current generation storage has four separately retained states. Their native
 * histories and packets are read in an independent read-only runtime, not by a
 * current AST scan or by fetching a current upload store. Historical parent files
 * outside this source's committed/attempt/pending/LIVE remain a later obligation. */
import {SharedRichEditor,SharedEditorError,createSharedDocumentEditor} from '../core.js';
import {recordReadMode,retainSourceRecordPayload,forgetSourceRecordPayload,type OperationalRecordReadMode} from '../operation_read/record_payload.js';
import type {SharedRustOwner,SharedSelectionPolicy,SharedEditorOptions} from '../types.js';
import type {SharedSegmentedPersistentSession,SharedSegmentedRecovery} from '../persistence/segmented_session.js';
import {captureSegmentedPersistentRecords} from '../persistence/segmented_session.js';
import {captureRelayGenerationRecords,type SharedSegmentedRelaySession} from '../segmented_relay/session.js';
import type {GenerationRecordMetadata,GenerationRecordRead,GenerationRecordCapture} from '../persistence/generation_record_read.js';
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord} from './contract.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {generationSource} from './admission.js';
import {generationIdentity} from './identity.js';
import {generationRecords} from './records.js';
import {checkGenerationRecords} from './validate_records.js';
import {recordedGenerationReferences} from './recorded_references.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {sourceCoreMethods as native,sourceNativeRecoveryRead} from '../source_native_read.js';
import {admitPairedVersions} from '../persistence/review_record_admission.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import type {SharedSegmentedRelayRecovery} from '../segmented_relay/contract.js';
const fail=(suffix:string)=>new SharedEditorError('generation_record_reference_'+suffix,'Read every genuine retained generation state through matching read-only native replay');
export interface GenerationRecordReferenceOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly source:SharedSegmentedPersistentSession<P>|SharedSegmentedRelaySession<P>;
 readonly restoreSegmented:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
 readonly editor?:Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'|'reviewedHistory'|'searchHistory'|'segmentedHistory'>;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
type ImmutableReferenceValue<T>=T extends readonly(infer V)[]?readonly ImmutableReferenceValue<V>[]:T extends object?{readonly[K in keyof T]:ImmutableReferenceValue<T[K]>}:T;
export interface GenerationRecordReferenceState{readonly slot:'committed'|'attempt'|'pending'|'live';readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly ImmutableReferenceValue<SharedAssetCapturePending>[]}
export interface GenerationRecordReferenceMetadata{
 readonly format:'breditor/generation-record-reference-capture';readonly formatVersion:1;
 readonly scope:'committed-attempt-pending-live-generation-native-and-packets';
 readonly identity:ImmutableReferenceValue<SharedGenerationSourceIdentity>;readonly states:readonly GenerationRecordReferenceState[];
 readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[];
}
const token=Object.freeze({}),disposeCore=SharedRichEditor.prototype.dispose,verifyOrigin=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
/** Only the held operational-parent composition supplies these admitted rows. */
export interface GenerationReferenceOrigin{readonly role:'operation-origin'|'recovery-origin';readonly records:readonly SharedGenerationSourceRecord[]}
export interface GenerationReferenceOriginResult{readonly role:'operation-origin'|'recovery-origin';readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly ImmutableReferenceValue<SharedAssetCapturePending>[]}
let captureAfterOrigins:<P extends SharedSelectionPolicy>(provided:GenerationRecordReferenceOptions<P>,origins:readonly GenerationReferenceOrigin[],mode?:OperationalRecordReadMode)=>Promise<{capture:GenerationRecordReferenceCapture;origins:readonly GenerationReferenceOriginResult[]}>;
export class GenerationRecordReferenceCapture{
 readonly #metadata:GenerationRecordReferenceMetadata;#callbacks:Callbacks|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(key:object,metadata:GenerationRecordReferenceMetadata,callbacks:Callbacks){if(key!==token)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{checkCapture.call(this);await this.#callbacks!.verify();checkCapture.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;forgetSourceRecordPayload(this);const callbacks=this.#callbacks;this.#callbacks=undefined;callbacks?.release();}
 static capture<P extends SharedSelectionPolicy>(provided:GenerationRecordReferenceOptions<P>,mode?:OperationalRecordReadMode):Promise<GenerationRecordReferenceCapture>{return GenerationRecordReferenceCapture.#capture(provided,undefined,mode);}
 static{captureAfterOrigins=async(provided,origins,mode)=>{if(origins.length!==2||origins[0]?.role!=='recovery-origin'||origins[1]?.role!=='operation-origin')throw fail('origin');const rows:GenerationReferenceOriginResult[]=[];const capture=await this.#capture(provided,{origins,rows},mode);return{capture,origins:rows};};}
 static async #capture<P extends SharedSelectionPolicy>(provided:GenerationRecordReferenceOptions<P>,prelude?:{origins:readonly GenerationReferenceOrigin[];rows:GenerationReferenceOriginResult[]},mode?:OperationalRecordReadMode):Promise<GenerationRecordReferenceCapture>{
  recordReadMode(mode);
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail('policy');const fields=Object.keys(provided),values:Record<string,unknown>={};if(fields.some(name=>!['source','restoreSegmented','editor','checkAuthority','signal'].includes(name))||['source','restoreSegmented','checkAuthority'].some(name=>!Object.hasOwn(provided,name)))throw fail('policy');for(const name of fields){const d=Object.getOwnPropertyDescriptor(provided,name);if(!d||!('value'in d))throw fail('policy');values[name]=d.value;}const input=values as unknown as GenerationRecordReferenceOptions<P>;if(typeof input.restoreSegmented!=='function')throw fail('factory');
  let editor:GenerationRecordReferenceOptions<P>['editor'];if(input.editor!==undefined){if(!input.editor||typeof input.editor!=='object'||Array.isArray(input.editor))throw fail('policy');const copied:Record<string,unknown>={};for(const name of Object.keys(input.editor)){const d=Object.getOwnPropertyDescriptor(input.editor,name);if(!d||!('value'in d)||['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].includes(name))throw fail('policy');copied[name]=d.value;}editor=copied;}
  const authority=participantAuthority(input.checkAuthority),port=generationSource(input.source),identity=generationIdentity(port.identity),stamp=port.stamp(),descriptor=JSON.stringify(sourceNativeRecoveryRead(port.core).descriptor()),binding=nativeRestoreBinding(input.restoreSegmented,provided);
  if(identity.kind==="continued-local")throw fail("policy");
  let data:GenerationRecordRead|undefined,result:GenerationRecordReferenceCapture|undefined,success=false;
  const current=()=>{if(!data)throw fail('closed');data.checkCurrent();port.checkManaged();const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp[i]))throw fail('changed');data.checkCurrent();},check=()=>{current();data!.check();current();};
  try{data=await(identity.kind==='local'?captureSegmentedPersistentRecords(input.source as SharedSegmentedPersistentSession<P>,authority,input.signal):captureRelayGenerationRecords(input.source as SharedSegmentedRelaySession<P>,authority,input.signal));check();const selections=recordStates(identity,data.metadata()),states:GenerationRecordReferenceState[]=[],union=new Map<string,RichRetainedAssetReference>();let previous:Awaited<ReturnType<typeof replay>>|undefined;
   try{for(const selected of[...(prelude?.origins??[]),...selections]){const next=await replay(identity,selected.records,binding,editor,descriptor,check);let kept=false;try{if(previous){verifyOrigin.call(next.core,previous.core);if(previous.source.versions.some((packet,i)=>next.source.versions[i]!==packet))throw fail('continuation');if(identity.kind!=='local')forwardProgress((previous.recovery as SharedSegmentedRelayRecovery).relay,(next.recovery as SharedSegmentedRelayRecovery).relay);}const refs=recordedGenerationReferences(next.core,identity,selected.records,next.check);if('role'in selected)prelude!.rows.push({role:selected.role,...refs});else{for(const reference of refs.references){union.set(JSON.stringify([reference.asset,reference.generation]),reference);if(union.size>100000)throw fail('budget');}states.push({slot:selected.slot,...refs});}next.check();previous?.dispose();previous=next;kept=true;}finally{if(!kept)next.dispose();}check();}}finally{previous?.dispose();}
   const references=[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);result=new GenerationRecordReferenceCapture(token,{format:'breditor/generation-record-reference-capture',formatVersion:1,scope:'committed-attempt-pending-live-generation-native-and-packets',identity,states,kind:states.some(s=>s.pending.length)?'pending':'ready',references},{check,current,verify:async()=>{check();await data!.verify();check();},release:()=>data!.dispose()});
   if(mode)retainSourceRecordPayload(result,current,()=>({family:'generation',state:{format:'breditor/generation-source-record-payload',formatVersion:1,identity,records:data!.metadata()},files:[]}));
   checkCapture.call(result);success=true;return result;
  }finally{if(!success){result?.dispose();data?.dispose();}}
 }
}
const checkCapture=GenerationRecordReferenceCapture.prototype.check;
export const captureGenerationRecordReferences=<P extends SharedSelectionPolicy>(provided:GenerationRecordReferenceOptions<P>)=>GenerationRecordReferenceCapture.capture(provided);
/** Explicit protected-parent prelude; standalone capture retains its old scope. */
export function captureGenerationRecordReferencesAfterOrigins<P extends SharedSelectionPolicy>(provided:GenerationRecordReferenceOptions<P>,origins:readonly GenerationReferenceOrigin[],mode?:OperationalRecordReadMode){return captureAfterOrigins(provided,origins,mode);}
function recordStates(identity:SharedGenerationSourceIdentity,m:GenerationRecordMetadata){
 const values:{slot:GenerationRecordReferenceState['slot'];records:readonly SharedGenerationSourceRecord[]}[]=[],native=(c:GenerationRecordCapture):SharedSegmentedRecovery=>({format:'breditor/shared-generation-recovery',formatVersion:1,checkpoint:c.checkpoint,reviewCheckpoint:c.review?.checkpoint??null,versions:[...c.versions]});
 const records=(source:SharedSegmentedRecovery,c:string|null)=>{if(identity.kind==='local'){if(c!==null)throw fail('record');return generationRecords(source);}if(c===null)throw fail('record');const v=JSON.parse(c);return identity.kind==='relay'?generationRecords(source,v):generationRecords(source,v.relay,v.retained);};
 const committed:SharedSegmentedRecovery={format:'breditor/shared-generation-recovery',formatVersion:1,checkpoint:m.committed.checkpoint,reviewCheckpoint:m.committed.record.review?.checkpoint??null,versions:[...m.committed.record.versions]},head=JSON.parse(m.committed.head),companion=identity.kind==='local'?null:identity.kind==='relay'?JSON.stringify(head.relay):JSON.stringify({relay:head.source.relay,retained:head.retained});values.push({slot:'committed',records:records(committed,companion)});if(m.attempt)values.push({slot:'attempt',records:records(native(m.attempt.capture),m.attempt.capture.companion)});if(m.pending)values.push({slot:'pending',records:records(native(m.pending),m.pending.companion)});values.push({slot:'live',records:records(native(m.live),m.live.companion)});return values;
}
async function replay(identity:SharedGenerationSourceIdentity,records:readonly SharedGenerationSourceRecord[],binding:ReturnType<typeof nativeRestoreBinding<GenerationRecordReferenceOptions['restoreSegmented']>>,editor:GenerationRecordReferenceOptions['editor'],descriptor:string,check:()=>void){
 check();const admitted=checkGenerationRecords(identity,records),source=admitted.source;let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
 try{raw=await binding.factory.call(binding.receiver,source.checkpoint);check();initializeSharedReadOnly(raw,true);const options={...editor,...(identity.native.searchHistory?{searchHistory:identity.native.searchHistory}:{}),...(identity.native.reviewedHistory?{reviewedHistory:identity.native.reviewedHistory}:{}),segmentedHistory:'segmented-v1' as const};core=(identity.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,options):new SharedRichEditor(raw,options)) as SharedRichEditor<SharedSelectionPolicy>;if(JSON.stringify(sourceNativeRecoveryRead(core).descriptor())!==descriptor||core.richLanguageVersion()!==identity.native.richLanguage)throw fail('factory');if(identity.native.history==='typing-v1'&&native.view.call(core).historyGrouping!=='typing-v1')core.enableTypingHistory();if(identity.native.rangeEditing==='general-v1'&&native.view.call(core).rangeEditing!=='general-v1')core.enableGeneralRanges();if(identity.review)core.enableReview({...identity.review,access:'read_only'},source.reviewCheckpoint!);core.sealSegmentedPolicies(identity.native.history,identity.native.rangeEditing);admitted.companion?.admit(core);admitPairedVersions(core,source.versions);const selected=core;let closed=false;const live=()=>{if(closed)throw fail('closed');check();if(native.view.call(selected).readOnly!==true||native.checkpointJson.call(selected)!==source.checkpoint||(identity.review?native.reviewCheckpoint.call(selected):null)!==source.reviewCheckpoint)throw fail('replay');check();};live();return{core:selected,source,recovery:admitted.recovery,check:live,dispose(){if(closed)return;closed=true;disposeCore.call(selected);}};}
 catch(error){if(core)disposeCore.call(core);if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}
}
/** SDK-private continuation composition; unchanged read-only replay and record
 * interpretations are shared rather than reimplemented by a successor. */
export {recordStates as generationReferenceRecordStates,replay as replayGenerationReferenceRecords};
