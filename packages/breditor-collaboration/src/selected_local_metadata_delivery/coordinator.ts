import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {prepareHeldRoomActivation,type RoomActivationPreparationPolicy} from '../room_native_activation_intent/prepare.js';
import {commitHeldRoomActivation,readHeldRoomActivation,type RoomActivationCommitResult} from '../room_native_activation_intent/commit.js';
import {roomActivationIntentChoice,roomActivationDatabase} from '../room_native_activation_intent/identity.js';
import {fail as activationIntentFailure} from '../room_native_activation_intent/policy.js';
import type {RoomActivationIntentChoice,RoomActivationRetainedIntent} from '../room_native_activation_intent/contract.js';
import type {PrepareRoomNativeActivationInput,CommitRoomNativeActivationInput} from '../room_native_activation_intent/coordinator_contract.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {coreReadStamp} from '../core_read_stamp.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {ServerPacketReconciliationRead} from '../server_packet_reconciliation/contract.js';
import {detachResolvedServerPacketRecoveryBundle} from '../server_packet_source_resolution/bundle.js';
import type {ResolvedServerPacketRecoveryBundle,ResolvedServerPacketRecoveryOutcome,ResolvedServerPacketRecoveryInspection} from '../server_packet_source_resolution/contract.js';
import {detachServerPacketRecoveryBundle} from '../server_packet_recovery/inspection_bundle.js';
import type {ServerPacketRecoveryInspection} from '../server_packet_recovery/inspection_contract.js';
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {ServerPacketRecoveryInput,ServerPacketRecoveryOutcome,ServerPacketRecoveryBundle} from '../server_packet_recovery/contract.js';
import {prepareMetadataPacketRecoveryInput} from '../metadata_packet_retention/recovery_input.js';
import type {LocalMetadataPacketRecoveryInput,LocalMetadataPacketRecoveryOutcome,LocalMetadataPacketRetentionInput,LocalMetadataPacketRetentionBundle} from '../metadata_packet_retention/contract.js';
import type {LocalMetadataReceiptContainmentInput,LocalMetadataReceiptContainmentRead} from '../metadata_receipt_containment/contract.js';
import {LocalMetadataReferenceWork} from '../selected_local_metadata_assets/room_work.js';
import type {LocalMetadataReferenceBundle,LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import {detachLocalMetadataReferenceBundle,readLocalMetadataReferenceClaims} from '../selected_local_metadata_assets/portable_bundle.js';
import type {LocalMetadataAssetAvailabilityBundle} from '../selected_local_metadata_assets/availability_contract.js';
import {localMetadataAvailabilityHost,type LocalMetadataAssetAvailabilityHost} from '../selected_local_metadata_assets/availability_host.js';
import {sharedRelayAssetReadPort,type SharedRelayAssets} from '../relay/assets.js';
import type {LocalMetadataMaterializationOptions,LocalMetadataMaterializationOutcome} from '../selected_local_metadata_assets/materialization_contract.js';
import type {LocalMetadataMaterializedBundle,LocalMetadataMaterializedInspection} from '../selected_local_metadata_assets/materialization_contract.js';
import {detachLocalMetadataMaterializedBundle,localMetadataMaterializationLimits} from '../selected_local_metadata_assets/materialized_bundle.js';
import type {LocalMetadataRecoverableOutcome,LocalMetadataRecoverableBundle,LocalMetadataRecoverableInspection} from '../selected_local_metadata_assets/recoverable_contract.js';
import {detachLocalMetadataRecoverableBundle} from '../selected_local_metadata_assets/recoverable_bundle.js';
import {prepareLocalMetadataRecoveryBytesInput} from '../selected_local_metadata_assets/recovery_bytes_input.js';
import {detachLocalMetadataRecoveryBytesBundle} from '../selected_local_metadata_assets/recovery_bytes_bundle.js';
import type {LocalMetadataRecoveryBytesInput,LocalMetadataRecoveryBytesOutcome,LocalMetadataRecoveryBytesBundle,LocalMetadataRecoveryBytesInspection} from '../selected_local_metadata_assets/recovery_bytes_contract.js';
import {prepareLocalMetadataReconciliationInput} from '../selected_local_metadata_assets/reconciliation_input.js';
import type {LocalMetadataReconciliationInput,LocalMetadataReconciliationRead} from '../selected_local_metadata_assets/reconciliation_contract.js';
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
 /** Same-cut reconciliation reads actual local review affiliation and all
  * source metadata queues. Original unbound diagnostics remain unchanged. */
 captureReconciliation(provided:LocalMetadataReconciliationInput):Promise<LocalMetadataReconciliationRead>{
  let input!:ReturnType<typeof prepareLocalMetadataReconciliationInput>,result:LocalMetadataReconciliationRead|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.reconcile(input,this.#snapshot);this.#current();},()=>{input=prepareLocalMetadataReconciliationInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Read all original accepted metadata facts against the genuine current server.
  * This cannot install ACKs, settle offline intent, change roles or activate. */
 captureReceiptContainment(provided:LocalMetadataReceiptContainmentInput):Promise<LocalMetadataReceiptContainmentRead>{
  let input!:ReturnType<typeof prepareLocalMetadataReconciliationInput>,result:LocalMetadataReceiptContainmentRead|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.containReceipts(input,this.#snapshot);this.#current();},()=>{input=prepareLocalMetadataReconciliationInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Preserve all first server bodies and exact local metadata variants at the
  * same held cut. Expanded Native source/provider closure remains explicit. */
 capturePacketRetention(provided:LocalMetadataPacketRetentionInput):Promise<LocalMetadataPacketRetentionBundle>{
  let input!:ReturnType<typeof prepareLocalMetadataReconciliationInput>,result:LocalMetadataPacketRetentionBundle|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.retainPackets(input,this.#snapshot);this.#current();},()=>{input=prepareLocalMetadataReconciliationInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Additional exact first-server/local packet bodies and complete resolved
  * raster bytes, with genuine selected Native server/inventory files. This
  * preserves Pending work and never installs ACKs or a serving role. */
 capturePacketRecovery(provided:LocalMetadataPacketRecoveryInput):Promise<LocalMetadataPacketRecoveryOutcome>{
  let input!:ReturnType<typeof prepareMetadataPacketRecoveryInput>,result:LocalMetadataPacketRecoveryOutcome|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.packetRecovery(input,this.#snapshot);this.#current();},()=>{input=prepareMetadataPacketRecoveryInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Additional complete server Native knowledge, preserving the original
  * client-only Pending diagnostics. No client heads, queues or ACKs advance. */
 captureServerPacketRecovery(provided:ServerPacketRecoveryInput):Promise<ServerPacketRecoveryOutcome>{
  let input!:ReturnType<typeof prepareMetadataPacketRecoveryInput>,result:ServerPacketRecoveryOutcome|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.serverPacketRecovery(input,this.#snapshot);this.#current();},()=>{input=prepareMetadataPacketRecoveryInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Separately retain verified available sources while preserving every literal
  * original Pending/download/receipt fact. The task is reserved before inputs. */
 captureResolvedServerPacketRecovery(provided:ServerPacketRecoveryInput):Promise<ResolvedServerPacketRecoveryOutcome>{
  let input!:ReturnType<typeof prepareMetadataPacketRecoveryInput>,result:ResolvedServerPacketRecoveryOutcome|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.resolvedServerPacketRecovery(input,this.#snapshot);this.#current();},()=>{input=prepareMetadataPacketRecoveryInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Retain complete packet/server/raster bytes and current reconciliation in
  * one genuine reservation. Byte and current Pending meanings stay separate;
  * this never returns a writer, acknowledgement or activation capability. */
 captureReconciledServerPacketRecovery(provided:ServerPacketRecoveryInput):Promise<ReconciledServerPacketRecoveryCapture>{
  let input!:ReturnType<typeof prepareMetadataPacketRecoveryInput>,result:ReconciledServerPacketRecoveryCapture|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.reconciledServerPacketRecovery(input,this.#snapshot);this.#current();},()=>{input=prepareMetadataPacketRecoveryInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Fresh complete reference/provider requirements join current Native and
  * original outbox facts; archived/local byte retention never supplies ACKs. */
 captureServerPacketReconciliation(provided:LocalMetadataReconciliationInput):Promise<ServerPacketReconciliationRead>{
  let input!:ReturnType<typeof prepareLocalMetadataReconciliationInput>,result:ServerPacketReconciliationRead|undefined;
  return this.#captureReferenceOperation(async work=>{this.#current();if(!this.#snapshot)throw fail();result=await work.serverPacketReconciliation(input,this.#snapshot);this.#current();},()=>{input=prepareLocalMetadataReconciliationInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Source-owned immutable raster bytes for the complete Native/provider and
  * whole-upload union. Transport reads neither mutate caches nor ACK queues. */
 captureMaterializedAssets(host:LocalMetadataAssetAvailabilityHost,transport:SharedRelayAssets,provided:LocalMetadataMaterializationOptions={}):Promise<LocalMetadataMaterializationOutcome>{
  let options:LocalMetadataMaterializationOptions|undefined,result:LocalMetadataMaterializationOutcome|undefined;
  return this.#captureReferenceOperation(async work=>{result=await work.materialize(host,transport,options!);this.#current();},()=>{localMetadataAvailabilityHost(host);sharedRelayAssetReadPort(transport);options={limits:localMetadataMaterializationLimits(provided)};}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Complete recoverable V2 union. Server-missing local uploads remain
  * unacknowledged; the original V1 capture and availability scopes are intact. */
 captureRecoverableAssets(host:LocalMetadataAssetAvailabilityHost,transport:SharedRelayAssets,provided:LocalMetadataMaterializationOptions={}):Promise<LocalMetadataRecoverableOutcome>{
  let options:LocalMetadataMaterializationOptions|undefined,result:LocalMetadataRecoverableOutcome|undefined;
  return this.#captureReferenceOperation(async work=>{result=await work.recoverAssets(host,transport,options!);this.#current();},()=>{localMetadataAvailabilityHost(host);sharedRelayAssetReadPort(transport);options={limits:localMetadataMaterializationLimits(provided)};}).then(()=>{if(!result)throw fail();return result;});
 }
 /** One finite source-owned capture of V2 client/metadata/assets and the
  * exact live-controller-selected server and participant inventory files. */
 captureRecoveryBytes(provided:LocalMetadataRecoveryBytesInput):Promise<LocalMetadataRecoveryBytesOutcome>{
  let input!:ReturnType<typeof prepareLocalMetadataRecoveryBytesInput>,result:LocalMetadataRecoveryBytesOutcome|undefined;
  return this.#captureReferenceOperation(async work=>{result=await work.recoveryBytes(input.host,input.transport,input.selected,input.options);this.#current();},()=>{input=prepareLocalMetadataRecoveryBytesInput(provided);}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Native verification of the literal PORTABLE cuts, even if the actual
  * stored/live room is newer. This returns immutable dependency DATA only:
  * it neither proves current asset availability nor supplies serving rights.
  * A hash or caller-edited Ready bit cannot replace native recomputation. */
 inspectReferences(provided:LocalMetadataReferenceBundle):Promise<LocalMetadataReferenceCut>{
  let bundle!:LocalMetadataReferenceBundle;
  return this.#inspectReferenceOperation(()=>bundle,async(_,actual)=>actual,()=>{bundle=detachLocalMetadataReferenceBundle(provided);});
 }
 /** Re-admit literal history, exact metadata dependencies, both whole-upload
  * roles and all raster bytes offline without writing either journal. The
  * historical provider observation does not grant fresh mapping/serve rights. */
 inspectMaterializedAssets(provided:LocalMetadataMaterializedBundle,options:LocalMetadataMaterializationOptions={}):Promise<LocalMetadataMaterializedInspection>{
  let bundle!:LocalMetadataMaterializedBundle,limits!:LocalMetadataMaterializationOptions;
  return this.#inspectReferenceOperation(()=>bundle.references,async(work,actual)=>work.inspectMaterialized(bundle,actual,limits),()=>{bundle=detachLocalMetadataMaterializedBundle(provided);limits={limits:localMetadataMaterializationLimits(options)};});
 }
 /** Re-admit V2 bytes without upgrading recorded Pending uploads to success.
  * No current provider grant or queue writer is returned. */
 inspectRecoverableAssets(provided:LocalMetadataRecoverableBundle,options:LocalMetadataMaterializationOptions={}):Promise<LocalMetadataRecoverableInspection>{
  let bundle!:LocalMetadataRecoverableBundle,limits!:LocalMetadataMaterializationOptions;
  return this.#inspectReferenceOperation(()=>bundle.references,async(work,actual)=>work.inspectRecoverable(bundle,actual,limits),()=>{bundle=detachLocalMetadataRecoverableBundle(provided);limits={limits:localMetadataMaterializationLimits(options)};});
 }
 /** Inspect exact archived server/inventory selections with the Native client
  * cut. Old selected files never become a live controller or serving role. */
 inspectRecoveryBytes(provided:LocalMetadataRecoveryBytesBundle,options:LocalMetadataMaterializationOptions={}):Promise<LocalMetadataRecoveryBytesInspection>{
  let bundle!:LocalMetadataRecoveryBytesBundle,limits!:LocalMetadataMaterializationOptions;
  return this.#inspectReferenceOperation(()=>bundle.recoverable.references,async(work,actual)=>work.inspectRecoveryBytes(bundle,actual,limits),()=>{bundle=detachLocalMetadataRecoveryBytesBundle(provided);limits={limits:localMetadataMaterializationLimits(options)};});
 }
 /** Verify saved Native sources and exact packet/raster bytes while the actual
  * metadata owner remains held. Historical reports stay DATA; no saved token,
  * permission, pending receipt or ACK becomes current authority. */
 inspectServerPacketRecovery(provided:ServerPacketRecoveryBundle,host:SharedServerLogGenerationRecoveryHost,options:LocalMetadataMaterializationOptions={}):Promise<ServerPacketRecoveryInspection>{
  let bundle!:ServerPacketRecoveryBundle,limits!:LocalMetadataMaterializationOptions;
  return this.#inspectReferenceOperation(()=>bundle.packets.references,async(work,actual,portable)=>work.inspectServerPacketRecovery(bundle,actual,portable,host,limits),()=>{generationRecoveryHostPort(host);bundle=detachServerPacketRecoveryBundle(provided);limits={limits:localMetadataMaterializationLimits(options)};});
 }
 /** The original envelope and new resolution are both recomputed. Historical
  * availability never becomes current client or outbox reconciliation. */
 inspectResolvedServerPacketRecovery(provided:ResolvedServerPacketRecoveryBundle,host:SharedServerLogGenerationRecoveryHost,options:LocalMetadataMaterializationOptions={}):Promise<ResolvedServerPacketRecoveryInspection>{
  let bundle!:ResolvedServerPacketRecoveryBundle,limits!:LocalMetadataMaterializationOptions;
  return this.#inspectReferenceOperation(()=>bundle.original.packets.references,async(work,actual,portable)=>work.inspectResolvedServerPacketRecovery(bundle,actual,portable,host,limits),()=>{generationRecoveryHostPort(host);bundle=detachResolvedServerPacketRecoveryBundle(provided);limits={limits:localMetadataMaterializationLimits(options)};});
 }
 #inspectReferenceOperation<T>(selected:()=>LocalMetadataReferenceBundle,visit:(work:LocalMetadataReferenceWork,actual:LocalMetadataReferenceCut,portable:LocalMetadataDeliverySnapshot)=>Promise<T>,prepare:()=>void):Promise<T>{
  return this.#captureOperation(async()=>{
   let result:{value:T}|undefined;const bundle=selected();
   await this.#parent.inspect(async integrity=>{result={value:await this.#withReferenceInspection(bundle,integrity,visit)};
   });if(!result)throw fail();return result.value;
  },prepare);
 }
 #activationSourceGuard():()=>void {
  this.#current();const sources=this.#parent.sources,stamps=new Map(sources.map(row=>[row.source.core,coreReadStamp(row.source.core)]));
  return()=>{this.#current();for(const row of sources){const before=stamps.get(row.source.core)!,now=coreReadStamp(row.source.core);if(before.document!==now.document||before.review!==now.review)throw activationIntentFailure('activation_intent_stale');}};
 }
 /** Capture/retain under one genuine reservation. Host provisioning and choice
  * persistence happen before the absent-only intent write; no commit occurs. */
 prepareNativeActivation(provided:PrepareRoomNativeActivationInput):Promise<RoomActivationIntentChoice>{
  let input!:ReturnType<typeof prepareMetadataPacketRecoveryInput>,policy!:RoomActivationPreparationPolicy,result:RoomActivationIntentChoice|undefined;
  return this.#captureReferenceOperation(async work=>{const check=this.#activationSourceGuard();if(!this.#snapshot)throw fail();const capture=await work.reconciledServerPacketRecovery(input,this.#snapshot);check();const integrity=work.integrityOptions();result=await prepareHeldRoomActivation(capture,policy,{wasm:integrity.wasm,checkAuthority:check,...(integrity.signal?{signal:integrity.signal}:{})},check);check();},()=>{const r=fields(provided,['database','recovery','selectActivation','retainChoice']);if(typeof r['database']!=='string'||typeof r['selectActivation']!=='function'||typeof r['retainChoice']!=='function')throw activationIntentFailure('activation_intent_policy');roomActivationDatabase(r['database']);input=prepareMetadataPacketRecoveryInput(r['recovery'] as ServerPacketRecoveryInput);policy={database:roomActivationDatabase(r['database']),selectActivation:r['selectActivation'] as RoomActivationPreparationPolicy['selectActivation'],retainChoice:r['retainChoice'] as RoomActivationPreparationPolicy['retainChoice']};}).then(()=>{if(!result)throw fail();return result;});
 }
 /** Existing-only DATA read under a fresh genuine owner. A saved receipt is
  * never a serving grant and this method makes no activation request. */
 readNativeActivationIntent(provided:RoomActivationIntentChoice):Promise<RoomActivationRetainedIntent>{
  let expected!:RoomActivationIntentChoice;return this.#captureOperation(async()=>{let result:RoomActivationRetainedIntent|undefined;await this.#parent.inspect(async integrity=>{const check=this.#activationSourceGuard(),options={wasm:integrity.wasm,checkAuthority:check,signal:this.#parent.scope.signal};const retained=await readHeldRoomActivation(expected,options);check();await this.#withReferenceInspection(retained.capture.recovery.bundle.original.packets.references,options,async()=>{result=retained;});check();});if(!result)throw fail();return result;},()=>{expected=roomActivationIntentChoice(provided);});
 }
 /** Reopen full intent, re-inspect real Native dependencies and exact current
  * source, then record uncertainty BEFORE the separately authenticated commit. */
 commitNativeActivation(provided:CommitRoomNativeActivationInput):Promise<RoomActivationCommitResult>{
  let input!:CommitRoomNativeActivationInput;return this.#captureOperation(async()=>{let result:RoomActivationCommitResult|undefined;const waits=new NativeReconstructionWaits(this.#current,[this.#parent.scope.signal]),cancel=()=>waits.close();this.#cancels.add(cancel);try{await this.#parent.inspect(async integrity=>{
   const check=this.#activationSourceGuard(),options={wasm:integrity.wasm,checkAuthority:check,signal:waits.signal};
   const inspect=async(capture:ReconciledServerPacketRecoveryCapture)=>{check();const bundle=capture.recovery.bundle,metadata=bundle.original.packets.references.parent;const portable=await readMetadataBundle(this.#parent,metadata,this.#choice,check,options);check();const fresh=await this.#store.readFresh();check();if(metadataJson(fresh)!==metadataJson(portable))throw activationIntentFailure('activation_intent_stale');await this.#parent.assertExact(metadata.parent);check();
    await this.#withReferenceInspection(bundle.original.packets.references,options,async(work,actual,point)=>{const inspected=await work.inspectResolvedServerPacketRecovery(bundle,actual,point,input.inspection,input.limits?{limits:input.limits}:{});check();if(inspected.rasters.kind!=='retained'||inspected.resolution.outcome.kind!=='ready')throw activationIntentFailure('activation_intent_incomplete');});check();
   };
   result=await commitHeldRoomActivation(input,options,check,inspect);check();
  });if(!result)throw fail();return result;}finally{this.#cancels.delete(cancel);waits.close();}},()=>{const r=fields(provided,['expected','activation','inspection','approve'],['limits']);const expected=roomActivationIntentChoice(r['expected']);nativeActivationHostPort(r['activation'] as CommitRoomNativeActivationInput['activation']);generationRecoveryHostPort(r['inspection'] as SharedServerLogGenerationRecoveryHost);if(typeof r['approve']!=='function')throw activationIntentFailure('activation_intent_policy');input={expected,activation:r['activation'] as CommitRoomNativeActivationInput['activation'],inspection:r['inspection'] as SharedServerLogGenerationRecoveryHost,approve:r['approve'] as CommitRoomNativeActivationInput['approve'],limits:localMetadataMaterializationLimits(r['limits']===undefined?{}:{limits:r['limits'] as NonNullable<CommitRoomNativeActivationInput['limits']>})};});
 }
 #withReferenceInspection<T>(bundle:LocalMetadataReferenceBundle,integrity:SharedArchiveIntegrityOptions,visit:(work:LocalMetadataReferenceWork,actual:LocalMetadataReferenceCut,portable:LocalMetadataDeliverySnapshot)=>Promise<T>):Promise<T>{return(async()=>{
    await this.#serial;this.#current();const stored=await this.#store.readFresh();this.#current();
    const options={wasm:integrity.wasm,checkAuthority:this.#current,signal:this.#parent.scope.signal};
    const claims=await readLocalMetadataReferenceClaims(bundle,options,this.#current);this.#current();
    const portable=await readMetadataBundle(this.#parent,bundle.parent,this.#choice,this.#current,options);this.#current();
    await inspectMetadataResume(this.#parent,bundle.parent,portable,stored,this.#current);this.#current();
    const middle=await metadataSnapshot({before:portable.before,current:claims.stored},this.#choice);this.#current();
    const work=new LocalMetadataReferenceWork(this.#parent.scope,options,this.#current);this.#referenceWork=work;try{await work.begin(bundle.parent.parent,middle);this.#current();
    const actual=await work.readPortable(bundle.parent,portable);this.#current();
    if(metadataJson(actual)!==claims.text)throw fail('local_metadata_delivery_stale');this.#current();const value=await visit(work,actual,portable);this.#current();
    if(!equal(await this.#store.readFresh(),stored))throw fail('local_metadata_delivery_stale');this.#current();return value;
    }finally{work.close();if(this.#referenceWork===work)this.#referenceWork=undefined;}
 })();}
 #stop():void{this.#closing=true;this.#referenceWork?.close();for(const cancel of this.#cancels)cancel();this.#cancels.clear();for(const context of this.#contexts.keys())void context.close().catch(()=>{});}
 /** Retire only temporary SDK children after actual work drains. The metadata
  * journal, initial intent, native histories and parent binding are retained. */
 close():Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#stop();const opening=this.#opening,capture=this.#capturing;
  this.#ending=(async()=>{await opening?.catch(()=>{});while(this.#preparing.size)await Promise.all([...this.#preparing.values()].map(job=>job.catch(()=>{})));const results=await Promise.allSettled([...this.#contexts.keys()].map(context=>context.close()));const errors=results.filter(row=>row.status==='rejected').map(row=>(row as PromiseRejectedResult).reason);await this.#serial;await capture?.catch(()=>{});if(errors.length)throw new AggregateError(errors,'Local metadata delivery did not drain');for(const child of this.#children.values()){await child.revisions?.discardAndClose();await child.suggestions?.discardAndClose();await child.versions?.discardAndClose();}await this.#store.close();this.#parent.release();this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;
 }
}
