/** A genuine read-only replay of the selected complete participant's two native lanes.
 * This proves native continuation, not retained-outbox conservation, upload custody,
 * current server permission or whole-room activation. No author lease is acquired. */
import {SharedRichEditor,createSharedDocumentEditor,SharedEditorError} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {independentOptionsIdentity} from '../independent_history/identity.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import type {SharedSelectionPolicy,SharedRustOwner,SharedEditorOptions} from '../types.js';
import type {IndependentHistoryIdentity} from '../independent_history/contract.js';

const key=Object.freeze({}),p=SharedIndependentDeliveryParticipantBackup.prototype;
const readSelection=p.selection,readFile=p.file,readRecovery=p.sourceRecovery;
const verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin,disposeCore=SharedRichEditor.prototype.dispose;
const closed=()=>new SharedEditorError('independent_operation_origin_closed','The actual selected native origin is closed');
const invalid=()=>new SharedEditorError('independent_operation_origin','Both original native histories and retained local versions must remain available');

export class IndependentNativeOperationOrigin {
 readonly #backup:SharedIndependentDeliveryParticipantBackup;readonly #file:Blob;readonly #guard:()=>void;
 readonly #core:SharedRichEditor<SharedSelectionPolicy>;readonly #identity:IndependentHistoryIdentity;
 readonly #document:string;readonly #review:string;readonly #versions:readonly string[];
 readonly #stamp:ReturnType<typeof coreReadStamp>;
 #closed=false;#checking=false;
 private constructor(token:object,prepared:PreparedIndependentDeliveryRecovery<SharedSelectionPolicy>,core:SharedRichEditor<SharedSelectionPolicy>){
  if(token!==key)throw closed();const recovery=readRecovery.call(prepared.backup).source;
  this.#backup=prepared.backup;this.#file=readFile.call(prepared.backup);this.#guard=prepared.guard;this.#core=core;this.#identity=structuredClone(recovery.identity);this.#document=recovery.documentCheckpoint;this.#review=recovery.reviewCheckpoint;this.#versions=Object.freeze([...recovery.versions]);this.#stamp=coreReadStamp(core);Object.freeze(this);
 }
 /** Factories remain explicit host inputs. A file/ready marker cannot choose one. */
 static async read<P extends SharedSelectionPolicy>(input:PreparedIndependentDeliveryRecovery<P>):Promise<IndependentNativeOperationOrigin>{
  const prepared=input as unknown as PreparedIndependentDeliveryRecovery<SharedSelectionPolicy>,guard=prepared.guard,backup=prepared.backup;guard();
  if(JSON.stringify(readSelection.call(backup))!==JSON.stringify(prepared.options.expected))throw invalid();
  const recovery=readRecovery.call(backup),source=recovery.source,o=prepared.factory,id=source.identity;
  if(JSON.stringify(independentOptionsIdentity(o))!==JSON.stringify(id))throw invalid();
  let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
  try{
   const history=o.documentHistory,restore=history.kind==='original'?history.restoreOriginal:history.restoreSegmented,binding=nativeRestoreBinding(restore,history);
   raw=await binding.factory.call(binding.receiver,source.documentCheckpoint);guard();initializeSharedReadOnly(raw,true);const owned=raw;
   const editor={...o.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1' as const}:{})} as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
   core=(id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(owned,editor):new SharedRichEditor(owned,editor)) as SharedRichEditor<SharedSelectionPolicy>;
   if(core.richLanguageVersion()!==id.native.richLanguage)throw invalid();
   if(id.native.history==='typing-v1'&&native.view.call(core).historyGrouping!=='typing-v1')core.enableTypingHistory();
   if(id.native.rangeEditing==='general-v1'&&native.view.call(core).rangeEditing!=='general-v1')core.enableGeneralRanges();
   const review={...o.review,access:'read_only' as const};
   if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(review,source.reviewCheckpoint);else core.enableReview(review,source.reviewCheckpoint);
   core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);
   // Admit actual native receipts and packets too; metadata/AST equality is insufficient.
   const companion=new IndependentDeliveryCompanion(o,recovery);companion.admit(core);companion.releaseRecords();
   if(native.view.call(core).readOnly!==true||native.checkpointJson.call(core)!==source.documentCheckpoint||(id.reviewHistory==='original'?native.reviewCheckpoint.call(core):native.reviewSegmentedCheckpoint.call(core))!==source.reviewCheckpoint)throw invalid();
   for(const packet of source.versions)native.readVersion.call(core,packet);
   guard();const result=new IndependentNativeOperationOrigin(key,prepared,core);checkOrigin.call(result);return result;
  }catch(error){if(core)disposeCore.call(core);if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}
 }
 /** Canonical lifetime/current-host check; no stored hash is an authority grant. */
 check():void{
  if(this.#closed)throw closed();this.#guard();checkReadableOrigin.call(this);
 }
 /** Private data-lifetime check only. A caller must independently authorize its read.
  * This never selects a persistence driver or bypasses the normal write guard. */
 checkReadable():void{
  currentReadableOrigin.call(this);
  if(readFile.call(this.#backup)!==this.#file||native.view.call(this.#core).readOnly!==true||native.checkpointJson.call(this.#core)!==this.#document||(this.#identity.reviewHistory==='original'?native.reviewCheckpoint.call(this.#core):native.reviewSegmentedCheckpoint.call(this.#core))!==this.#review)throw invalid();
  currentReadableOrigin.call(this);
 }
 /** Private held-readonly liveness only, never byte/native admission or a
  * renewed host grant. Full checks fence persisted reads and native ancestry. */
 checkReadableCurrent():void{if(this.#closed)throw closed();const stamp=coreReadStamp(this.#core);if(stamp.document!==this.#stamp.document||stamp.review!==this.#stamp.review||readFile.call(this.#backup)!==this.#file||native.view.call(this.#core).readOnly!==true)throw invalid();}
 /** Both original/segmented native lanes must descend from the genuine replay.
  * The current local version set may grow, but cannot lose any selected packet. */
 verifyCore(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void{this.#verify(core,versions,()=>checkOrigin.call(this));}
 /** Read-authorized recovery can inspect ancestry after the write grant/signal expires. */
 verifyReadableCore(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void{this.#verify(core,versions,()=>checkReadableOrigin.call(this));}
 #verify(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],check:()=>void):void{
  if(this.#checking)throw new SharedEditorError('independent_operation_origin_busy','A native origin verification is already in progress');this.#checking=true;
  try{
   check();if((native.segmentedHistoryPolicy.call(core)??'original')!==this.#identity.documentHistory||native.reviewHistoryPolicy.call(core)!==this.#identity.reviewHistory)throw invalid();
   const verify=this.#identity.documentHistory==='original'?verifyOriginal:verifySegmented;verify.call(core,this.#core);
   for(const packet of this.#versions)if(!versions.includes(packet))throw invalid();
   check();verify.call(core,this.#core);
  }finally{this.#checking=false;}
 }
 dispose():void{if(this.#closed)return;this.#closed=true;disposeCore.call(this.#core);}
}
const checkOrigin=IndependentNativeOperationOrigin.prototype.check,verifyOrigin=IndependentNativeOperationOrigin.prototype.verifyCore,checkReadableOrigin=IndependentNativeOperationOrigin.prototype.checkReadable,currentReadableOrigin=IndependentNativeOperationOrigin.prototype.checkReadableCurrent,verifyReadableOrigin=IndependentNativeOperationOrigin.prototype.verifyReadableCore;
/** Frozen private guard issued by a genuine native origin, never a caller DTO. */
export function independentNativeOriginGuard(origin:IndependentNativeOperationOrigin){checkOrigin.call(origin);return Object.freeze({check:()=>checkOrigin.call(origin),capture:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>verifyOrigin.call(origin,core,versions)});}
/** Genuine read capability, not an author grant; storage and host read checks belong to its owner. */
export function independentNativeOriginReadGuard(origin:IndependentNativeOperationOrigin){checkReadableOrigin.call(origin);return Object.freeze({check:()=>checkReadableOrigin.call(origin),checkCurrent:()=>currentReadableOrigin.call(origin),capture:(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[])=>verifyReadableOrigin.call(origin,core,versions)});}
