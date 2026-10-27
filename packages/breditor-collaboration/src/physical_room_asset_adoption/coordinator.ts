/** Durable room-bound staging of explicit upload bases for all seven families.
 * Original sources stay held and unchanged during each operation. New stores
 * are exact selected clones only: no editor is returned and no room activates. */
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import {withPhysicalOperationV3Assets,withPhysicalOperationV3RecordCut,transferPhysicalOperationV3RetainedRoot,transferPhysicalOperationV3RetainedRootWithActors,PhysicalRoomClientOperationV3} from '../physical_room_operation_v3/operation.js';
import type {PhysicalAssetReadScope,PhysicalAssetReadOptions} from '../physical_room_operation_v3/asset_read_contract.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {RoomAssetAdoptionStore,sameAdoptionBytes,type AdoptionFiles} from './storage.js';
import {adoptionChoices,prepareAdoptionSelection,verifyAdoptionSelection,selectedAdoptionFile} from './selection.js';
import type {RoomAssetAdoptionOptions,RoomAssetAdoptionBeginOptions,RoomAssetAdoptionRecord,RoomAssetAdoptionTarget} from './contract.js';
import {database,fields,fail} from './policy.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import {approvalChoice} from '../physical_room_asset_approval/choice.js';
import {encodeRoomAssetApproval} from '../physical_room_asset_approval/archive.js';
import {retainRoomAssetApproval} from '../physical_room_asset_approval/retention.js';
import {decideRoomAssetApproval} from '../physical_room_asset_approval/decision.js';
import type {RoomAssetApprovalChoice,RoomAssetApprovalOptions,RoomAssetApprovalFile} from '../physical_room_asset_approval/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import {checkPhysicalRootActors} from '../physical_room_operation_v3/actor_routes.js';
import {RoomRunSuccessorRecipient} from '../native_room_execution_run/successor_recipient.js';
import {prepareSelectedAssetOwner,type RetainedSelectedAssetOwner,type PreparedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
const key=Object.freeze({}),errors={policy:()=>fail('asset_adoption_policy'),busy:()=>fail('asset_adoption_busy'),storage:()=>fail()};
const restore=RichAssetStore.restoreBackupHeld,open=RichAssetStore.openRetained,acquire=RichAssetStore.prototype.acquireRecoveryCustody,capture=RichAssetStore.prototype.captureBackup,list=RichAssetStore.prototype.list,closeStore=RichAssetStore.prototype.close,checkStore=RichAssetStore.prototype.checkOpen,checkCustody=RichAssetStoreCustody.prototype.check,closeCustody=RichAssetStoreCustody.prototype.close;
interface Target {readonly store:RichAssetStore;readonly custody:RichAssetStoreCustody}
interface Resources {store?:RoomAssetAdoptionStore;lease?:RecoveryLease;readonly targets:Map<string,Target>;readonly targetLeases:Map<string,RecoveryLease>}
/** SDK-private development input. Asset write permission has a distinct lifetime
 * from the finite read/approval job. Neither one grants server authorship. */
export interface SelectedRoomTransferOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends RoomAssetApprovalOptions<P>{readonly approvalDatabase:string;readonly checkAssetAuthority:()=>void}
const recipientApi={empty:RoomRunSuccessorRecipient.prototype.checkEmpty,stage:RoomRunSuccessorRecipient.prototype.stage,check:RoomRunSuccessorRecipient.prototype.checkStaged,activate:RoomRunSuccessorRecipient.prototype.activate,abandon:RoomRunSuccessorRecipient.prototype.abandon};
interface ActorTransfer{readonly actors:StoppedActorCohort;readonly recipient:RoomRunSuccessorRecipient;readonly prepareComplete:()=>Promise<void>}
let takeSelectedRoom:<P extends SharedSelectionPolicy>(stage:PhysicalRoomAssetAdoption,input:SelectedRoomTransferOptions<P>,actors?:ActorTransfer)=>Promise<RetainedSelectedAssetOwner>;
export const transferRoomAssetAdoption=<P extends SharedSelectionPolicy>(stage:PhysicalRoomAssetAdoption,input:SelectedRoomTransferOptions<P>)=>takeSelectedRoom(stage,input);
/** The already-reachable recipient keeps real successor custody if anything
 * rejects after activation. The completion callback is trusted SDK cleanup,
 * runs BEFORE all final source checks, and is never an input DATA field. */
export function transferRoomAssetAdoptionWithActors<P extends SharedSelectionPolicy>(stage:PhysicalRoomAssetAdoption,input:SelectedRoomTransferOptions<P>,actors:StoppedActorCohort,recipient:RoomRunSuccessorRecipient,prepareComplete:()=>Promise<void>):Promise<RetainedSelectedAssetOwner>{checkPhysicalRootActors(actors);recipientApi.empty.call(recipient);if(typeof prepareComplete!=='function')return Promise.reject(fail('asset_adoption_policy'));return takeSelectedRoom(stage,input,{actors,recipient,prepareComplete});}
interface Policy {readonly name:string;readonly authority:()=>void;readonly check:()=>void;readonly local:()=>void;readonly factory:IDBFactory;readonly locks:LockManager;readonly observation:PhysicalOperationV3Cancellation;readonly life:{closed:boolean;closing:boolean};readonly signal:AbortSignal|undefined}
function policy(input:RoomAssetAdoptionOptions,begin:boolean){
 const raw=fields(input,['database','checkAuthority',...(begin?['participants']:[])],['signal']),name=database(raw['database']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),factory=recoveryOpeningContext(),locks=navigator.locks,choices=begin?adoptionChoices(raw['participants']):undefined,life={closed:false,closing:false},observation=new PhysicalOperationV3Cancellation(raw['signal'] as AbortSignal|undefined);
 const local=()=>{if(life.closed||life.closing)throw fail('asset_adoption_closed');if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('asset_adoption_policy');observation.check();},check=()=>{local();authority();local();};
 return{policy:{name,authority,check,local,factory,locks,observation,life,signal:raw['signal'] as AbortSignal|undefined} satisfies Policy,choices};
}
async function cleanup(resources:Resources,p:Policy):Promise<void>{
 const results=await Promise.allSettled([...resources.targets].reverse().map(async([id,target])=>{await closeCustody.call(target.custody);closeStore.call(target.store);resources.targets.delete(id);}));if(results.some(row=>row.status==='rejected'))throw fail();
 await resources.store?.close();for(const[id,lease]of [...resources.targetLeases].reverse()){await lease.close();resources.targetLeases.delete(id);}await resources.lease?.close();p.observation.close();p.life.closed=true;
}
export class PhysicalRoomAssetAdoption {
 #root:PhysicalRoomClientOperationV3|undefined;readonly #policy;readonly #resources;#record:RoomAssetAdoptionRecord;#files:AdoptionFiles;
 #pending:RoomAssetAdoptionRecord|undefined;readonly #closingListeners=new Set<()=>void>();#busy=false;#moved=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,root:PhysicalRoomClientOperationV3,p:Policy,r:Resources,record:RoomAssetAdoptionRecord,files:AdoptionFiles){if(token!==key)throw fail('asset_adoption_policy');this.#root=root;this.#policy=p;this.#resources=r;this.#record=record;this.#files=files;Object.freeze(this);}
 static{takeSelectedRoom=(stage,input,actors)=>{
  if(!stage||typeof stage!=='object'||!(#root in stage))return Promise.reject(fail('asset_adoption_policy'));
  if(stage.#busy)return Promise.reject(fail('asset_adoption_busy'));if(stage.#moved||stage.#policy.life.closed||stage.#policy.life.closing)return Promise.reject(fail('asset_adoption_closed'));stage.#busy=true;
  let task:Promise<RetainedSelectedAssetOwner>;
  try{
   const raw=fields(input,['reads','checkAuthority','expected','approve','approvalDatabase','checkAssetAuthority'],['signal']),name=database(raw['approvalDatabase']),expected=approvalChoice(raw['expected']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),assetAuthority=participantAuthority(raw['checkAssetAuthority'] as ()=>void),approve=raw['approve'] as RoomAssetApprovalOptions['approve'];if(typeof approve!=='function')throw fail('asset_adoption_policy');
   const p=stage.#policy,r=stage.#resources,signal=raw['signal'] as AbortSignal|undefined,observation=new PhysicalOperationV3Cancellation(signal),current=()=>{if(p.life.closed||p.life.closing||stage.#moved||!stage.#root)throw fail('asset_adoption_closed');if(globalThis.indexedDB!==p.factory||globalThis.navigator?.locks!==p.locks)throw fail('asset_adoption_policy');observation.check();r.store!.checkReadCurrent();checkRecoveryLeasesHeld([r.lease!,...r.targetLeases.values()]);for(const target of r.targets.values()){checkStore.call(target.store);checkCustody.call(target.custody);}},check=()=>{current();authority();current();};
   const transfer:typeof transferPhysicalOperationV3RetainedRoot=actors?(root,options,prepare)=>transferPhysicalOperationV3RetainedRootWithActors(root,options,prepare,actors.actors):transferPhysicalOperationV3RetainedRoot;
   task=transfer(stage.#root!,{reads:raw['reads'] as typeof input.reads,checkAuthority:check,...(signal?{signal}:{})},async(scope,root)=>{
    let prepared:PreparedSelectedAssetOwner|undefined;const verify=async()=>{current();if(stage.#pending||stage.#record.phase!=='ready'||r.targets.size!==stage.#record.participants.length)throw fail('asset_adoption_diverged');const actual=await r.store!.readFresh(check,signal);check();if(JSON.stringify(actual.record)!==JSON.stringify(stage.#record)||actual.files.size!==stage.#files.size||[...actual.files].some(([id,bytes])=>!sameAdoptionBytes(stage.#files.get(id),bytes)))throw fail('asset_adoption_diverged');await verifyAdoptionSelection(stage.#record,actual.files,scope.assets);for(const row of stage.#record.participants){const target=r.targets.get(row.id);if(!target)throw fail('asset_adoption_missing');const snapshot=await capture.call(target.store,()=>{check();return undefined;});check();if(snapshot.backup.size!==row.selected.bytes||await scope.assets.digest(snapshot.backup)!==row.selected.sha256)throw fail('asset_adoption_diverged');}check();};
    await verify();if([p.name,...scope.assets.namespaces,...stage.#record.participants.map(row=>row.targetDatabase)].includes(name))throw fail('asset_adoption_policy');const actual=approvalChoice({format:'breditor/room-asset-approval-choice',formatVersion:1,cut:scope.cut.selection,adoption:stage.#record});if(JSON.stringify(actual)!==JSON.stringify(expected))throw fail('asset_adoption_diverged');
    await decideRoomAssetApproval(actual,approve,{check,signal,watchClosing:cancel=>{const rootWatch=scope.watchClosing(cancel);if(p.life.closing)cancel();else stage.#closingListeners.add(cancel);return()=>{stage.#closingListeners.delete(cancel);rootWatch();};}});await verify();await scope.verify();check();
    const file=await encodeRoomAssetApproval(actual,scope.cut,stage.#files,{check,digest:scope.assets.digest}),saved=await retainRoomAssetApproval(name,file,{check,digest:scope.assets.digest,signal,cleanup:scope.cleanup});check();
    const factory=p.factory,locks=p.locks,basis={files:stage.#files,resources:r,current:()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('asset_adoption_policy');r.store!.checkReadCurrent();}};
    if(actors){await actors.prepareComplete();check();}
    prepared=prepareSelectedAssetOwner(root,stage.#record,basis,saved,assetAuthority);
    if(actors)recipientApi.stage.call(actors.recipient,prepared.value);
    // The old temporary read is really closed before this fresh selected-store
    // verification. Never reuse its disposed assets/read guard for new I/O.
    const verifySelectedAfterRead=async()=>{const digest=prepareArchiveIntegrity({wasm:scope.wasm,checkAuthority:check,...(signal?{signal}:{})}).digest;
     const actual=await r.store!.readFresh(check,signal);check();if(JSON.stringify(actual.record)!==JSON.stringify(stage.#record)||actual.files.size!==stage.#files.size||[...actual.files].some(([id,bytes])=>!sameAdoptionBytes(stage.#files.get(id),bytes)))throw fail('asset_adoption_diverged');
     for(const row of stage.#record.participants){const target=r.targets.get(row.id);if(!target)throw fail('asset_adoption_missing');const snapshot=await capture.call(target.store,()=>{check();return undefined;},signal?{signal}:{});check();if(snapshot.backup.size!==row.selected.bytes||await digest(snapshot.backup)!==row.selected.sha256)throw fail('asset_adoption_diverged');}check();
    };
    return{value:prepared.value,...(actors?{verifyAfterRead:verifySelectedAfterRead}:{}),checkCurrent(){current();prepared!.check();if(actors)recipientApi.check.call(actors.recipient);},consume(){stage.#moved=true;stage.#root=undefined;p.life.closed=true;p.observation.close();prepared!.activate();if(actors)recipientApi.activate.call(actors.recipient);},async abandon(){try{await prepared?.abandon();}finally{if(actors)recipientApi.abandon.call(actors.recipient);}}};
   }).finally(()=>observation.close());
  }catch(error){task=Promise.reject(error);}
  stage.#running=task;return task.finally(()=>{stage.#running=undefined;stage.#busy=false;});
 };}
 /** Detached current files for preparing choices. This snapshot is not a live
  * root/store reservation; begin re-admits every actual source again. */
 static capture(root:PhysicalRoomClientOperationV3,input:PhysicalAssetReadOptions){const raw=fields(input,['checkAuthority'],['signal']);return withPhysicalOperationV3Assets(root,{checkAuthority:raw['checkAuthority'] as ()=>void,...(raw['signal']?{signal:raw['signal'] as AbortSignal}:{})},async scope=>Object.freeze({source:scope.source,participants:scope.participants,unreconciledParticipants:scope.unreconciledParticipants}));}
 static begin(root:PhysicalRoomClientOperationV3,input:RoomAssetAdoptionBeginOptions):Promise<PhysicalRoomAssetAdoption>{return PhysicalRoomAssetAdoption.#open(root,input,true);}
 static resume(root:PhysicalRoomClientOperationV3,input:RoomAssetAdoptionOptions):Promise<PhysicalRoomAssetAdoption>{return PhysicalRoomAssetAdoption.#open(root,input,false);}
 static async #open(root:PhysicalRoomClientOperationV3,input:RoomAssetAdoptionOptions,begin:boolean):Promise<PhysicalRoomAssetAdoption>{
  const chosen=policy(input,begin),p=chosen.policy,resources:Resources={targets:new Map(),targetLeases:new Map()};let opening:RecoveryOpeningCustody|undefined;
  try{
   const result=await withPhysicalOperationV3Assets(root,{checkAuthority:p.check,...(p.signal?{signal:p.signal}:{})},async scope=>{
    const check=()=>{p.check();scope.check();checkRecoveryLeasesHeld([...(resources.lease?[resources.lease]:[]),...resources.targetLeases.values()]);};if(scope.namespaces.includes(p.name))throw fail('asset_adoption_policy');
    const initial=begin?await prepareAdoptionSelection(p.name,chosen.choices!,scope):undefined;check();opening=await RecoveryOpeningCustody.reserve(p.factory,[p.name],()=>cleanup(resources,p),errors);check();resources.lease=await RecoveryLease.acquire(JSON.stringify(p.name));check();resources.store=new RoomAssetAdoptionStore(p.factory,p.name,p.check,p.signal);
    if(initial)for(const row of initial.record.participants){resources.targetLeases.set(row.id,await RecoveryLease.acquire(JSON.stringify(row.targetDatabase)));check();if(await physicalOperationV3Present(row.targetDatabase,check))throw fail('asset_adoption_exists');}
    await resources.store.open(initial,check);check();const saved=await resources.store.read(check);check();await verifyAdoptionSelection(saved.record,saved.files,scope);if(!initial)for(const row of saved.record.participants){resources.targetLeases.set(row.id,await RecoveryLease.acquire(JSON.stringify(row.targetDatabase)));check();}check();return new PhysicalRoomAssetAdoption(key,root,p,resources,saved.record,saved.files);
   });opening!.complete();return result;
  }catch(e){if(opening)await opening.rollback();else p.observation.close();throw e;}
 }
 #check=():void=>{this.#policy.check();checkRecoveryLeasesHeld([...(this.#resources.lease?[this.#resources.lease]:[]),...this.#resources.targetLeases.values()]);};
 #run<T>(work:(scope:PhysicalAssetReadScope,check:()=>void)=>Promise<T>):Promise<T>{
  if(this.#policy.life.closed||this.#policy.life.closing)return Promise.reject(fail('asset_adoption_closed'));if(this.#busy)return Promise.reject(fail('asset_adoption_busy'));this.#busy=true;
  const p=this.#policy,task=withPhysicalOperationV3Assets(this.#root!,{checkAuthority:this.#check,...(p.signal?{signal:p.signal}:{})},async scope=>{const check=()=>{this.#check();scope.check();};check();return work(scope,check);});this.#running=task;return task.finally(()=>{this.#running=undefined;this.#busy=false;});
 }
 async #retained(scope:PhysicalAssetReadScope,check:()=>void):Promise<void>{
  const actual=await this.#resources.store!.read(check);check();const state=JSON.stringify(actual.record);if(state===JSON.stringify(this.#record))this.#pending=undefined;else if(this.#pending&&state===JSON.stringify(this.#pending)){this.#record=actual.record;this.#pending=undefined;}else throw fail('asset_adoption_diverged');
  if(actual.files.size!==this.#files.size||[...actual.files].some(([id,bytes])=>!sameAdoptionBytes(this.#files.get(id),bytes)))throw fail('asset_adoption_diverged');await verifyAdoptionSelection(this.#record,actual.files,scope);check();
 }
 async #advance(next:RoomAssetAdoptionRecord,check:()=>void):Promise<void>{this.#pending=next;await this.#resources.store!.advance(this.#record,next,this.#files,check);check();this.#record=next;this.#pending=undefined;}
 async #seed(row:RoomAssetAdoptionTarget,check:()=>void):Promise<Target>{const selected=await selectedAdoptionFile(row,this.#files.get(row.id)!,check);check();const target=await restore.call(RichAssetStore,row.targetDatabase,selected,{uploadState:'preserve',limits:row.limits,checkAuthority:check,...(this.#policy.signal?{signal:this.#policy.signal}:{})});this.#resources.targets.set(row.id,target);return target;}
 async #target(row:RoomAssetAdoptionTarget,scope:PhysicalAssetReadScope,check:()=>void,create:boolean):Promise<void>{
  check();let target=this.#resources.targets.get(row.id);if(!target){
   const exists=await physicalOperationV3Present(row.targetDatabase,check);check();if(!exists&&!create)throw fail('asset_adoption_missing');
   if(!exists)target=await this.#seed(row,check);
   else{let store:RichAssetStore|undefined,custody:RichAssetStoreCustody|undefined;try{store=await open.call(RichAssetStore,row.targetDatabase,{limits:row.limits});check();custody=await acquire.call(store);target={store,custody};this.#resources.targets.set(row.id,target);}catch(e){await(custody?closeCustody.call(custody):Promise.resolve());if(store)closeStore.call(store);throw e;}}
  }
  const current=()=>{check();checkStore.call(target!.store);checkCustody.call(target!.custody);};current();let cut=await capture.call(target.store,()=>{current();return undefined;});current();
  if(cut.backup.size!==row.selected.bytes||await scope.digest(cut.backup)!==row.selected.sha256){
   // A started, never-exposed clone may retain its exact empty schema after an
   // insertion abort. Keep its namespace recovery lease while retiring this
   // read handle. The existing held restore then atomically requires EMPTY
   // storage again; any intervening/foreign row refuses instead of being reset.
   // Completed destinations never enter this seed/retry path.
   if(!create||row.state!=='started'||(await list.call(target.store)).length!==0)throw fail('asset_adoption_diverged');current();await closeCustody.call(target.custody);closeStore.call(target.store);this.#resources.targets.delete(row.id);check();target=await this.#seed(row,check);current();cut=await capture.call(target.store,()=>{current();return undefined;});current();if(cut.backup.size!==row.selected.bytes||await scope.digest(cut.backup)!==row.selected.sha256)throw fail('asset_adoption_diverged');
  }current();
 }
 /** Advance only exact staged clones; already-complete stores must exist and
  * match. A partial or lost-acknowledgement attempt retains its actual handles. */
 finish():Promise<RoomAssetAdoptionRecord>{return this.#run(async(scope,check)=>{
  await this.#retained(scope,check);
  for(let i=0;i<this.#record.participants.length;i++){let row=this.#record.participants[i]!;if(row.state==='reserved'){if(await physicalOperationV3Present(row.targetDatabase,check))throw fail('asset_adoption_exists');await this.#advance({...this.#record,participants:this.#record.participants.map((p,j)=>i===j?{...p,state:'started'}:p)},check);row=this.#record.participants[i]!;}
   await this.#target(row,scope,check,row.state==='started');if(row.state!=='complete')await this.#advance({...this.#record,participants:this.#record.participants.map((p,j)=>i===j?{...p,state:'complete'}:p)},check);
  }
  await this.#retained(scope,check);if(this.#record.phase==='prepared')await this.#advance({...this.#record,phase:'ready'},check);for(const row of this.#record.participants)await this.#target(row,scope,check,false);await this.#retained(scope,check);return frozen(structuredClone(this.#record));
 });}
 check():Promise<RoomAssetAdoptionRecord>{return this.#run(async(scope,check)=>{await this.#retained(scope,check);for(const row of this.#record.participants)if(row.state==='complete')await this.#target(row,scope,check,false);check();return frozen(structuredClone(this.#record));});}
 baseFile(id:string):Promise<Blob>{return this.#run(async(scope,check)=>{await this.#retained(scope,check);const bytes=this.#files.get(id);if(!bytes)throw fail('asset_adoption_policy');return new Blob([bytes]);});}
 /** A preview is DATA only. Its exact cut includes native histories, uncertain
  * saves, packet queues, literal origin files and every whole upload archive.
  * It never turns readiness into permission and returns no mutable owner. */
 approvalChoice<P extends SharedSelectionPolicy>(input:PhysicalOperationV3HistoryReadOptions<P>):Promise<RoomAssetApprovalChoice>{return this.#approval(input,async scope=>approvalChoice({format:'breditor/room-asset-approval-choice',formatVersion:1,cut:scope.cut.selection,adoption:this.#record}));}
 /** Retain a fresh independent host decision and ALL its exact data atomically.
  * Retry still needs the same outside choice and a NEW affirmative callback;
  * an existing stored ready/approval row never supplies permission itself. */
 retainApprovedSelection<P extends SharedSelectionPolicy>(destination:string,input:RoomAssetApprovalOptions<P>):Promise<RoomAssetApprovalFile>{
  let name:string,expected:RoomAssetApprovalChoice,approve:RoomAssetApprovalOptions<P>['approve'],reads:PhysicalOperationV3HistoryReadOptions<P>;
  try{const raw=fields(input,['reads','checkAuthority','expected','approve'],['signal']);name=database(destination);expected=approvalChoice(raw['expected']);if(typeof raw['approve']!=='function')throw fail('asset_adoption_policy');approve=raw['approve'] as typeof approve;reads={reads:raw['reads'] as typeof input.reads,checkAuthority:raw['checkAuthority'] as ()=>void,...(raw['signal']!==undefined?{signal:raw['signal'] as AbortSignal}:{})};}catch(error){return Promise.reject(error);}
  return this.#approval(reads,async scope=>{
   if([this.#policy.name,...scope.assets.namespaces,...this.#record.participants.map(row=>row.targetDatabase)].includes(name))throw fail('asset_adoption_policy');const actual=approvalChoice({format:'breditor/room-asset-approval-choice',formatVersion:1,cut:scope.cut.selection,adoption:this.#record});if(JSON.stringify(actual)!==JSON.stringify(expected))throw fail('asset_adoption_diverged');scope.assets.check();
   await decideRoomAssetApproval(actual,approve,{check:scope.assets.check,signal:scope.signal,watchClosing:cancel=>{const root=scope.watchClosing(cancel);let policy=()=>{};try{policy=this.#policy.observation.watch(cancel);if(this.#policy.life.closing)cancel();else this.#closingListeners.add(cancel);return()=>{this.#closingListeners.delete(cancel);policy();root();};}catch(error){policy();root();throw error;}}});scope.assets.check();await this.#retained(scope.assets,scope.assets.check);for(const row of this.#record.participants)await this.#target(row,scope.assets,scope.assets.check,false);await scope.verify();scope.assets.check();const file=await encodeRoomAssetApproval(actual,scope.cut,this.#files,{check:scope.assets.check,digest:scope.assets.digest});return retainRoomAssetApproval(name,file,{check:scope.assets.check,digest:scope.assets.digest,signal:scope.signal,cleanup:scope.cleanup});
  });
 }
 #approval<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:PhysicalRecordCutVisit)=>Promise<T>):Promise<T>{
  if(this.#policy.life.closed||this.#policy.life.closing)return Promise.reject(fail('asset_adoption_closed'));if(this.#busy)return Promise.reject(fail('asset_adoption_busy'));this.#busy=true;let task:Promise<T>;
  try{const raw=fields(input,['reads','checkAuthority'],['signal']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),read={reads:raw['reads'] as typeof input.reads,checkAuthority:()=>{this.#check();authority();this.#check();},...(raw['signal']!==undefined?{signal:raw['signal'] as AbortSignal}:{})};task=withPhysicalOperationV3RecordCut(this.#root!,read,async scope=>{const check=()=>{this.#check();scope.assets.check();};const assets={...scope.assets,check};check();await this.#retained(assets,check);if(this.#record.phase!=='ready')throw fail('asset_adoption_diverged');for(const row of this.#record.participants)await this.#target(row,assets,check,false);const result=await visit({...scope,assets});check();await this.#retained(assets,check);for(const row of this.#record.participants)await this.#target(row,assets,check,false);check();return result;});}catch(error){task=Promise.reject(error);}
  this.#running=task;return task.finally(()=>{this.#running=undefined;this.#busy=false;});
 }
 /** Cleanup never needs ongoing permission and never closes the caller's root.
  * Actual failed handles stay in this owner (or opening custody) for retry. */
 close():Promise<void>{if(this.#policy.life.closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#policy.life.closing=true;for(const cancel of this.#closingListeners)cancel();this.#closingListeners.clear();this.#cleanup=(async()=>{await this.#running?.catch(()=>{});await cleanup(this.#resources,this.#policy);this.#files=new Map();this.#root=undefined;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
