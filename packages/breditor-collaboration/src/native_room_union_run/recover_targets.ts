/** Actual seven-family target/store ownership. Every handle is retained in
 * this already-reachable owner BEFORE another await or check can reject. */
import {NativeRoomUnionExecutionArchive} from '../native_room_union_execution/archive.js';
import type {NativeRoomUnionReadScope} from '../native_room_union/read_scope.js';
import {withNativeRoomUnionPrepared} from '../native_room_union/prepared_scope.js';
import {PhysicalRoomCatalogV3} from '../physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3,beginPhysicalRootKeepingActors,resumePhysicalRootKeepingActors} from '../physical_room_operation_v3/operation.js';
import {PhysicalRoomAssetAdoption,transferRoomAssetAdoptionWithActorsAndApproval as transferRoomAssetAdoptionWithActors} from '../physical_room_asset_adoption/coordinator.js';
import type {PhysicalOperationV3Participant} from '../physical_room_operation_v3/contract.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import type {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import type {NativeRoomUnionRunStage,NativeRoomUnionRunIdentity} from './contract.js';
import {fail} from './policy.js';
import {RoomRunSuccessorRecipient} from '../native_room_execution_run/successor_recipient.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {RetainedSelectedAssetOwner as SelectedOwner} from '../physical_room_asset_successor/owner.js';
import {unionRunPromotionChoice} from './promotion_choice.js';
import type {NativeRoomUnionRunPromotionChoice,NativeRoomUnionRunPromotionOptions,NativeRoomUnionRunPromotionResult,NativeRoomUnionRunSnapshot} from './contract.js';
import {drainFailedRecoveryOpenings,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
const catalogApi={begin:PhysicalRoomCatalogV3.begin,resume:PhysicalRoomCatalogV3.resume,close:PhysicalRoomCatalogV3.prototype.close};
const rootApi={finish:PhysicalRoomClientOperationV3.prototype.finish,check:PhysicalRoomClientOperationV3.prototype.check,close:PhysicalRoomClientOperationV3.prototype.discardAndClose};
const assetsApi={begin:PhysicalRoomAssetAdoption.begin,resume:PhysicalRoomAssetAdoption.resume,finish:PhysicalRoomAssetAdoption.prototype.finish,check:PhysicalRoomAssetAdoption.prototype.check,base:PhysicalRoomAssetAdoption.prototype.baseFile,close:PhysicalRoomAssetAdoption.prototype.close};
const recipientApi={ready:RoomRunSuccessorRecipient.prototype.ready,owner:RoomRunSuccessorRecipient.prototype.owner,take:RoomRunSuccessorRecipient.prototype.take,close:RoomRunSuccessorRecipient.prototype.close};
const selectedApproval=SelectedOwner.prototype.approval,approvalPreview=PhysicalRoomAssetAdoption.prototype.approvalChoice;
const preparation=NativeRoomUnionExecutionArchive.prototype.preparation,base=NativeRoomUnionExecutionArchive.prototype.base;
export class NativeRoomUnionRunTargets {
 readonly #recipient=new RoomRunSuccessorRecipient();
 #factory:IDBFactory|undefined;#names:readonly string[]=[];
 #catalog:PhysicalRoomCatalogV3|undefined;#root:PhysicalRoomClientOperationV3|undefined;#assets:PhysicalRoomAssetAdoption|undefined;
 constructor(){Object.freeze(this);}
 async recover(archive:NativeRoomUnionExecutionArchive,identity:NativeRoomUnionRunIdentity,participants:readonly PhysicalOperationV3Participant[],actors:StoppedActorCohort,scope:NativeRoomUnionReadScope,seen:(stage:NativeRoomUnionRunStage)=>boolean,advance:(stage:Exclude<NativeRoomUnionRunStage,'start'>)=>Promise<void>):Promise<void> {
  const plan=identity.execution.plan,layout=plan.layout;
  this.#factory??=recoveryOpeningContext();
  this.#names=[layout.catalogDatabase,layout.operationDatabase,layout.adoptionDatabase,layout.approvalDatabase,...layout.participants.map(row=>row.selectedUploadsDatabase),...plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))];
  await withNativeRoomUnionPrepared(preparation.call(archive),scope,async context=>{
   const read={...context.readOptions,checkAuthority:scope.check,signal:scope.base.signal};
   if(!this.#root){
    const rootExists=await physicalOperationV3Present(layout.operationDatabase,scope.check);scope.check();
    if(rootExists){
     if(!seen('root-started'))throw fail('room_union_run_exists');
     if(this.#catalog){await catalogApi.close.call(this.#catalog);this.#catalog=undefined;}
     this.#root=await resumePhysicalRootKeepingActors({...read,database:layout.operationDatabase,catalogDatabase:layout.catalogDatabase,expected:plan.catalog,participants},actors);
    }else{
     if(!this.#catalog){
      const existed=await physicalOperationV3Present(layout.catalogDatabase,scope.check);scope.check();
      if(existed&&!seen('catalog-started'))throw fail('room_union_run_exists');
      await advance('catalog-started');
      this.#catalog=await(existed?catalogApi.resume.call(PhysicalRoomCatalogV3,{...read,database:layout.catalogDatabase,expected:plan.catalog}):catalogApi.begin.call(PhysicalRoomCatalogV3,{...read,database:layout.catalogDatabase,expected:plan.catalog,archive:context.catalog}));
     }
     await advance('root-started');
     this.#root=await beginPhysicalRootKeepingActors({...read,database:layout.operationDatabase,expected:plan.catalog,catalog:this.#catalog,participants},actors);
     this.#catalog=undefined;
    }
   }
   scope.check();await rootApi.finish.call(this.#root);scope.check();await rootApi.check.call(this.#root);scope.check();await advance('root-ready');
   if(!this.#assets){
    const existed=await physicalOperationV3Present(layout.adoptionDatabase,scope.check);scope.check();
    if(existed&&!seen('assets-started'))throw fail('room_union_run_exists');
    await advance('assets-started');
    const input={database:layout.adoptionDatabase,checkAuthority:scope.check,signal:scope.base.signal};
    this.#assets=await(existed?assetsApi.resume.call(PhysicalRoomAssetAdoption,this.#root,input):assetsApi.begin.call(PhysicalRoomAssetAdoption,this.#root,{...input,participants:plan.assets.map(row=>({id:row.id,targetDatabase:layout.participants.find(member=>member.id===row.id)!.selectedUploadsDatabase,base:{file:base.call(archive,row.id,'adoption'),sha256:row.adoptionBase.sha256}}))}));
   }
   scope.check();await assetsApi.finish.call(this.#assets);scope.check();const actual=await assetsApi.check.call(this.#assets);scope.check();
   if(actual.phase!=='ready'||actual.database!==layout.adoptionDatabase||actual.participants.length!==plan.assets.length)throw fail();
   for(const row of plan.assets){
    const member=actual.participants.find(member=>member.id===row.id),target=layout.participants.find(member=>member.id===row.id)!;
    if(!member||member.state!=='complete'||member.targetDatabase!==target.selectedUploadsDatabase||member.base.bytes!==row.adoptionBase.bytes||member.base.sha256!==row.adoptionBase.sha256)throw fail();
    const file=await assetsApi.base.call(this.#assets,row.id);scope.check();
    if(file.size!==row.adoptionBase.bytes||await scope.base.integrity.digest(file)!==row.adoptionBase.sha256)throw fail();
   }
   await rootApi.check.call(this.#root);scope.check();await advance('assets-ready');
  });
 }
 /** Pure actual-recipient state, not a saved completion marker. */
 hasSuccessor():boolean{return recipientApi.ready.call(this.#recipient);}
 async preview(identity:NativeRoomUnionRunIdentity,head:NativeRoomUnionRunSnapshot['head'],scope:NativeRoomUnionReadScope):Promise<NativeRoomUnionRunPromotionChoice>{
  if(!this.#root||!this.#assets||recipientApi.ready.call(this.#recipient))throw fail('room_union_run_closed');
  const approval=await approvalPreview.call(this.#assets,{reads:scope.base.reads,checkAuthority:scope.check,signal:scope.base.signal});scope.check();
  return unionRunPromotionChoice({format:'breditor/native-room-union-run-promotion-choice',formatVersion:1,identity,head,approval});
 }
 async promote(actors:StoppedActorCohort,scope:NativeRoomUnionReadScope,input:NativeRoomUnionRunPromotionOptions,prepareComplete:(approval:import('../physical_room_asset_approval/contract.js').RoomAssetApprovalFile)=>Promise<void>):Promise<NativeRoomUnionRunPromotionResult>{
  if(!this.#root||!this.#assets||recipientApi.ready.call(this.#recipient))throw fail('room_union_run_closed');
  const expected=input.expected;
  await transferRoomAssetAdoptionWithActors(this.#assets,{reads:scope.base.reads,checkAuthority:scope.check,signal:scope.base.signal,expected:expected.approval,approvalDatabase:expected.identity.execution.plan.layout.approvalDatabase,checkAssetAuthority:input.checkAssetAuthority,approve:approval=>{if(JSON.stringify(approval)!==JSON.stringify(expected.approval))throw fail();return input.approve(expected);}},actors,this.#recipient,prepareComplete);
  // No callback/await can hide a successor: its recipient has owned it since
  // before the common barrier. The old wrappers no longer own resources.
  this.#root=undefined;this.#assets=undefined;
  const owner=recipientApi.owner.call(this.#recipient),approval=selectedApproval.call(owner);
  return Object.freeze({format:'breditor/native-room-union-run-promotion-result',formatVersion:1,choice:expected,approval:approval.selection,scope:'local-native-packet-selected-asset-and-actor-ownership'});
 }
 /** Completion checks the genuine current recipient, not its saved marker. */
 confirmSuccessor(choice:NativeRoomUnionRunPromotionChoice):void {const owner=recipientApi.owner.call(this.#recipient);if(JSON.stringify(selectedApproval.call(owner).choice)!==JSON.stringify(choice.approval))throw fail();}
 takeOwner():RetainedSelectedAssetOwner{const owner=recipientApi.take.call(this.#recipient);this.#root=undefined;this.#assets=undefined;this.#catalog=undefined;this.#names=[];this.#factory=undefined;return owner;}
 /** Never release actor escrow until all actual native borrowers have closed.
  * A rejected cleanup keeps the same handles for the next close attempt. */
 async close():Promise<void>{
  await recipientApi.close.call(this.#recipient);
  if(this.#assets){await assetsApi.close.call(this.#assets);this.#assets=undefined;}
  if(this.#root){await rootApi.close.call(this.#root);this.#root=undefined;}
  if(this.#catalog){await catalogApi.close.call(this.#catalog);this.#catalog=undefined;}
  // Rejected constructors may retain an actual pending request/route outside
  // the returned child set. Drain only those failed openings, never live owners.
  if(this.#factory)for(const name of this.#names)await drainFailedRecoveryOpenings(this.#factory,[name],()=>fail('room_union_run_storage'));
 }
}
