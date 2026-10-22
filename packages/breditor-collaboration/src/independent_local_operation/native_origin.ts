/** Genuine local-only native ancestry. The retained archive is borrowed for the
 * origin lifetime; no relay binding, delivery receipt or author lease is made.
 * This is not a durable operation journal or whole-room activation authority. */
import {SharedRichEditor,createSharedDocumentEditor,SharedEditorError} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedSelectionPolicy,SharedRustOwner,SharedEditorOptions} from '../types.js';

export interface IndependentLocalNativeOriginOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly backup:SharedIndependentParticipantBackup;readonly expected:SharedIndependentParticipantSelection;
 readonly session:SharedIndependentRecoveryFactory<P>;readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
const key=Object.freeze({}),p=SharedIndependentParticipantBackup.prototype,file=p.file,selection=p.selection,recovery=p.sourceRecovery;
const disposeCore=SharedRichEditor.prototype.dispose,verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
const fail=()=>new SharedEditorError('independent_local_operation_origin','Both selected local native histories and immutable versions must remain available');
const closed=()=>new SharedEditorError('independent_local_operation_origin_closed','The actual local native origin is closed');
let policy:(origin:IndependentLocalNativeOperationOrigin)=>{selection:SharedIndependentParticipantSelection;signal:AbortSignal|undefined};
export class IndependentLocalNativeOperationOrigin{
 readonly #backup:SharedIndependentParticipantBackup;readonly #file:Blob;readonly #selection:SharedIndependentParticipantSelection;readonly #identity:IndependentHistoryIdentity;readonly #core:SharedRichEditor<SharedSelectionPolicy>;
 readonly #document:string;readonly #review:string;readonly #versions:readonly string[];readonly #guard:()=>void;readonly #signal:AbortSignal|undefined;#closed=false;#checking=false;
 private constructor(token:object,backup:SharedIndependentParticipantBackup,expected:SharedIndependentParticipantSelection,original:Blob,core:SharedRichEditor<SharedSelectionPolicy>,guard:()=>void,signal:AbortSignal|undefined){
  if(token!==key)throw closed();const source=recovery.call(backup);this.#backup=backup;this.#file=original;this.#selection=expected;this.#identity=source.identity;this.#core=core;this.#document=source.documentCheckpoint;this.#review=source.reviewCheckpoint;this.#versions=Object.freeze([...source.versions]);this.#guard=guard;this.#signal=signal;Object.freeze(this);
 }
 static{policy=origin=>{if(!origin||typeof origin!=='object'||!(#core in origin)||origin.#closed)throw closed();return{selection:structuredClone(origin.#selection),signal:origin.#signal};};}
 /** Snapshot executable policy before the first host callback; read actual archive
  * methods, never a prepared DTO's checkpoints or a replaced public facade. */
 static async read<P extends SharedSelectionPolicy>(provided:IndependentLocalNativeOriginOptions<P>):Promise<IndependentLocalNativeOperationOrigin>{
  if(this!==IndependentLocalNativeOperationOrigin||!provided||typeof provided!=='object')throw fail();const input={...provided};
  if(Object.keys(input).sort().join(',')!==('signal' in input?'backup,checkAuthority,expected,session,signal':'backup,checkAuthority,expected,session'))throw fail();
  const expected=independentParticipantSelection(input.expected),backup=input.backup,original=file.call(backup),source=recovery.call(backup),o=snapshotIndependentRecoveryFactory(expected,input.session),authority=participantAuthority(input.checkAuthority),signal=independentRecoverySignal(input.signal);
  if(JSON.stringify(selection.call(backup))!==JSON.stringify(expected))throw fail();
  const guard=()=>{checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);if(file.call(backup)!==original)throw fail();};guard();
  const id=source.identity;let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
  try{
   const history=o.documentHistory,restore=history.kind==='original'?history.restoreOriginal:history.restoreSegmented,binding=nativeRestoreBinding(restore,history);raw=await binding.factory.call(binding.receiver,source.documentCheckpoint);guard();initializeSharedReadOnly(raw,true);
   const editor={...o.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1' as const}:{})} as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
   core=(id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,editor):new SharedRichEditor(raw,editor)) as SharedRichEditor<SharedSelectionPolicy>;
   if(core.richLanguageVersion()!==id.native.richLanguage)throw fail();if(id.native.history==='typing-v1'&&native.view.call(core).historyGrouping!=='typing-v1')core.enableTypingHistory();if(id.native.rangeEditing==='general-v1'&&native.view.call(core).rangeEditing!=='general-v1')core.enableGeneralRanges();
   if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(o.review,source.reviewCheckpoint);else core.enableReview(o.review,source.reviewCheckpoint);core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);
   if(native.view.call(core).readOnly!==true||native.checkpointJson.call(core)!==source.documentCheckpoint||(id.reviewHistory==='original'?native.reviewCheckpoint.call(core):native.reviewSegmentedCheckpoint.call(core))!==source.reviewCheckpoint)throw fail();for(const packet of source.versions)native.readVersion.call(core,packet);
   guard();const owner=new IndependentLocalNativeOperationOrigin(key,backup,expected,original,core,guard,signal);check.call(owner);return owner;
  }catch(error){if(core)disposeCore.call(core);if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}
 }
 check():void{if(this.#closed)throw closed();this.#guard();readable.call(this);}
 /** Does not grant writes. Owned unsaved recovery remains readable after the
  * independent host's write grant or cancellation scope ends. */
 checkReadable():void{if(this.#closed)throw closed();if(file.call(this.#backup)!==this.#file||native.view.call(this.#core).readOnly!==true||native.checkpointJson.call(this.#core)!==this.#document||(this.#identity.reviewHistory==='original'?native.reviewCheckpoint.call(this.#core):native.reviewSegmentedCheckpoint.call(this.#core))!==this.#review)throw fail();}
 verifyCore(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void{this.#verify(core,versions,()=>check.call(this));}
 verifyReadableCore(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void{this.#verify(core,versions,()=>readable.call(this));}
 #verify(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],guard:()=>void):void{
  if(this.#checking)throw new SharedEditorError('independent_local_operation_origin_busy','Local native ancestry verification is already in progress');this.#checking=true;
  try{guard();if((native.segmentedHistoryPolicy.call(core)??'original')!==this.#identity.documentHistory||native.reviewHistoryPolicy.call(core)!==this.#identity.reviewHistory)throw fail();const verify=this.#identity.documentHistory==='original'?verifyOriginal:verifySegmented;verify.call(core,this.#core);for(const packet of this.#versions)if(!versions.includes(packet))throw fail();guard();verify.call(core,this.#core);}finally{this.#checking=false;}
 }
 dispose():void{if(this.#closed)return;this.#closed=true;disposeCore.call(this.#core);}
}
const check=IndependentLocalNativeOperationOrigin.prototype.check,readable=IndependentLocalNativeOperationOrigin.prototype.checkReadable,verify=IndependentLocalNativeOperationOrigin.prototype.verifyCore,verifyReadable=IndependentLocalNativeOperationOrigin.prototype.verifyReadableCore;
/** Pure genuine-brand policy snapshot, before any authority callback. */
export const independentLocalNativeOriginPolicy=(origin:IndependentLocalNativeOperationOrigin)=>policy(origin);
/** Actual native methods are captured once. A serialized/fake origin cannot
 * issue either the persistence capability or separate readable ancestry scope. */
export function independentLocalNativeOriginGuard(origin:IndependentLocalNativeOperationOrigin){const selected=policy(origin);check.call(origin);return Object.freeze({check:()=>check.call(origin),capture:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>verify.call(origin,core,versions),signal:selected.signal});}
export function independentLocalNativeOriginReadGuard(origin:IndependentLocalNativeOperationOrigin){policy(origin);readable.call(origin);return Object.freeze({check:()=>readable.call(origin),capture:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>verifyReadable.call(origin,core,versions)});}
