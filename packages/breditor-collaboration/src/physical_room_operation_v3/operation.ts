/** Restartable seven-family client recovery. Catalog files, actual child stores,
 * fresh host policy and one common native barrier are all required. This is not
 * provider reconciliation, authenticated room activation or a server grant. */
import {PhysicalRoomCatalogV3,transferPhysicalCatalogV3,type PhysicalCatalogV3Custody} from '../physical_room_catalog_v3/catalog.js';
import {PhysicalRoomCatalogV3Archive,physicalCatalogV3Archive as archive} from '../physical_room_catalog_v3/archive.js';
import {readPhysicalCatalogV3Database} from '../physical_room_catalog_v3/database.js';
import {physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import {RecoveryOpeningCustody,recoveryOpeningContext,drainFailedRecoveryOpenings} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {prepareCompleteOperationParticipants,type CompleteOperationParticipant} from '../complete_operation_cohort/cohort.js';
import type {OperationalCohortReservation} from '../operation_cohort/cohort.js';
import {PhysicalOperationV3IntentStore} from './storage.js';
import {PhysicalOperationV3Cancellation} from './storage_cancellation.js';
import {preflightPhysicalOperationV3} from './preflight.js';
import {physicalOperationV3PolicyFields as fields,snapshotPhysicalOperationV3Policy as snapshot} from './policy_snapshot.js';
import {initialPhysicalOperationV3Record,type PhysicalOperationV3Record} from './record.js';
import {physicalOperationV3LegacyPolicies,openPhysicalOperationV3Child,closePhysicalOperationV3Child,physicalOperationV3Present,type PhysicalOperationV3Child} from './child.js';
import type {MixedCatalogStagePolicy} from '../mixed_catalog_stage/prepare.js';
import type {PhysicalOperationV3BeginOptions,PhysicalOperationV3ResumeOptions,PhysicalOperationV3OpenOptions,PhysicalOperationV3Progress,PhysicalOperationV3Parts} from './contract.js';
import {physicalOperationV3Failure as fail,physicalOperationV3Known as known,physicalOperationV3Database as dbName} from './policy.js';
import {borrowCompleteNativeRead} from '../complete_operation_cohort/native_read.js';
import {inspectPhysicalOperationV3Native} from './native_read.js';
import type {PhysicalOperationV3NativeRead} from './native_read_contract.js';
import {readPhysicalOperationV3History} from './history_read.js';
import type {PhysicalOperationV3HistoryReadOptions,PhysicalOperationV3HistoryRead} from './history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {readPhysicalOperationV3Assets} from './asset_read.js';
import type {PhysicalAssetReadOptions,PhysicalAssetReadScope} from './asset_read_contract.js';
const key=Object.freeze({});
const errors={policy:()=>fail('physical_operation_v3_policy'),busy:()=>fail('physical_operation_v3_in_use'),storage:()=>fail()};
interface State{
 readonly options:PhysicalOperationV3OpenOptions;readonly database:string;readonly held:PhysicalCatalogV3Custody;
 readonly intent:PhysicalOperationV3IntentStore;readonly lease:RecoveryLease;readonly cancellation:PhysicalOperationV3Cancellation;
 readonly guard:()=>void;readonly local:()=>void;readonly readCurrent:()=>void;readonly children:PhysicalOperationV3Child[];
 readonly life:{closed:boolean;closing:boolean;changed:boolean;released:boolean};
 readonly policies:readonly MixedCatalogStagePolicy[];record:PhysicalOperationV3Record;pending?:PhysicalOperationV3Record;archiveDisposed:boolean;
}
/** Type-only internal custody; a detached report never creates this state. */
export type PhysicalOperationV3Custody=State;
let withAssets:<T>(owner:PhysicalRoomClientOperationV3,options:PhysicalAssetReadOptions,visit:(scope:PhysicalAssetReadScope)=>Promise<T>)=>Promise<T>;
/** Internal actual-root borrow. A report/DTO cannot manufacture this scope. */
export const withPhysicalOperationV3Assets=<T>(owner:PhysicalRoomClientOperationV3,options:PhysicalAssetReadOptions,visit:(scope:PhysicalAssetReadScope)=>Promise<T>):Promise<T>=>withAssets(owner,options,visit);
/** Opaque wasm/catalog handles stay genuine; every ordinary policy value is
 * detached synchronously, before callbacks can alter a later client choice. */
function options(input:PhysicalOperationV3BeginOptions|PhysicalOperationV3ResumeOptions,begin:boolean){
 const raw=fields(input,['wasm','checkAuthority','database','expected','participants',begin?'catalog':'catalogDatabase'],['signal','graphPolicies','localPolicies']);
 if(typeof raw['checkAuthority']!=='function')throw fail('physical_operation_v3_policy');
 const{wasm,catalog,...ordinary}=raw,selected=snapshot(ordinary),result={...selected,wasm,expected:physicalCatalogSelection(selected['expected'])} as unknown as PhysicalOperationV3OpenOptions;
 return{options:result,catalog:catalog as PhysicalRoomCatalogV3|undefined,catalogDatabase:begin?undefined:dbName(selected['catalogDatabase'])};
}
export class PhysicalRoomClientOperationV3{
 readonly #s:State;readonly #rollback=new RecoveryCleanupScope(()=>fail());#exposed=false;#busy=false;#running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:boolean|undefined;
 private constructor(token:object,state:State){if(token!==key)throw fail('physical_operation_v3_closed');this.#s=state;Object.freeze(this);}
 static{withAssets=(owner,options,visit)=>{
  if(!owner||typeof owner!=='object'||!(#s in owner))return Promise.reject(fail('physical_operation_v3_policy'));
  return owner.#run(()=>readPhysicalOperationV3Assets(owner.#s,()=>{if(!owner.#exposed||!owner.#busy)throw fail('physical_operation_v3_closed');},()=>owner.#retained(),options,visit),error=>error instanceof Error?error:known(error));
 };}
 static begin(input:PhysicalOperationV3BeginOptions):Promise<PhysicalRoomClientOperationV3>{return PhysicalRoomClientOperationV3.#open(input,true);}
 static resume(input:PhysicalOperationV3ResumeOptions):Promise<PhysicalRoomClientOperationV3>{return PhysicalRoomClientOperationV3.#open(input,false);}
 static async #open(input:PhysicalOperationV3BeginOptions|PhysicalOperationV3ResumeOptions,begin:boolean):Promise<PhysicalRoomClientOperationV3>{
  const selected=options(input,begin),chosen=selected.options,database=dbName(chosen.database),factory=recoveryOpeningContext(),locks=navigator.locks,life={closed:false,closing:false,changed:false,released:false};
  let cancellation:PhysicalOperationV3Cancellation|undefined,intent:PhysicalOperationV3IntentStore|undefined,lease:RecoveryLease|undefined,owned=false,held:PhysicalCatalogV3Custody|undefined,catalog=selected.catalog,opening:RecoveryOpeningCustody|undefined;
  try{
   opening=await RecoveryOpeningCustody.reserve(factory,[database],async()=>{
    const actions=[()=>intent?.close(),()=>lease?.close(),()=>{if(owned&&held){archive.dispose.call(held.archive);held.db.close();return held.lease.close();}return undefined;},()=>{if(!begin&&!owned)return catalog?.close();return undefined;}];
    const results=await Promise.allSettled(actions.map(action=>Promise.resolve().then(action)));if(results.some(row=>row.status==='rejected'))throw fail();cancellation?.close();
   },errors);
   cancellation=new PhysicalOperationV3Cancellation(chosen.signal);const actualCancellation=cancellation,authority=participantAuthority(chosen.checkAuthority),readCurrent=()=>{if(life.closed||life.closing||life.changed)throw fail('physical_operation_v3_closed');if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('physical_operation_v3_policy');},local=()=>{readCurrent();actualCancellation.check();},guard=()=>{local();authority();local();};guard();
   const context=prepareArchiveIntegrity({wasm:chosen.wasm,checkAuthority:guard}),read={wasm:context.wasm,checkAuthority:guard,...(chosen.graphPolicies?{graphPolicies:chosen.graphPolicies}:{}),...(chosen.localPolicies?{localPolicies:chosen.localPolicies}:{})};guard();
   if(!begin){catalog=await PhysicalRoomCatalogV3.resume({...read,database:selected.catalogDatabase!,expected:chosen.expected});guard();}
   const result=await transferPhysicalCatalogV3(catalog!,source=>{
    held=source;if(source.factory!==factory||source.locks!==locks||JSON.stringify(chosen.expected)!==JSON.stringify(source.state.selection)||!begin&&source.database!==selected.catalogDatabase)throw fail('physical_operation_v3_diverged');
    // The source is genuinely reserved; all structural names and writer/actor
    // aliases are checked before any participant factory or authority executes.
    const prepared=preflightPhysicalOperationV3(chosen.participants,source.state,database,source.database),initial=initialPhysicalOperationV3Record(database,{catalogDatabase:source.database,manifest:source.state.manifest,selection:source.state.selection},prepared.map(row=>row.target));
    return async()=>{
     guard();lease=await RecoveryLease.acquire(JSON.stringify(database));guard();intent=new PhysicalOperationV3IntentStore(factory,database,guard,chosen.signal);
     if(begin){for(const row of prepared)for(const ns of row.target.namespaces)if(await physicalOperationV3Present(ns.database,guard))throw fail('physical_operation_v3_exists');await intent.create(initial);}else await intent.open();guard();
     const record=await intent.read(initial);guard();const children=prepared.map(selected=>({selected})) as PhysicalOperationV3Child[],policies=await physicalOperationV3LegacyPolicies(children,source.state,[database,source.database],guard);guard();
     const state:State={options:{...chosen,wasm:context.wasm},database,held:source,intent,lease,cancellation:actualCancellation,guard,local,readCurrent,children,policies,life,record,archiveDisposed:false},owner=new PhysicalRoomClientOperationV3(key,state);
     return{value:owner,prepareCommit(){guard();},commit(){local();source.db.onversionchange=()=>{life.changed=true;source.db.close();};owned=true;owner.#exposed=true;}};
    };
   });opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw known(error);}
 }
 #guard=()=>{if(!this.#exposed)throw fail('physical_operation_v3_closed');this.#s.guard();};
 #run<T>(work:()=>Promise<T>,translate:(error:unknown)=>Error=known):Promise<T>{if(!this.#exposed||this.#s.life.closed||this.#s.life.closing||this.#s.life.released)return Promise.reject(fail('physical_operation_v3_closed'));if(this.#busy)return Promise.reject(fail('physical_operation_v3_in_use'));this.#busy=true;let done!:()=>void;this.#running=new Promise<void>(resolve=>{done=resolve;});let task:Promise<T>;try{task=work();}catch(error){task=Promise.reject(error);}return task.catch(error=>{throw translate(error);}).finally(()=>{this.#busy=false;this.#running=undefined;done();});}
 database():string{return this.#s.database;}
 selection(){return this.#s.held.state.selection;}
 metadata(){return this.#s.held.state.metadata;}
 async #retained():Promise<void>{
  const s=this.#s;this.#guard();const actual=await s.intent.read(s.record);this.#guard();const encoded=JSON.stringify(actual);
  if(encoded===JSON.stringify(s.record))delete s.pending;else if(s.pending&&encoded===JSON.stringify(s.pending)){s.record=actual;delete s.pending;}else throw fail('physical_operation_v3_diverged');
  const saved=await readPhysicalCatalogV3Database(s.held.db,this.#guard,s.held.state.manifest);this.#guard();const temporary=await archive.read.call(PhysicalRoomCatalogV3Archive,saved.record.manifest,saved.files,s.held.state.selection,{wasm:s.options.wasm,checkAuthority:this.#guard,...(s.options.graphPolicies?{graphPolicies:s.options.graphPolicies}:{}),...(s.options.localPolicies?{localPolicies:s.options.localPolicies}:{})});
  try{this.#guard();}finally{archive.dispose.call(temporary);}this.#guard();
 }
 async #update(next:PhysicalOperationV3Record):Promise<void>{const s=this.#s;if(s.pending)await this.#retained();this.#guard();s.pending=next;await s.intent.advance(s.record,next);this.#guard();s.record=next;delete s.pending;}
 #progress():PhysicalOperationV3Progress{const s=this.#s,selected=new Set(s.record.participants.map(row=>row.id));return Object.freeze({phase:s.record.phase,participants:Object.freeze(s.record.participants.map(row=>Object.freeze({...row,namespaces:Object.freeze(row.namespaces.map(ns=>Object.freeze({...ns})))}))),unreconciledParticipants:Object.freeze(s.held.state.metadata.participants.filter(row=>!selected.has(row.id)).map(row=>row.id))});}
 progress():Promise<PhysicalOperationV3Progress>{return this.#run(async()=>{await this.#retained();return this.#progress();});}
 finish():Promise<PhysicalOperationV3Progress>{return this.#run(async()=>{
  const s=this.#s;await this.#rollback.drain();await this.#retained();
  for(const[index,child]of s.children.entries()){
   let current=s.record.participants[index]!;if(current.state==='reserved'){
    for(const ns of current.namespaces)if(await physicalOperationV3Present(ns.database,this.#guard))throw fail('physical_operation_v3_exists');
    await this.#update({...s.record,participants:s.record.participants.map((row,i)=>i===index?{...row,state:'started'}:row)});current=s.record.participants[index]!;
   }
   const cleanup=this.#rollback.retain(()=>drainFailedRecoveryOpenings(s.held.factory,child.selected.target.namespaces.map(ns=>ns.database),()=>fail()));
   try{await openPhysicalOperationV3Child(child,s.held.state,s.policies,current.state==='complete',this.#guard,this.#rollback);this.#guard();cleanup.complete();}catch(error){await cleanup.rollback();throw error;}
   if(current.state!=='complete')await this.#update({...s.record,participants:s.record.participants.map((row,i)=>i===index?{...row,state:'complete'}:row)});
  }
  await this.#retained();if(s.record.phase==='prepared')await this.#update({...s.record,phase:'operational'});await this.#verify();return this.#progress();
 });}
 async #verify():Promise<void>{await this.#retained();const s=this.#s;if(s.record.phase!=='operational'||s.children.some(child=>!child.live))throw fail('physical_operation_v3_restore');for(const child of s.children){await child.live!.operation.check();this.#guard();}}
 check():Promise<void>{return this.#run(()=>this.#verify());}
 /** Inspect currently held native prefixes without initiating handoff, releasing
  * any coordinator lease, writing a marker, starting delivery or binding a local
  * review lane. Historical copies and missing registrations remain explicit. */
 readNative():Promise<PhysicalOperationV3NativeRead>{return this.#run(async()=>{
  await this.#rollback.drain();await this.#verify();const s=this.#s;
  const read=borrowCompleteNativeRead(s.children.map(child=>child.live!)),cleanup=this.#rollback.retain(()=>read.close());let complete=false;
  try{await read.prepare();await this.#retained();await read.verify();this.#guard();
   const result=inspectPhysicalOperationV3Native(s.held.state,s.children.map(child=>child.selected),read);
   this.#guard();read.checkCurrent();await read.close();cleanup.complete();complete=true;return result;
  }finally{if(!complete)await cleanup.rollback();}
 });}
 /** Fresh protected history/custody inspection after an old job ends. Existing
  * readNative/handoff defaults keep their original grant and signal contracts. */
 readHistory<P extends SharedSelectionPolicy>(input:PhysicalOperationV3HistoryReadOptions<P>):Promise<PhysicalOperationV3HistoryRead>{return this.#run(()=>readPhysicalOperationV3History(this.#s,()=>{if(!this.#exposed||!this.#busy)throw fail('physical_operation_v3_closed');},input));}
 #disposeArchive():void{const s=this.#s;if(!s.archiveDisposed){archive.dispose.call(s.held.archive);s.archiveDisposed=true;}}
 /** Reserve this actual job alongside every real child. Temporary native reader
  * cleanup precedes the last client barriers. consume is private flag writes
  * only; no native destructor or host callback can lose returned children. */
 #reservation():OperationalCohortReservation<never>{const s=this.#s;let finished=false;const current=()=>{if(finished)throw fail('physical_operation_v3_closed');s.local();};return{states:[],assetStores:[],verify:()=>this.#retained(),markReleased:current,checkBindings:current,checkCurrent:current,disposeAuxiliaries:()=>{current();this.#disposeArchive();},checkManaged:current,consume:()=>{s.life.closed=true;this.#exposed=false;finished=true;},abandon:()=>{finished=true;}};}
 intoParts():Promise<PhysicalOperationV3Parts>{return this.#run(async()=>{
  await this.#verify();const s=this.#s,rows=s.children.map(child=>child.live!) as CompleteOperationParticipant[],parent=this.#reservation(),handoff=await prepareCompleteOperationParticipants(rows,[s.held.db],[s.held.lease,s.lease],async()=>{await this.#retained();s.life.released=true;await s.intent.close();this.#guard();},this.#guard,()=>{s.life.released=true;},parent);
  try{return handoff.commit();}finally{handoff.abandon();if(s.life.closed)s.cancellation.close();}
 });}
 close():Promise<void>{return this.#close(false);}
 discardAndClose():Promise<void>{return this.#close(true);}
 #close(discard:boolean):Promise<void>{const s=this.#s;if(s.life.closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===discard?this.#cleanup:Promise.reject(fail('physical_operation_v3_in_use'));s.life.closing=true;this.#cleanupMode=discard;this.#cleanup=this.#finishClose(discard).catch(error=>{throw known(error);}).finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;}
 async #finishClose(discard:boolean):Promise<void>{await this.#running;const s=this.#s;if(s.life.closed)return;await this.#rollback.drain();for(const child of [...s.children].reverse())await closePhysicalOperationV3Child(child,discard);await s.intent.close();this.#disposeArchive();s.held.db.close();await s.held.lease.close();await s.lease.close();s.cancellation.close();s.life.closed=true;this.#exposed=false;}
}
