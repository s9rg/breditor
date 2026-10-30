import {LocalMetadataReferenceWork} from '../selected_local_metadata_assets/room_work.js';
import type {LocalMetadataReferenceBundle,LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import {detachLocalMetadataReferenceBundle,readLocalMetadataReferenceClaims} from '../selected_local_metadata_assets/portable_bundle.js';
import type {LocalMetadataAssetAvailabilityBundle} from '../selected_local_metadata_assets/availability_contract.js';
import {localMetadataAvailabilityHost,type LocalMetadataAssetAvailabilityHost} from '../selected_local_metadata_assets/availability_host.js';
import {detachLocalMetadataBundle} from './bundle.js';
import {readMetadataBundle,inspectMetadataResume} from './resume_inspection.js';
import {metadataResumeChoice} from './resume_policy.js';
import type {LocalMetadataResumeInspectionInput,LocalMetadataResumeInput,LocalMetadataResumeChoice} from './resume_contract.js';
/** One explicit metadata envelope over the genuine local-review owner. Source
 * saves and all original SDK metadata protocols remain constructor-owned. */
import {lendLocalReviewMetadata,type SelectedLocalReviewDelivery} from '../selected_local_review_delivery/coordinator.js';
import type {LocalReviewMetadataParent} from '../selected_local_review_delivery/metadata_parent.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import {nativeRelayDeliveryForSource,type NativeRelayDelivery,type NativeRelayDeliveryPort} from '../relay/native_delivery.js';
import {RelayWorkCustody} from '../relay/work_custody.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fields,rows} from '../physical_room_record_cut/policy.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {admitDeliveryRetainedRecords,deliveryRetainedRecords} from '../delivery_state/retained.js';
import {withIndependentRetainedPort,registerRetainedStoreOwner,type RetainedStorePort} from '../delivery_ports/retained.js';
import {withHeldMetadataOpen} from '../metadata/held_open.js';
import {dormantMetadataTransport,unconfiguredMetadataToken} from '../metadata/dormant_transport.js';
import {SharedSuggestionQueue} from '../suggestions/queue.js';
import {SharedSuggestionRevisions} from '../suggestion_revisions/outbox.js';
import {SharedDocumentVersions} from '../versions/catalog.js';
import type {PreparedCompoundMetadata} from '../metadata/compound_preparation.js';
import type {SegmentedRetainedKind,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import type {SharedReviewAccess} from '../review_types.js';
import {LocalMetadataDeliveryStore} from './store.js';
import {metadataChoice,metadataBinding,initialMetadataRecords,metadataRecordsDigest,metadataSnapshot,metadataJson,equal,fail} from './policy.js';
import {metadataData} from './data.js';
import {requireMetadataRecordsForward} from './forward.js';
import type {LocalMetadataInitialLane,LocalMetadataDeliveryChoice,LocalMetadataDeliveryState,LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from './contract.js';
const key=Object.freeze({});
interface MetadataInput {readonly database:string;readonly lanes:readonly LocalMetadataInitialLane[]}
interface MetadataOpeningInput {readonly expected:LocalMetadataDeliveryChoice;readonly lanes:readonly LocalMetadataInitialLane[];readonly approve:(choice:LocalMetadataDeliveryChoice)=>boolean|Promise<boolean>;readonly checkAuthority:()=>void}
interface Children {versions:SharedDocumentVersions|null;suggestions:SharedSuggestionQueue|null;revisions:SharedSuggestionRevisions|null}
async function choose(parent:LocalReviewMetadataParent,provided:MetadataInput){
 parent.check();const r=fields(provided,['database','lanes']),input=rows(r['lanes'],1024);if(input.length!==parent.choice.lanes.length)throw fail('local_metadata_delivery_policy');
 const initial:LocalMetadataInitialLane[]=[],lanes=[];
 for(const [i,value]of input.entries()){parent.check();const row=fields(value,['id','binding','records']),p=parent.choice.lanes[i];if(!p||row['id']!==p.id)throw fail();const binding=metadataBinding(row['binding'],p),records=initialMetadataRecords(row['records'],binding),source=parent.sources.find(s=>s.id===p.id);if(!source||source.source.parent.kind!=='independent-local')throw fail();admitDeliveryRetainedRecords(source.source.core,binding,records);
  // A new binding cannot pretend an unpublished external predecessor already exists.
  if(records.revisions?.retained.some(revision=>!records.suggestions?.retained.some(proposal=>proposal.packet===revision.previousPacket)))throw fail('local_metadata_delivery_initial');
  initial.push({id:p.id,binding,records});lanes.push({id:p.id,binding,initial:await metadataRecordsDigest(records,binding)});parent.check();
 }
 return{choice:metadataChoice({format:'breditor/selected-local-metadata-delivery',formatVersion:1,database:r['database'],parent:parent.choice,lanes}),initial};
}
/** Data preview lends the genuine parent only for this finite read. It opens no
 * metadata namespace, starts no transport and leaves its old capture unbound. */
export async function previewSelectedLocalMetadataDelivery(owner:SelectedLocalReviewDelivery,input:MetadataInput):Promise<LocalMetadataDeliveryChoice>{const parent=lendLocalReviewMetadata(owner);try{return(await choose(parent,input)).choice;}finally{parent.release();}}
/** Existing-only inspection holds the real parent opening slot and storage
 * request until complete, including late callbacks and native replay cleanup. */
export async function previewSelectedLocalMetadataResume(owner:SelectedLocalReviewDelivery,provided:LocalMetadataResumeInspectionInput):Promise<LocalMetadataResumeChoice>{
 const parent=lendLocalReviewMetadata(owner);let store:LocalMetadataDeliveryStore|undefined,task:Promise<LocalMetadataResumeChoice>|undefined,stopped=false,ending:Promise<void>|undefined;let authority=()=>{};
 const check=()=>{if(stopped)throw fail('local_metadata_delivery_closed');parent.check();authority();parent.check();if(stopped)throw fail('local_metadata_delivery_closed');};
 const stop=()=>{stopped=true;if(store)void store.close().catch(()=>{});};
 const close=()=>{if(ending)return ending;stop();ending=(async()=>{await store?.close();await task?.catch(()=>{});parent.release();})().finally(()=>{ending=undefined;});return ending;};
 try{const r=fields(provided,['choice','bundle','checkAuthority']),choice=metadataChoice(metadataData(r['choice'])),bundle=detachLocalMetadataBundle(r['bundle']);authority=participantAuthority(r['checkAuthority'] as ()=>void);check();if(!equal(parent.choice,choice.parent))throw fail();store=new LocalMetadataDeliveryStore(choice,check);const actual=store;
  task=Promise.resolve().then(async()=>{check();const portable=await readMetadataBundle(parent,bundle,choice,check),stored=await actual.open();check();return inspectMetadataResume(parent,bundle,portable,stored,check);});parent.install(stop,close);return await task;
 }finally{await close();}
}
export class SelectedLocalMetadataDelivery{
 readonly #parent;readonly #choice;readonly #authority;readonly #store;
 readonly #desired=new Map<string,SegmentedRetainedRecords>();readonly #children=new Map<string,Children>();readonly #contexts=new Map<NativeRelayDelivery,RetainedDeliverySource>();readonly #preparing=new Map<string,Promise<PreparedCompoundMetadata>>();readonly #cancels=new Set<()=>void>();
 #snapshot:LocalMetadataDeliverySnapshot|undefined;#opening:Promise<void>|undefined;#serial=Promise.resolve();#capturing:Promise<unknown>|undefined;#referenceWork:LocalMetadataReferenceWork|undefined;#closing=false;#closed=false;#active=false;#busy=false;#ending:Promise<void>|undefined;
 private constructor(token:object,parent:LocalReviewMetadataParent,choice:LocalMetadataDeliveryChoice,authority:()=>void){if(token!==key)throw fail('local_metadata_delivery_policy');this.#parent=parent;this.#choice=choice;this.#authority=authority;this.#store=new LocalMetadataDeliveryStore(choice,this.#guard);Object.freeze(this);}
 #guard=()=>{if(this.#closing||this.#closed)throw fail('local_metadata_delivery_closed');this.#parent.check();this.#authority();this.#parent.check();if(this.#closing||this.#closed)throw fail('local_metadata_delivery_closed');};
 #current=()=>{this.#guard();if(!this.#active)throw fail('local_metadata_delivery_closed');};
 #lane(id:string){const lane=this.#snapshot?.current.lanes.find(row=>row.id===id);if(!lane)throw fail();return lane;}
 #source(id:string){const selected=this.#parent.sources.find(row=>row.id===id);if(!selected||selected.source.parent.kind!=='independent-local')throw fail('local_metadata_delivery_policy');return selected.source;}
 #savedFact(){const committed=this.#store.committed();if(committed&&(!this.#snapshot||committed.current.revision>=this.#snapshot.current.revision))this.#snapshot=committed;}
 /** First-time metadata namespaces are absent-only. Existing data uses the
  * separately named cold protocol and never an implicit overwrite. */
 static async open(owner:SelectedLocalReviewDelivery,provided:MetadataOpeningInput):Promise<SelectedLocalMetadataDelivery>{
  const parent=lendLocalReviewMetadata(owner);let result:SelectedLocalMetadataDelivery|undefined;
  try{const r=fields(provided,['expected','lanes','approve','checkAuthority']),expected=metadataChoice(metadataData(r['expected'])),approve=r['approve'] as MetadataOpeningInput['approve'];if(typeof approve!=='function')throw fail('local_metadata_delivery_policy');const authority=participantAuthority(r['checkAuthority'] as ()=>void),selected=await choose(parent,{database:expected.database,lanes:r['lanes'] as MetadataOpeningInput['lanes']});if(!equal(selected.choice,expected))throw fail('local_metadata_delivery_stale');
   result=new SelectedLocalMetadataDelivery(key,parent,expected,authority);const actual=result;parent.install(()=>actual.#stop(),()=>actual.close());
   const opening=Promise.resolve().then(async()=>{actual.#guard();await decideFreshAssetChoice(expected,approve,{check:actual.#guard,signal:parent.scope.signal,watchClosing:cancel=>{actual.#cancels.add(cancel);return()=>actual.#cancels.delete(cancel);}});actual.#guard();
    const saved=await parent.saved(),lanes=saved.map(row=>{const records=selected.initial.find(initial=>initial.id===row.id)?.records;if(!records)throw fail();return{...row,records};});for(const row of selected.initial)admitDeliveryRetainedRecords(actual.#source(row.id).core,row.binding,row.records);
    parent.bind(await segmentedDigest(metadataJson(expected)));actual.#guard();const initial:LocalMetadataDeliveryState={format:'breditor/selected-local-metadata-delivery-state',formatVersion:1,choice:expected,revision:0,lanes};
    actual.#snapshot=await actual.#store.open(initial);actual.#guard();for(const lane of actual.#snapshot.current.lanes)actual.#desired.set(lane.id,structuredClone(lane.records));actual.#active=true;
   }).finally(()=>{actual.#opening=undefined;});actual.#opening=opening;await opening;actual.#current();return actual;
  }catch(error){if(result)await result.close();else parent.release();throw error;}
 }
 /** A NEW current owner over literal existing data. Fresh approval pins the
  * actual stored head; neither the old portable head nor an old token wins. */
 static async reopen(owner:SelectedLocalReviewDelivery,provided:LocalMetadataResumeInput):Promise<SelectedLocalMetadataDelivery>{
  const parent=lendLocalReviewMetadata(owner);let result:SelectedLocalMetadataDelivery|undefined;
  try{const r=fields(provided,['choice','bundle','checkAuthority','expected','approve']),choice=metadataChoice(metadataData(r['choice'])),bundle=detachLocalMetadataBundle(r['bundle']),expected=metadataResumeChoice(metadataData(r['expected'])),approve=r['approve'] as LocalMetadataResumeInput['approve'];if(typeof approve!=='function'||!equal(expected.delivery,choice)||!equal(parent.choice,choice.parent))throw fail('local_metadata_delivery_policy');const authority=participantAuthority(r['checkAuthority'] as ()=>void);
   result=new SelectedLocalMetadataDelivery(key,parent,choice,authority);const actual=result;parent.install(()=>actual.#stop(),()=>actual.close());
   const opening=Promise.resolve().then(async()=>{actual.#guard();const portable=await readMetadataBundle(parent,bundle,choice,actual.#guard),before=await actual.#store.open(),selected=await inspectMetadataResume(parent,bundle,portable,before,actual.#guard);actual.#guard();if(!equal(selected,expected))throw fail('local_metadata_delivery_stale');
    await decideFreshAssetChoice(expected,approve,{check:actual.#guard,signal:parent.scope.signal,watchClosing:cancel=>{actual.#cancels.add(cancel);return()=>actual.#cancels.delete(cancel);}});actual.#guard();
    const after=await actual.#store.readFresh(),fresh=await inspectMetadataResume(parent,bundle,portable,after,actual.#guard);actual.#guard();if(!equal(fresh,expected))throw fail('local_metadata_delivery_stale');
    parent.bind(await segmentedDigest(metadataJson(choice)));actual.#guard();actual.#snapshot=after;for(const row of after.current.lanes)actual.#desired.set(row.id,structuredClone(row.records));actual.#active=true;
   }).finally(()=>{actual.#opening=undefined;});actual.#opening=opening;await opening;actual.#current();return actual;
  }catch(error){if(result)await result.close();else parent.release();throw error;}
 }
 identity():LocalMetadataDeliveryChoice{return this.#choice;}
 /** Exact durable data only; this does not turn a staged update into success. */
 recovery():LocalMetadataDeliverySnapshot{this.#current();this.#savedFact();if(!this.#snapshot)throw fail();return structuredClone(this.#snapshot);}
 createDelivery(source:RetainedDeliverySource,ceiling:SharedReviewAccess):NativeRelayDelivery{
  this.#current();if(this.#busy)throw fail('local_metadata_delivery_busy');let context:NativeRelayDelivery|undefined;
  try{context=this.#parent.createDelivery(source,ceiling);this.#contexts.set(context,source);this.#current();return context;}catch(error){if(context)void context.close().catch(()=>{});throw error;}
 }
 #port<K extends SegmentedRetainedKind>(id:string,kind:K):RetainedStorePort<K>{
  const source=this.#source(id);if(source.parent.kind!=='independent-local')throw fail();const session=source.parent.session,binding=this.#choice.lanes.find(row=>row.id===id)!.binding;
  const port:RetainedStorePort<K>={kind,check:this.#current,writable:this.#current,read:()=>{this.#current();const records=this.#desired.get(id);if(!records?.[kind])throw fail();return structuredClone(records[kind]) as NonNullable<SegmentedRetainedRecords[K]>;},stage:record=>{this.#current();const before=this.#desired.get(id);if(!before)throw fail();const next=deliveryRetainedRecords({...before,[kind]:record},binding);requireMetadataRecordsForward(before,next);admitDeliveryRetainedRecords(source.core,binding,next);this.#desired.set(id,next);},write:()=>this.#persist()};
  registerRetainedStoreOwner(port,session,source.core,()=>{this.#savedFact();return this.#snapshot?.current.lanes.find(row=>row.id===id)?.records[kind];});return port;
 }
 /** Every actual store write retains source first, then exact metadata records
  * in one full compare-and-swap transaction. The actual caller owns its work. */
 #persist(expected?:LocalMetadataDeliverySnapshot):Promise<void>{this.#current();const desired=new Map([...this.#desired].map(([id,records])=>[id,structuredClone(records)]));const job=this.#serial.then(async()=>{this.#current();const saved=await this.#parent.saved();this.#current();const before=await this.#store.readFresh();this.#current();if(expected&&!equal(before,expected))throw fail('local_metadata_delivery_stale');const lanes=saved.map(row=>{const records=desired.get(row.id);if(!records)throw fail();return{...row,records};});const next:LocalMetadataDeliveryState={...before.current,revision:before.current.revision+1,lanes};try{this.#snapshot=await this.#store.replace(before,next);}finally{this.#savedFact();}this.#current();});this.#serial=job.catch(()=>{});return job;}
 prepare(source:RetainedDeliverySource,context:NativeRelayDelivery):Promise<PreparedCompoundMetadata>{
  this.#current();if(this.#busy)return Promise.reject(fail('local_metadata_delivery_busy'));if(this.#contexts.get(context)!==source||source.parent.kind!=='independent-local')return Promise.reject(fail('local_metadata_delivery_policy'));const selected=this.#choice.lanes.find(row=>this.#source(row.id)===source);if(!selected)return Promise.reject(fail());const pending=this.#preparing.get(selected.id);if(pending)return pending;
  const port=nativeRelayDeliveryForSource(context,source.parent.session,source.core),work=new RelayWorkCustody(source.core,()=>false,()=>fail('local_metadata_delivery_busy'),port.admission);let stopped=false;const check=()=>{if(stopped)throw fail('local_metadata_delivery_closed');this.#current();port.check();};
  const job=work.run(()=>Promise.resolve().then(async()=>{check();let children=this.#children.get(selected.id);if(!children){children={versions:null,suggestions:null,revisions:null};this.#children.set(selected.id,children);}const storage={core:source.core,save:()=>{this.#current();source.save();},flush:()=>{this.#current();return source.flush();}},b=selected.binding,held=<T extends object,K extends SegmentedRetainedKind>(options:T,kind:K)=>withHeldMetadataOpen(withIndependentRetainedPort(options,this.#port(selected.id,kind)),port);
   if(b.versions&&!children.versions){children.versions=await SharedDocumentVersions.open(held({database:'atomic-selected-local-metadata',identity:b.versions,storage,getToken:unconfiguredMetadataToken,autoConnect:false},'versions'));check();}
   if(b.suggestions&&!children.suggestions){children.suggestions=await SharedSuggestionQueue.open(held({database:'atomic-selected-local-metadata',identity:b.suggestions.identity,storage,...(b.suggestions.ownedHistory?{ownedHistory:b.suggestions.ownedHistory}:{})},'suggestions'));check();}
   if(b.revisions&&!children.revisions){if(!children.suggestions||!b.suggestions)throw fail();const transport=dormantMetadataTransport(source.core,b.suggestions.identity,b.revisions.binding,this.#current);children.revisions=await SharedSuggestionRevisions.open(held({database:'atomic-selected-local-metadata',binding:b.revisions.binding,queue:children.suggestions,storage,transport,autoStart:false},'revisions'));check();}
   return Object.freeze({...children});
  })).finally(()=>{this.#preparing.delete(selected.id);work.retire(()=>{});});this.#preparing.set(selected.id,job);
  try{port.track(()=>{stopped=true;},async()=>{await job.catch(()=>{});});}catch(error){stopped=true;throw error;}return job;
 }
 /** Keep parent quiescence through BOTH journals and the metadata digest, so
  * no new context can advance a source between its native and metadata files. */
 /** Register actual work and exclude reentry BEFORE any host policy callback. */
 #captureOperation<T>(work:()=>Promise<T>,prepare?:()=>void):Promise<T>{
  if(this.#busy)return Promise.reject(fail('local_metadata_delivery_busy'));this.#busy=true;
  let preparationError:{error:unknown}|undefined;
  const job=Promise.resolve().then(()=>{if(preparationError)throw preparationError.error;this.#current();return work();}).finally(()=>{this.#referenceWork?.close();this.#referenceWork=undefined;this.#busy=false;this.#capturing=undefined;});this.#capturing=job;
  // Blob detachment can invoke an application subclass's type getter. Publish
  // both the busy gate and actual promise before any such synchronous hook.
  try{prepare?.();}catch(error){preparationError={error};}return job;
 }
 capture():Promise<LocalMetadataRoomBundle>{return this.#captureOperation(async()=>{
  let result:LocalMetadataRoomBundle|undefined;
  await this.#parent.capture(async parent=>{await this.#serial;this.#current();this.#savedFact();if(!this.#snapshot||[...this.#desired].some(([id,records])=>!equal(records,this.#lane(id).records)))throw fail('local_metadata_delivery_unsaved');await this.#persist();const text=metadataJson(this.#snapshot),file=new Blob([text],{type:'application/vnd.breditor.selected-local-metadata+json'});result=Object.freeze({format:'breditor/selected-local-metadata-room-bundle',formatVersion:1,parent,metadata:Object.freeze({file,bytes:file.size,sha256:await segmentedDigest(text)})});this.#current();});if(!result)throw fail();return result;
 });}
 /** One finite reference decision under the parent's actual quiescence. The
  * original capture format is unchanged. Older points are replayed before any
  * new metadata write, and the observed stored head is pinned through CAS. */
 captureReferences():Promise<LocalMetadataReferenceBundle>{return this.#captureReferenceOperation();}
 #captureReferenceOperation(visit?:(work:LocalMetadataReferenceWork)=>Promise<void>,prepare?:()=>void):Promise<LocalMetadataReferenceBundle>{return this.#captureOperation(async()=>{
  let result:LocalMetadataReferenceBundle|undefined;
  await this.#parent.capture(async(parent,integrity)=>{
   await this.#serial;this.#current();const stored=await this.#store.readFresh();this.#savedFact();if([...this.#desired].some(([id,records])=>!equal(records,stored.current.lanes.find(row=>row.id===id)?.records)))throw fail('local_metadata_delivery_unsaved');
   const work=new LocalMetadataReferenceWork(this.#parent.scope,integrity,this.#current);this.#referenceWork=work;await work.begin(parent,stored);this.#current();await this.#persist(stored);this.#current();if(!this.#snapshot)throw fail();
   const text=metadataJson(this.#snapshot),file=new Blob([text],{type:'application/vnd.breditor.selected-local-metadata+json'}),bundle:LocalMetadataRoomBundle=Object.freeze({format:'breditor/selected-local-metadata-room-bundle',formatVersion:1,parent,metadata:Object.freeze({file,bytes:file.size,sha256:await segmentedDigest(text)})});this.#current();result=await work.finish(bundle,this.#snapshot);this.#current();await visit?.(work);this.#current();
  });if(!result)throw fail();return result;
 },prepare);}
 /** One source-owned current cut, both complete upload roles, and a genuine
  * authenticated generation controller. Missing requirements stay Pending;
  * this never manufactures an upload receipt or permission to serve. */
 captureAssetAvailability(host:LocalMetadataAssetAvailabilityHost):Promise<LocalMetadataAssetAvailabilityBundle>{
  let result:LocalMetadataAssetAvailabilityBundle|undefined;
  return this.#captureReferenceOperation(async work=>{result=await work.availability(host);this.#current();},()=>{localMetadataAvailabilityHost(host);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Native verification of the literal PORTABLE cuts, even if the actual
  * stored/live room is newer. This returns immutable dependency DATA only:
  * it neither proves current asset availability nor supplies serving rights.
  * A hash or caller-edited Ready bit cannot replace native recomputation. */
 inspectReferences(provided:LocalMetadataReferenceBundle):Promise<LocalMetadataReferenceCut>{
  let bundle!:LocalMetadataReferenceBundle;
  return this.#captureOperation(async()=>{
   let result:LocalMetadataReferenceCut|undefined;
   await this.#parent.inspect(async integrity=>{
    await this.#serial;this.#current();const stored=await this.#store.readFresh();this.#current();
    const options={wasm:integrity.wasm,checkAuthority:this.#current,signal:this.#parent.scope.signal};
    const claims=await readLocalMetadataReferenceClaims(bundle,options,this.#current);this.#current();
    const portable=await readMetadataBundle(this.#parent,bundle.parent,this.#choice,this.#current,options);this.#current();
    await inspectMetadataResume(this.#parent,bundle.parent,portable,stored,this.#current);this.#current();
    const middle=await metadataSnapshot({before:portable.before,current:claims.stored},this.#choice);this.#current();
    const work=new LocalMetadataReferenceWork(this.#parent.scope,options,this.#current);this.#referenceWork=work;await work.begin(bundle.parent.parent,middle);this.#current();
    const actual=await work.readPortable(bundle.parent,portable);this.#current();
    if(metadataJson(actual)!==claims.text||!equal(await this.#store.readFresh(),stored))throw fail('local_metadata_delivery_stale');this.#current();result=actual;
   });if(!result)throw fail();return result;
  },()=>{bundle=detachLocalMetadataReferenceBundle(provided);});
 }
 #stop():void{this.#closing=true;this.#referenceWork?.close();for(const cancel of this.#cancels)cancel();this.#cancels.clear();for(const context of this.#contexts.keys())void context.close().catch(()=>{});}
 /** Retire only temporary SDK children after actual work drains. The metadata
  * journal, initial intent, native histories and parent binding are retained. */
 close():Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#stop();const opening=this.#opening,capture=this.#capturing;
  this.#ending=(async()=>{await opening?.catch(()=>{});while(this.#preparing.size)await Promise.all([...this.#preparing.values()].map(job=>job.catch(()=>{})));const results=await Promise.allSettled([...this.#contexts.keys()].map(context=>context.close()));const errors=results.filter(row=>row.status==='rejected').map(row=>(row as PromiseRejectedResult).reason);await this.#serial;await capture?.catch(()=>{});if(errors.length)throw new AggregateError(errors,'Local metadata delivery did not drain');for(const child of this.#children.values()){await child.revisions?.discardAndClose();await child.suggestions?.discardAndClose();await child.versions?.discardAndClose();}await this.#store.close();this.#parent.release();this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;
 }
}
