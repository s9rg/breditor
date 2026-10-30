import type {LocalReviewMetadataParent} from './metadata_parent.js';
/** SDK-private, genuinely prepared local-review delivery. Constructor-owned
 * native/source persistence plus every new receipt store remain explicit.
 * Authentication is performed by the original real document/review adapters.
 * Old local source/catalog/current protocols keep their unbound meaning. */
import type {SharedReviewAccess} from '../review_types.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {claimPreparedSelectedDelivery,assertPreparedSelectedDeliveryPair,preparedSelectedNativeDeliveryAnchor,resumePreparedSelectedLocalReviewDelivery,type PreparedSelectedNativeDelivery} from '../selected_delivery_preparation/coordinator.js';
import type {PreparedDeliveryDriver} from '../selected_delivery_preparation/driver_contract.js';
import {selectedNativeDeliverySources,attachSelectedLocalReviewDelivery,retainSelectedNativeDeliveryResource,withNativeRelayDelivery,type NativeRelayDelivery} from '../relay/native_delivery.js';
import {registerLocalReviewDelivery,type LocalReviewIO} from './admission.js';
import {SharedReviewRelaySync} from '../relay/review_sync.js';
import type {SharedReviewRelayOptions,SharedReviewRelayProgress} from '../relay/review_types.js';
import type {SharedSegmentedReviewReceipt} from '../segmented_relay/contract.js';
import {relayProgress,forwardProgress} from '../segmented_relay/validation.js';
import {reviewProgress} from '../relay/review_validation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fields,rows,hash,integer} from '../physical_room_record_cut/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {LocalReviewDeliveryStore} from './store.js';
import {detachLocalReviewBundle} from './bundle.js';
import {admitLocalReviewRoomSource} from './bundle_native.js';
import {verifyLocalReviewSnapshotContinuation} from './continuation.js';
import {localReviewStoredSelection} from './resume_identity.js';
import {authorizeSelectedLocalReviewResume} from './resume_admission.js';
import type {LocalReviewResumeInput,LocalReviewStoredSelection} from './resume_contract.js';
import {localChoice,localBinding,localSnapshot,localJson,emptyRelay,equal,fail,MAX_LOCAL_REVIEW_BYTES} from './policy.js';
import {verifyLocalReviewProgress} from './native_review.js';
import type {LocalReviewBinding,LocalReviewDeliveryChoice,LocalReviewDeliveryState,LocalReviewDeliverySnapshot,LocalReviewRoomBundle} from './contract.js';
const key=Object.freeze({});
const metadataParents=new WeakMap<object,()=>LocalReviewMetadataParent>();
/** Genuine same-parent composition only; matching fields never lend custody. */
export function lendLocalReviewMetadata(parent:SelectedLocalReviewDelivery):LocalReviewMetadataParent{const open=metadataParents.get(parent);if(!open)throw fail('local_review_delivery_policy');return open();}
interface MetadataChildSlot{readonly key:object;stop():void;wait():Promise<void>}
const stored={open:LocalReviewDeliveryStore.prototype.open,read:LocalReviewDeliveryStore.prototype.readFresh,replace:LocalReviewDeliveryStore.prototype.replace,close:LocalReviewDeliveryStore.prototype.close};
const createReview=SharedReviewRelaySync;
interface ChoiceInput {readonly database:string;readonly bindings:readonly LocalReviewBinding[]}
interface OpeningInput {readonly expected:LocalReviewDeliveryChoice;readonly approve:(choice:LocalReviewDeliveryChoice)=>boolean|Promise<boolean>;readonly checkAuthority:()=>void}
function choices(scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,input:ChoiceInput,before=gate.prepared.choice.before){
 const sources=selectedNativeDeliverySources(scope),r=fields(input,['database','bindings']),bindings=rows(r['bindings'],1024).map(value=>{const row=fields(value,['id','binding']);return{id:row['id'],binding:localBinding(row['binding'])};});
 const local=sources.filter(row=>row.source.parent.kind==='independent-local').sort((a,b)=>a.id<b.id?-1:1);if(local.length!==bindings.length||new Set(bindings.map(row=>row.id)).size!==bindings.length)throw fail('local_review_delivery_policy');
 const lanes=local.map(row=>{const binding=bindings.find(value=>value.id===row.id);if(!binding||row.source.parent.kind!=='independent-local')throw fail();row.source.check();const native=independentHistoryNative(row.source.parent.session);if(native.companion||native.core!==row.source.core)throw fail('local_review_delivery_policy');return{id:row.id,family:row.family,source:native.identity,binding:binding.binding};});
 return{sources,local,choice:localChoice({format:'breditor/selected-local-review-delivery',formatVersion:1,database:r['database'],before,lanes})};
}
/** DATA only. The real prepared gate must still be unclaimed and same-scope. */
export function previewSelectedLocalReviewDelivery(scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,input:ChoiceInput):LocalReviewDeliveryChoice{assertPreparedSelectedDeliveryPair(gate,scope);return choices(scope,gate,input).choice;}
export class SelectedLocalReviewDelivery{
 readonly #scope;readonly #driver;readonly #prepared;readonly #sources;readonly #local;readonly #choice;readonly #authority;readonly #store;
 readonly #contexts=new Map<NativeRelayDelivery,RetainedDeliverySource>();readonly #ios=new Map<RetainedDeliverySource,LocalReviewIO>();readonly #closingListeners=new Set<()=>void>();
 #metadataChild:MetadataChildSlot|undefined;#metadataBinding:string|undefined;
 #snapshot:LocalReviewDeliverySnapshot|undefined;#active=false;#failed=false;#busy=false;#checking=false;#closing=false;#closed=false;#opening:Promise<void>|undefined;#ending:Promise<void>|undefined;#captureWork:Promise<LocalReviewRoomBundle>|undefined;#serial=Promise.resolve();
 private constructor(token:object,scope:SelectedNativeRecoveryScope,driver:PreparedDeliveryDriver,sources:readonly RetainedDeliveryClient[],local:readonly RetainedDeliveryClient[],choice:LocalReviewDeliveryChoice,authority:()=>void,original?:LocalReviewRoomBundle){
  if(token!==key)throw fail('local_review_delivery_policy');this.#scope=scope;this.#driver=driver;this.#prepared=original?.prepared??driver.prepared;this.#sources=sources;this.#local=local;this.#choice=choice;this.#authority=authority;this.#store=new LocalReviewDeliveryStore(choice,this.#guard);
  registerLocalReviewDelivery(this,scope,source=>{this.#writer();const io=this.#ios.get(source);if(!io)throw fail('local_review_delivery_policy');return io;});
  for(const row of local){const selected=choice.lanes.find(value=>value.id===row.id)!;this.#ios.set(row.source,Object.freeze({identity:()=>{this.#writer();return selected.binding;},progress:()=>{this.#writer();return this.#lane(row.id).relay.review!;},receipt:()=>{this.#writer();return this.#lane(row.id).relay.reviewReceipt;},persist:(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt)=>this.#persist(row,progress,receipt)}));}
  metadataParents.set(this,()=>this.#lendMetadata());
  Object.freeze(this);
 }
 #guard=()=>{if(this.#closing||this.#closed)throw fail('local_review_delivery_closed');if(this.#checking)throw fail('local_review_delivery_busy');this.#checking=true;try{this.#scope.check();this.#driver.check();this.#authority();for(const row of this.#local)row.source.check();this.#scope.check();if(this.#closing||this.#closed)throw fail('local_review_delivery_closed');}finally{this.#checking=false;}};
 #writer(){this.#guard();if(!this.#active||this.#failed)throw fail('local_review_delivery_closed');}
 #lane(id:string){const lane=this.#snapshot?.current.lanes.find(row=>row.id===id);if(!lane)throw fail();return lane;}
 #source(row:RetainedDeliveryClient){if(row.source.parent.kind!=='independent-local')throw fail('local_review_delivery_policy');const port=independentHistoryNative(row.source.parent.session);if(port.core!==row.source.core||port.companion)throw fail();return port;}
 async #saved(row:RetainedDeliveryClient){this.#guard();row.source.save();await row.source.flush();this.#guard();return this.#source(row).persisted();}
 /** A full committed native pair is stored with each receipt. This waits for
  * genuine SOURCE persistence, never its own adapter/gate work (no self-drain). */
 #persist(row:RetainedDeliveryClient,progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>{
  this.#writer();const binding=this.#choice.lanes.find(value=>value.id===row.id)!.binding,chosen=reviewProgress(progress,binding),received=receipt===undefined?undefined:structuredClone(receipt);
  const job=this.#serial.then(async()=>{this.#writer();const before=this.#snapshot!,old=this.#lane(row.id),relay=relayProgress({...old.relay,review:chosen,reviewReceipt:received??old.relay.reviewReceipt},old.relay.binding);forwardProgress(old.relay,relay);verifyLocalReviewProgress(row.source.core,relay);
   const source=await this.#saved(row);verifyLocalReviewProgress(row.source.core,relay);const next:LocalReviewDeliveryState={...before.current,revision:before.current.revision+1,lanes:before.current.lanes.map(lane=>lane.id===row.id?{id:row.id,source,relay}:lane)};
   const saved=await stored.replace.call(this.#store,before,next);this.#guard();this.#snapshot=saved;
  }).catch(error=>{this.#failed=true;void this.#driver.close().catch(()=>{});throw error;});this.#serial=job.catch(()=>{});return job;
 }
 /** Publish the opening slot BEFORE invoking authority or application callbacks.
  * Parent close drains even a child that has not finished construction yet. */
 #lendMetadata():LocalReviewMetadataParent{
  if(this.#metadataChild||this.#busy||this.#checking||this.#closing||this.#closed||this.#failed||!this.#active)throw fail('local_review_delivery_busy');
  let stopped=false,released=false,installed:Pick<MetadataChildSlot,'stop'|'wait'>|undefined,finish!:()=>void;
  const opening=new Promise<void>(resolve=>{finish=resolve;}),token=Object.freeze({});
  const slot:MetadataChildSlot={key:token,stop(){stopped=true;installed?.stop();},async wait(){await opening;await installed?.wait();}};this.#metadataChild=slot;
  const check=()=>{if(stopped||released||this.#metadataChild!==slot)throw fail('local_review_delivery_closed');this.#writer();if(stopped||released||this.#metadataChild!==slot)throw fail('local_review_delivery_closed');};
  const release=()=>{if(released)return;released=true;finish();if(this.#metadataChild===slot)this.#metadataChild=undefined;};
  try{check();return Object.freeze({scope:this.#scope,choice:this.#choice,sources:this.#sources,check,
   bind:(binding:string)=>{check();if(!/^[a-f0-9]{64}$/.test(binding)||this.#metadataBinding!==undefined&&this.#metadataBinding!==binding)throw fail('local_review_delivery_policy');this.#metadataBinding=binding;},
   admit:async(bundle:LocalReviewRoomBundle)=>{check();const chosen=detachLocalReviewBundle(bundle),text=localJson(this.#snapshot),file=new Blob([text]),actual=await this.#scope.retainCurrent(),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:check,signal:this.#scope.signal}),stored={revision:this.#snapshot!.current.revision,bytes:file.size,sha256:await integrity.digest(file)};check();await this.#admitBundle(chosen,stored);check();},
   saved:()=>{check();const job=this.#serial.then(async()=>{check();const lanes=[];for(const row of this.#local){const source=await this.#saved(row);check();const relay=structuredClone(this.#lane(row.id).relay);verifyLocalReviewProgress(row.source.core,relay);lanes.push({id:row.id,source,relay});}check();return lanes;});this.#serial=job.then(()=>{},()=>{});return job;},
   createDelivery:(source:RetainedDeliverySource,ceiling:SharedReviewAccess)=>{check();return this.createDelivery(source,ceiling);},
   capture:(visit:(bundle:LocalReviewRoomBundle)=>Promise<void>)=>{check();if(this.#metadataBinding===undefined||typeof visit!=='function')return Promise.reject(fail('local_review_delivery_policy'));return this.#capture(token,visit);},
   install:(stop:()=>void,wait:()=>Promise<void>)=>{check();if(installed||typeof stop!=='function'||typeof wait!=='function')throw fail('local_review_delivery_policy');installed={stop,wait};finish();},release,
  });}catch(error){release();throw error;}
 }
 /** Fresh full native path, all saved files and one explicit current decision
  * create a NEW gate. No old runtime permission is revived. */
 static async resume(scope:SelectedNativeRecoveryScope,input:LocalReviewResumeInput):Promise<SelectedLocalReviewDelivery>{const selected=await authorizeSelectedLocalReviewResume(scope,input),gate=await resumePreparedSelectedLocalReviewDelivery(scope,selected.admission);try{return await this.#begin(scope,gate,{expected:selected.choice,approve:()=>true,checkAuthority:selected.authority},selected.bundle,selected.stored);}catch(error){await gate.close();throw error;}}
 static async open(scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,input:OpeningInput):Promise<SelectedLocalReviewDelivery>{return this.#begin(scope,gate,input);}
 /** Existing-only cold admission: a new genuine prepared gate, literal full
  * bundle, actual source continuation and a fresh host decision are required. */
 static async reopen(scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,bundle:LocalReviewRoomBundle,input:OpeningInput):Promise<SelectedLocalReviewDelivery>{return this.#begin(scope,gate,input,bundle);}
 static async #begin(scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,provided:OpeningInput,bundle?:LocalReviewRoomBundle,approvedStored?:LocalReviewStoredSelection):Promise<SelectedLocalReviewDelivery>{
  assertPreparedSelectedDeliveryPair(gate,scope);const anchor=preparedSelectedNativeDeliveryAnchor(gate,scope);if(bundle)bundle=detachLocalReviewBundle(bundle);const r=fields(provided,['expected','approve','checkAuthority']),expected=localChoice(r['expected']),approve=r['approve'] as OpeningInput['approve'];if(typeof approve!=='function')throw fail('local_review_delivery_policy');const authority=participantAuthority(r['checkAuthority'] as ()=>void),selected=choices(scope,gate,{database:expected.database,bindings:expected.lanes.map(row=>({id:row.id,binding:row.binding}))},bundle?expected.before:gate.prepared.choice.before);if(!equal(selected.choice,expected))throw fail();
  const driver=claimPreparedSelectedDelivery(gate,scope);let owner:SelectedLocalReviewDelivery;try{owner=new SelectedLocalReviewDelivery(key,scope,driver,selected.sources,selected.local,expected,authority,bundle);}catch(error){await driver.close();throw error;}let registered=false;
  try{retainSelectedNativeDeliveryResource(scope,Object.freeze({check:owner.#guard,close:()=>owner.#close()}));registered=true;owner.#busy=true;
   const initializing=Promise.resolve().then(async()=>{owner.#guard();if(!equal((await scope.retainCurrent()).current.selection,anchor))throw fail();
    let initial:LocalReviewDeliveryState|undefined;
    if(!bundle){const lanes=[];for(const row of selected.local){const source=await owner.#saved(row),binding=expected.lanes.find(lane=>lane.id===row.id)!.binding;lanes.push({id:row.id,source,relay:emptyRelay(binding)});}initial={format:'breditor/selected-local-review-delivery-state',formatVersion:1,choice:expected,revision:0,lanes};}
    if(!approvedStored)await decideFreshAssetChoice(expected,approve,{check:owner.#guard,signal:scope.signal,watchClosing:cancel=>{owner.#closingListeners.add(cancel);return()=>owner.#closingListeners.delete(cancel);}});owner.#guard();
    if(!equal((await scope.retainCurrent()).current.selection,anchor))throw fail();owner.#snapshot=await stored.open.call(owner.#store,initial);
    if(bundle)await owner.#admitBundle(bundle,approvedStored);else await owner.#admitRoomSource(gate.prepared.file,expected.before,owner.#snapshot.before,true);
    owner.#guard();owner.#active=true;
   }).finally(()=>{owner.#busy=false;owner.#opening=undefined;});owner.#opening=initializing;await initializing;owner.#writer();return owner;
  }catch(error){owner.#failed=true;await owner.#close();if(!registered)await driver.close();throw error;}
 }
 /** Compare complete native histories and immutable versions, not final text.
  * Catalog selections/factories come from the actual admitted whole-room file. */
 async #admitRoomSource(file:Blob,selection:LocalReviewDeliveryChoice['before'],state:LocalReviewDeliveryState,exact:boolean){return admitLocalReviewRoomSource(this.#scope,file,selection,state,this.#guard,exact);}

 async #admitBundle(input:LocalReviewRoomBundle,approvedStored?:LocalReviewStoredSelection){
  const r=fields(input,['format','formatVersion','prepared','current','delivery']);if(r['format']!=='breditor/selected-local-review-room-bundle'||r['formatVersion']!==1)throw fail();const delivery=fields(r['delivery'],['file','bytes','sha256']),file=archiveBlob(delivery['file'] as Blob,MAX_LOCAL_REVIEW_BYTES),size=integer(delivery['bytes'],MAX_LOCAL_REVIEW_BYTES,1),sha=hash(delivery['sha256']);
  const actual=await this.#scope.retainCurrent(),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:this.#guard});if(file.size!==size||await integrity.digest(file)!==sha)throw fail();const text=await file.text(),snapshot=await localSnapshot(JSON.parse(text),this.#choice);if(localJson(snapshot)!==text)throw fail();
  if(approvedStored){const expected=localReviewStoredSelection(approvedStored),storedFile=new Blob([localJson(this.#snapshot)]);if(this.#snapshot!.current.revision!==expected.revision||storedFile.size!==expected.bytes||await integrity.digest(storedFile)!==expected.sha256)throw fail();}else if(text!==localJson(this.#snapshot))throw fail();
  const bundle=input;if(!equal(bundle.prepared.choice.before,this.#choice.before))throw fail();await this.#scope.retainExtendingAll([{file:bundle.prepared.file,selection:this.#choice.before},bundle.current]);await this.#admitRoomSource(bundle.prepared.file,this.#choice.before,snapshot.before,true);await this.#admitRoomSource(bundle.current.file,bundle.current.selection,snapshot.current,true);if(approvedStored){await verifyLocalReviewSnapshotContinuation(this.#scope,bundle.current,snapshot,this.#snapshot!,this.#guard);await this.#admitRoomSource(bundle.current.file,bundle.current.selection,this.#snapshot!.current,false);}
 }
 createDelivery(source:RetainedDeliverySource,ceiling:SharedReviewAccess):NativeRelayDelivery{
  if(this.#busy||this.#checking)throw fail('local_review_delivery_busy');this.#busy=true;try{this.#writer();if(!this.#sources.some(row=>row.source===source))throw fail('local_review_delivery_policy');const context=this.#driver.create(source,ceiling,this.#guard);this.#contexts.set(context,source);if(this.#ios.has(source))attachSelectedLocalReviewDelivery(context,this.#scope,source,this);return context;}finally{this.#busy=false;}
 }
 createReviewSync(context:NativeRelayDelivery,options:Omit<SharedReviewRelayOptions<SharedSelectionPolicy>,'storage'>):SharedReviewRelaySync<SharedSelectionPolicy>{
  if(this.#busy||this.#checking)throw fail('local_review_delivery_busy');this.#busy=true;try{this.#writer();const source=this.#contexts.get(context),io=source&&this.#ios.get(source);if(!source||!io)throw fail('local_review_delivery_policy');return new createReview(withNativeRelayDelivery({...options,storage:{core:source.core,reviewRelayIdentity:()=>io.identity(),reviewRelayProgress:()=>io.progress(),persistReviewRelayProgress:(progress:SharedReviewRelayProgress)=>io.persist(progress),flush:async()=>{source.save();await source.flush();}}},context));}finally{this.#busy=false;}
 }
 /** Stops/drains ACTUAL adapters before taking a joint complete room/export.
  * All new receipt stores are mandatory; a caller cannot omit one local lane. */
 capture():Promise<LocalReviewRoomBundle>{return this.#capture();}
 #capture(metadata?:object,visit?:(bundle:LocalReviewRoomBundle)=>Promise<void>):Promise<LocalReviewRoomBundle>{
  // Once enlisted, an old review-only file cannot silently omit metadata.
  if((this.#metadataChild||this.#metadataBinding!==undefined)&&(!this.#metadataChild||metadata!==this.#metadataChild.key))return Promise.reject(fail('local_review_delivery_policy'));
  if(this.#busy||this.#checking)return Promise.reject(fail('local_review_delivery_busy'));if(this.#closing||this.#closed||this.#failed||!this.#active)return Promise.reject(fail('local_review_delivery_closed'));this.#busy=true;
  // Publish the actual capture work before any authority/adapter callback.
  // Close must observe this promise too, not merely visible socket state.
  const job=Promise.resolve().then(()=>{this.#writer();return this.#driver.quiesce(async()=>{await this.#serial;this.#writer();let before=await stored.read.call(this.#store);const lanes=[];for(const row of this.#local){const old=before.current.lanes.find(lane=>lane.id===row.id)!;lanes.push({...old,source:await this.#saved(row)});}
   this.#snapshot=await stored.replace.call(this.#store,before,{...before.current,revision:before.current.revision+1,lanes});const actual=await this.#scope.retainExtendingAll([{file:this.#prepared.file,selection:this.#prepared.choice.before},{file:this.#driver.prepared.file,selection:this.#driver.prepared.choice.before}]),text=localJson(this.#snapshot),file=new Blob([text],{type:'application/vnd.breditor.selected-local-review-delivery+json'}),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:this.#guard});
   await this.#admitRoomSource(actual.current.file,actual.current.selection,this.#snapshot.current,true);this.#writer();const bundle=Object.freeze({format:'breditor/selected-local-review-room-bundle' as const,formatVersion:1 as const,prepared:this.#prepared,current:actual.current,delivery:Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)})});await visit?.(bundle);this.#writer();return bundle;
  });}).catch(async error=>{this.#failed=true;await this.#driver.close();throw error;}).finally(()=>{this.#busy=false;this.#captureWork=undefined;});this.#captureWork=job;return job;
 }
 identity():LocalReviewDeliveryChoice{return this.#choice;}
 close():Promise<void>{return this.#close();}
 #close():Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;
  const errors:unknown[]=[];try{this.#metadataChild?.stop();}catch(error){errors.push(error);}for(const cancel of this.#closingListeners)try{cancel();}catch(error){errors.push(error);}this.#closingListeners.clear();
  const child=this.#metadataChild,stopped=this.#driver.close(),opening=this.#opening,serial=this.#serial,capture=this.#captureWork;
  this.#ending=(async()=>{await Promise.all([stopped,child?.wait()].map(async job=>{try{await job;}catch(error){errors.push(error);}}));await opening?.catch(()=>{});await serial;await capture?.catch(()=>{});if(errors.length)throw new AggregateError(errors,'Local metadata child cleanup did not finish');await stored.close.call(this.#store);this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;
 }
}
