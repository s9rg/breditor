/** Concrete seven-family recovery routes. Existing component protocols and
 * native history remain authoritative. No phase marker manufactures an owner,
 * and finite job guards are never installed as a returned client's lifetime. */
import type {PhysicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import type {PhysicalOperationV3PreparedTarget} from './preflight.js';
import type {CompleteOperationParticipant} from '../complete_operation_cohort/cohort.js';
import {SharedIndependentParticipantRecovery} from '../independent_recovery/recovery.js';
import {SharedIndependentDeliveryParticipantRecovery} from '../independent_delivery_recovery/recovery.js';
import {OperationalIndependentLocalParticipant} from '../independent_local_operation/participant.js';
import {OperationalIndependentDeliveryParticipant} from '../independent_operation/participant.js';
import {RestoredOperationParticipant} from '../restored_participant/participant.js';
import {OperationalRestoredLocalParticipant} from '../restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant} from '../flat_local_operation/participant.js';
import {prepareMixedCatalogStage,type MixedCatalogStagePolicy,type MixedCatalogSavedClient} from '../mixed_catalog_stage/prepare.js';
import {stageCatalogV2Participant} from '../room_recovery_catalog_v2/staged_participant.js';
import {transferredV2Children,openV2ChildOperation,closeV2Child,type V2OperationChild} from '../room_operation_v2/children.js';
import type {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import type {SharedRoomRecoveryCatalogV2Participant} from '../room_recovery_catalog_v2/contract.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {physicalOperationV3Failure as fail,MAX_PHYSICAL_OPERATION_V3_PLAN_BYTES} from './policy.js';
import {validatePhysicalOperationV3CurrentPolicy} from './current_policy.js';
export interface PhysicalOperationV3Child{readonly selected:PhysicalOperationV3PreparedTarget;legacy?:V2OperationChild;live?:CompleteOperationParticipant}
export async function physicalOperationV3Present(database:string,guard:()=>void):Promise<boolean>{guard();const db=await existingDatabase(database);try{guard();return!!db;}finally{db?.close();}}
/** Explicit current participant policy, independent of parent flags/authority.
 * This wrapper is for preparation only; real leaf constructors keep their own
 * canonical lifetime and cancellation contracts. */
function leafGuard(child:PhysicalOperationV3Child):()=>void{
 const row=child.selected.input,policy=row.family==='original'||row.family==='generation'?row:row.family==='independent-local'||row.family==='independent-delivery'?row.options.recovery:row.options,check=participantAuthority(policy.checkAuthority),signal=policy.signal;
 return()=>{checkAssetBytesSignal(signal);check();checkAssetBytesSignal(signal);};
}
/** Whole structural preflight has already happened. Original/generation planning
 * reuses the genuine readonly stage contract, not a relabelled data reader. */
export async function physicalOperationV3LegacyPolicies(children:readonly PhysicalOperationV3Child[],source:PhysicalCatalogV3ArchiveState,forbidden:readonly string[],guard:()=>void):Promise<readonly MixedCatalogStagePolicy[]>{
 const selected:SharedRoomRecoveryCatalogV2Participant[]=[];for(const child of children){const row=child.selected.input;guard();validatePhysicalOperationV3CurrentPolicy(row);leafGuard(child)();guard();if(row.family==='original')selected.push({id:row.id,family:row.family,recovery:row.recovery});else if(row.family==='generation')selected.push({id:row.id,family:row.family,recovery:row.recovery});}const clients=new Map<string,MixedCatalogSavedClient>();
 for(const[id,row]of source.clients)if(row.family==='original'||row.family==='generation')clients.set(id,row);
 const policies=(await prepareMixedCatalogStage(selected,clients,source.inventory.metadata().native,forbidden,MAX_PHYSICAL_OPERATION_V3_PLAN_BYTES,guard,undefined,true)).policies;
 for(const policy of policies){const row=children.find(child=>child.selected.input.id===policy.id)!.selected.input;if(row.family!=='original'&&row.family!=='generation')throw fail('physical_operation_v3_policy');if(policy.family==='generation'&&policy.options.expected.identity.source.relay?.review?.reviewEditing==='read_only'&&row.currentPolicy.reviewAccess!=='read_only')throw fail('physical_operation_v3_policy');if(policy.family==='original'){const options=policy.value.options.session.options as {relay?:{reviewEditing?:string}};if(options.relay?.reviewEditing==='read_only'&&row.currentPolicy.reviewAccess!=='read_only')throw fail('physical_operation_v3_policy');}}
 return policies;
}
/** Completion demands every actual selected component. A missing component is
 * never repaired by silently starting an empty source or upload database. */
export async function requirePhysicalOperationV3Components(child:PhysicalOperationV3Child,guard:()=>void):Promise<void>{for(const name of child.selected.target.namespaces)if(!await physicalOperationV3Present(name.database,guard))throw fail('physical_operation_v3_missing');}
export async function openPhysicalOperationV3Child(child:PhysicalOperationV3Child,source:PhysicalCatalogV3ArchiveState,policies:readonly MixedCatalogStagePolicy[],complete:boolean,guard:()=>void,scope:RecoveryCleanupScope):Promise<void>{
 const row=child.selected.input,independent=leafGuard(child);guard();independent();if(complete)await requirePhysicalOperationV3Components(child,guard);if(child.live){if(child.live.family==='restored-graph')await child.live.operation.finish();await child.live.operation.check();guard();return;}
 const operation=child.selected.target.namespaces.find(ns=>ns.role==='operation')!.database,present=await physicalOperationV3Present(operation,guard);
 if(row.family==='original'||row.family==='generation'){
  let policy=policies.find(policy=>policy.id===row.id);if(!policy||policy.family!==row.family)throw fail('physical_operation_v3_policy');
  if(!child.legacy){
   if(!present){const staged=await stageCatalogV2Participant(policy,false,guard,scope);child.legacy=transferredV2Children([policy],[staged])[0]!;guard();}
   // Reopen under the independently selected current client authority. Never
   // leave the readonly bootstrap job guard inside a long-lived writer.
   if(policy.family==='original')policy={...policy,value:{...policy.value,options:{...policy.value.options,checkAuthority:row.checkAuthority,...(row.signal?{signal:row.signal}:{})}}};
   else policy={...policy,options:{...policy.options,checkAuthority:row.checkAuthority,...(row.signal?{signal:row.signal}:{})}};
   child.legacy??={family:policy.family,id:row.id,policy,currentPolicy:row.currentPolicy,currentPolicyPending:true,ready:undefined,source:undefined,operation:undefined} as V2OperationChild;
   if(child.legacy.family==='original'&&policy.family==='original')child.legacy.policy=policy;else if(child.legacy.family==='generation'&&policy.family==='generation')child.legacy.policy=policy;else throw fail('physical_operation_v3_diverged');child.legacy.currentPolicy=row.currentPolicy;child.legacy.currentPolicyPending=true;
  }
  await openV2ChildOperation(child.legacy,operation,present,independent,scope,row.signal);guard();
  child.live=child.legacy.family==='original'?{id:row.id,family:'original',operation:child.legacy.operation!}:{id:row.id,family:'generation',operation:child.legacy.operation!};return;
 }
 const saved=source.clients.get(row.id);if(!saved||saved.family!==row.family)throw fail('physical_operation_v3_diverged');
 if(row.family==='independent-local'){
  if(present)child.live={id:row.id,family:row.family,operation:await OperationalIndependentLocalParticipant.resume(row.options)};
  else{
   if(saved.family!=='independent-local')throw fail('physical_operation_v3_diverged');const options=row.options.recovery,bootstrap={...options,checkAuthority:()=>{guard();independent();guard();}},exists=await physicalOperationV3Present(options.database,guard);
   const recovery=await(exists?SharedIndependentParticipantRecovery.resume(bootstrap):SharedIndependentParticipantRecovery.begin({...bootstrap,backup:saved.backup}));let recovered:Awaited<ReturnType<typeof recovery.finish>>|undefined;
   const cleanup=scope.retain(async()=>{await recovered?.discardAndClose();await recovery.close();});
   try{guard();recovered=await recovery.finish();guard();child.live={id:row.id,family:row.family,operation:await OperationalIndependentLocalParticipant.begin({...row.options,recovered})};await recovery.close();cleanup.complete();}catch(error){await cleanup.rollback();throw error;}
  }
 }else if(row.family==='independent-delivery'){
  if(present)child.live={id:row.id,family:row.family,operation:await OperationalIndependentDeliveryParticipant.resume(row.options)};
  else{
   if(saved.family!=='independent-delivery')throw fail('physical_operation_v3_diverged');const options=row.options.recovery,bootstrap={...options,session:row.stagingSession,checkAuthority:()=>{guard();independent();guard();}},exists=await physicalOperationV3Present(options.database,guard);
   const recovery=await(exists?SharedIndependentDeliveryParticipantRecovery.resume(bootstrap):SharedIndependentDeliveryParticipantRecovery.begin({...bootstrap,backup:saved.backup}));let recovered:Awaited<ReturnType<typeof recovery.finish>>|undefined;
   const cleanup=scope.retain(async()=>{await recovered?.discardAndClose();await recovery.close();});
   try{guard();recovered=await recovery.finish();guard();child.live={id:row.id,family:row.family,operation:await OperationalIndependentDeliveryParticipant.begin({...row.options,recovered})};await recovery.close();cleanup.complete();}catch(error){await cleanup.rollback();throw error;}
  }
 }else if(row.family==='restored-graph'){
  // The complete latest lineage-v2 file, never inputFile()/previous provenance.
  if(saved.family!=='restored-graph')throw fail('physical_operation_v3_diverged');const file=saved.backup.file();
  child.live={id:row.id,family:row.family,operation:await(present?RestoredOperationParticipant.resume(row.options):RestoredOperationParticipant.begin(file,row.options))};await child.live.operation.finish();
 }else if(row.family==='local-operation-snapshot'){
  if(saved.family!=='local-operation-snapshot')throw fail('physical_operation_v3_diverged');child.live={id:row.id,family:row.family,operation:await(present?OperationalRestoredLocalParticipant.resume(row.options):OperationalRestoredLocalParticipant.begin(saved.backup.file(),row.options))};
 }else{
  if(saved.family!=='local-operation-flat')throw fail('physical_operation_v3_diverged');child.live={id:row.id,family:row.family,operation:await(present?OperationalFlatLocalParticipant.resume(row.options):OperationalFlatLocalParticipant.begin(saved.backup.file(),row.options))};
 }
 guard();await child.live.operation.check();guard();
}
export async function closePhysicalOperationV3Child(child:PhysicalOperationV3Child,discard:boolean):Promise<void>{
 if(child.legacy){await closeV2Child(child.legacy,discard);delete child.legacy;delete child.live;return;}
 if(child.live){await(discard?child.live.operation.discardAndClose():child.live.operation.close());delete child.live;}
}
