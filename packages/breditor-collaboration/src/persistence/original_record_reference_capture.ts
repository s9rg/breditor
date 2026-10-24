/** Original native/packet closure from actual source-owned records. Independent
 * stores keep separate committed/pending/LIVE states, not a fabricated atomic
 * cut. Historical parent files and upload/provider bytes are outside this scope. */
import {SharedRichEditor,SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {SharedPersistentSession,captureOriginalNativeRecords} from './shared_session.js';
import {SharedReviewPersistentSession,capturePersistentPairedRecords} from './review_session.js';
import type {PersistentPairedMetadata} from './paired_record_read.js';
import type {OriginalNativeRecords} from './original_record_read.js';
import {SharedDocumentVersions,captureOriginalVersionRecords} from '../versions/catalog.js';
import {VersionCatalogStore,captureOriginalVersionStoreRecords} from '../versions/store.js';
import type {SharedVersionCatalogRecord} from '../versions/types.js';
import {SharedSuggestionQueue,borrowPersistentSuggestionRecords} from '../suggestions/queue.js';
import type {PersistentSuggestionRecords} from '../suggestions/persistent_read_contract.js';
import type {SharedSuggestionQueueRecord} from '../suggestions/types.js';
import {SharedSuggestionRevisions,captureOriginalRevisionRecords} from '../suggestion_revisions/outbox.js';
import type {SharedSuggestionRevisionsRecord} from '../suggestion_revisions/types.js';
import {managedSourceCore,checkManagedSource} from '../managed_custody.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {replayOriginalReferenceState,verifyOriginalReferenceContinuation,type OriginalReferenceNativeState,type OriginalReferenceRestore,type OriginalReferenceEditor,type OriginalReferenceReplay} from './original_reference_replay.js';
import {originalReferencePackets,type OriginalReferencePacketRows} from './original_reference_packets.js';
type Immutable<T>=T extends readonly(infer V)[]?readonly Immutable<V>[]:T extends object?{readonly[K in keyof T]:Immutable<T[K]>}:T;
interface OriginalRecordReferenceBase<P extends SharedSelectionPolicy>{
 readonly source:SharedPersistentSession<P>|SharedReviewPersistentSession<P>;readonly restore:OriginalReferenceRestore;readonly editor?:OriginalReferenceEditor;
 readonly versions?:SharedDocumentVersions<P>|VersionCatalogStore<P>;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
/** A revision reader already owns its exact base queue; choose one, not both. */
export type OriginalRecordReferenceOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=OriginalRecordReferenceBase<P>&(
 |Readonly<{suggestions?:SharedSuggestionQueue<P>;revisions?:never}>
 |Readonly<{revisions:SharedSuggestionRevisions<P>;suggestions?:never}>);
export interface OriginalRecordReferenceState{readonly source:'native'|'versions'|'suggestions'|'revisions';readonly slot:'committed'|'pending'|'live';readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly Immutable<SharedAssetCapturePending>[]}
export interface OriginalRecordReferenceMetadata{readonly format:'breditor/original-record-reference-capture';readonly formatVersion:1;readonly scope:'original-native-and-selected-stores-committed-pending-live';readonly paired:boolean;readonly states:readonly OriginalRecordReferenceState[];readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[]}
interface Read{check():void;checkCurrent():void;verify():Promise<void>;dispose():void}
interface Callbacks{check():void;current():void;verify():Promise<void>;release():void}
/** Trusted parent composition only. Archive records are admitted independently
 * before this replay, and never substitute for genuine current source custody. */
export interface OriginalReferenceOrigin{readonly role:'operation-origin';readonly native:OriginalReferenceNativeState;readonly packets:OriginalReferencePacketRows}
export interface OriginalReferenceOriginResult{readonly role:'operation-origin';readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly Immutable<SharedAssetCapturePending>[]}
let captureAfterOrigins:<P extends SharedSelectionPolicy>(provided:OriginalRecordReferenceOptions<P>,origins:readonly OriginalReferenceOrigin[])=>Promise<{capture:OriginalRecordReferenceCapture;origins:readonly OriginalReferenceOriginResult[]}>;
const key=Object.freeze({}),fail=(suffix:string)=>new SharedEditorError('original_record_reference_'+suffix,'Read exact genuine original native and selected retained stores');
export class OriginalRecordReferenceCapture{
 readonly #metadata:OriginalRecordReferenceMetadata;#callbacks:Callbacks|undefined;#closed=false;#checking=false;#verifying=false;
 private constructor(token:object,metadata:OriginalRecordReferenceMetadata,callbacks:Callbacks){if(token!==key)throw fail('source');this.#metadata=frozen(structuredClone(metadata));this.#callbacks=callbacks;Object.freeze(this);}
 metadata(){return this.#metadata;}
 check():void{if(this.#closed)throw fail('closed');if(this.#checking)throw fail('busy');this.#checking=true;try{this.#callbacks!.check();if(this.#closed)throw fail('closed');}finally{this.#checking=false;}}
 checkCurrent():void{if(this.#closed)throw fail('closed');this.#callbacks!.current();if(this.#closed)throw fail('closed');}
 async verify():Promise<void>{if(this.#closed)throw fail('closed');if(this.#verifying)throw fail('busy');this.#verifying=true;try{checkCapture.call(this);await this.#callbacks!.verify();checkCapture.call(this);}finally{this.#verifying=false;}}
 dispose():void{if(this.#closed)return;this.#closed=true;const callbacks=this.#callbacks;this.#callbacks=undefined;callbacks?.release();}
 static capture<P extends SharedSelectionPolicy>(provided:OriginalRecordReferenceOptions<P>):Promise<OriginalRecordReferenceCapture>{return OriginalRecordReferenceCapture.#capture(provided);}
 static{captureAfterOrigins=async(provided,origins)=>{if(origins.length!==1)throw fail('origin');const rows:OriginalReferenceOriginResult[]=[];const capture=await this.#capture(provided,{origins,rows});return{capture,origins:rows};};}
 static async #capture<P extends SharedSelectionPolicy>(provided:OriginalRecordReferenceOptions<P>,prelude?:{origins:readonly OriginalReferenceOrigin[];rows:OriginalReferenceOriginResult[]}):Promise<OriginalRecordReferenceCapture>{
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail('policy');const names=Object.keys(provided),values:Record<string,unknown>={};if(names.some(n=>!['source','restore','editor','versions','suggestions','revisions','checkAuthority','signal'].includes(n))||['source','restore','checkAuthority'].some(n=>!Object.hasOwn(provided,n)))throw fail('policy');for(const n of names){const d=Object.getOwnPropertyDescriptor(provided,n);if(!d||!('value'in d))throw fail('policy');values[n]=d.value;}
  const input=values as unknown as OriginalRecordReferenceOptions<P>;if(typeof input.restore!=='function'||input.revisions&&input.suggestions)throw fail('policy');let editor:OriginalReferenceEditor|undefined;if(input.editor!==undefined){if(!input.editor||typeof input.editor!=='object'||Array.isArray(input.editor))throw fail('policy');const copied:Record<string,unknown>={};for(const n of Object.keys(input.editor)){const d=Object.getOwnPropertyDescriptor(input.editor,n);if(!d||!('value'in d)||['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].includes(n))throw fail('policy');copied[n]=d.value;}editor=copied;}
  const core=managedSourceCore(input.source) as SharedRichEditor<P>,paired=input.source instanceof SharedReviewPersistentSession;if(!paired&&!(input.source instanceof SharedPersistentSession))throw fail('source');for(const selected of[input.versions,input.suggestions,input.revisions])if(selected&&managedSourceCore(selected)!==core)throw fail('source');
  const authority=participantAuthority(input.checkAuthority),binding=nativeRestoreBinding(input.restore,provided),descriptor=JSON.stringify(sourceNativeRecoveryRead(core).descriptor()),reads:Read[]=[];
  let complete=false,released=false,result:OriginalRecordReferenceCapture|undefined;
  const current=()=>{if(released)throw fail('closed');checkManagedSource(input.source,core);for(const read of reads)read.checkCurrent();},check=()=>{current();authority();current();for(const read of reads)read.check();current();},release=()=>{if(released)return;released=true;for(const read of [...reads].reverse())read.dispose();reads.length=0;};
  try{
   const nativeRead=await(paired?capturePersistentPairedRecords(input.source as SharedReviewPersistentSession<P>,authority,input.signal):captureOriginalNativeRecords(input.source as SharedPersistentSession<P>,authority,input.signal));reads.push(nativeRead);check();
   const versionRead=input.versions?await(input.versions instanceof SharedDocumentVersions?captureOriginalVersionRecords(input.versions,authority,input.signal):captureOriginalVersionStoreRecords(input.versions,authority,input.signal)):undefined;if(versionRead)reads.push(versionRead);check();
   const revisionRead=input.revisions?await captureOriginalRevisionRecords(input.revisions,authority,input.signal):undefined;if(revisionRead)reads.push(revisionRead);check();
   const queueRead=input.suggestions?await borrowPersistentSuggestionRecords(input.suggestions,authority,input.signal):undefined;if(queueRead)reads.push(queueRead);check();
   const selected=nativeStates(nativeRead.metadata()),states:OriginalRecordReferenceState[]=[],union=new Map<string,RichRetainedAssetReference>();let previous:OriginalReferenceReplay|undefined;
   const add=(source:OriginalRecordReferenceState['source'],slot:OriginalRecordReferenceState['slot'],value:ReturnType<typeof originalReferencePackets>)=>{for(const r of value.references){union.set(JSON.stringify([r.asset,r.generation]),r);if(union.size>100000)throw fail('budget');}states.push({source,slot,...value});};
   try{
    for(const origin of prelude?.origins??[]){const next=await replayOriginalReferenceState(origin.native,binding,editor,descriptor,check);let kept=false;try{if(previous)verifyOriginalReferenceContinuation(next,previous);const refs=originalReferencePackets(next.core,{...origin.packets,localVersions:origin.native.paired?.versions},next.check);prelude!.rows.push({role:origin.role,...refs});previous?.dispose();previous=next;kept=true;}finally{if(!kept)next.dispose();}}
    for(const state of selected){const next=await replayOriginalReferenceState(state,binding,editor,descriptor,check);let kept=false;try{if(previous)verifyOriginalReferenceContinuation(next,previous);add('native',state.slot,originalReferencePackets(next.core,{localVersions:state.paired?.versions},next.check));previous?.dispose();previous=next;kept=true;}finally{if(!kept)next.dispose();}}
    if(!previous)throw fail('source');const latest=previous,reviewed=latest.state.reviewedHistory?'reviewed-v1' as const:undefined;
    if(versionRead)for(const[slot,value]of recordVariants(versionRead.metadata()))add('versions',slot,originalReferencePackets(latest.core,{versions:structuredClone(value) as SharedVersionCatalogRecord},latest.check));
    const queue:PersistentSuggestionRecords|undefined=revisionRead?.metadata().queue??queueRead?.metadata();if(queue)for(const[slot,value]of recordVariants(queue))add('suggestions',slot,originalReferencePackets(latest.core,{suggestions:structuredClone(value) as SharedSuggestionQueueRecord,reviewedHistory:reviewed},latest.check));
    if(revisionRead)for(const[slot,value]of recordVariants(revisionRead.metadata()))add('revisions',slot,originalReferencePackets(latest.core,{revisions:structuredClone(value) as SharedSuggestionRevisionsRecord},latest.check));
   }finally{previous?.dispose();}
   const references=[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);result=new OriginalRecordReferenceCapture(key,{format:'breditor/original-record-reference-capture',formatVersion:1,scope:'original-native-and-selected-stores-committed-pending-live',paired,states,kind:states.some(row=>row.pending.length)?'pending':'ready',references},{check,current,verify:async()=>{check();for(const read of reads){await read.verify();check();}},release});checkCapture.call(result);complete=true;return result;
  }finally{if(!complete){result?.dispose();release();}}
 }
}
const checkCapture=OriginalRecordReferenceCapture.prototype.check;
export const captureOriginalRecordReferences=<P extends SharedSelectionPolicy>(provided:OriginalRecordReferenceOptions<P>)=>OriginalRecordReferenceCapture.capture(provided);
/** Explicit historical scope for SDK-owned original-parent composition only. */
export function captureOriginalRecordReferencesAfterOrigins<P extends SharedSelectionPolicy>(provided:OriginalRecordReferenceOptions<P>,origins:readonly OriginalReferenceOrigin[]){return captureAfterOrigins(provided,origins);}
function recordVariants<T>(value:{committed:T;pending:T|null;live:T}):readonly(readonly['committed'|'pending'|'live',T])[]{return[['committed',value.committed],...(value.pending?[['pending',value.pending] as const]:[]),['live',value.live]];}
function nativeStates(value:OriginalNativeRecords|PersistentPairedMetadata):OriginalReferenceNativeState[]{
 if(value.format==='breditor/persistent-original-native-record-read')return recordVariants<{checkpoint:string}>(value).map(([slot,row])=>({slot,checkpoint:row.checkpoint,...value.identity,reviewedHistory:null,paired:null}));
 return recordVariants(value).map(([slot,row])=>({slot,checkpoint:row.documentCheckpointJson,history:row.history,rangeEditing:row.rangeEditing,selectionEditing:row.selectionEditing,richLanguage:row.richLanguage,searchHistory:row.format==='breditor/shared-search-review-checkpoint-record'?'search-v1':null,reviewedHistory:'reviewedHistory'in row?row.reviewedHistory:null,paired:row}));
}
