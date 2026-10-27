/** Actual seven-family target/store ownership. Every handle is retained in
 * this already-reachable owner BEFORE another await or check can reject. */
import {RoomExecutionArchive} from '../native_room_execution/archive.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {withExecutionPrepared} from '../native_room_execution/prepared_scope.js';
import {PhysicalRoomCatalogV3} from '../physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3,beginPhysicalRootKeepingActors,resumePhysicalRootKeepingActors} from '../physical_room_operation_v3/operation.js';
import {PhysicalRoomAssetAdoption} from '../physical_room_asset_adoption/coordinator.js';
import type {PhysicalOperationV3Participant} from '../physical_room_operation_v3/contract.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import type {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import type {RoomRunStage,RoomRunIdentity} from './contract.js';
import {fail} from '../native_room_execution/policy.js';
import {drainFailedRecoveryOpenings,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
const catalogApi={begin:PhysicalRoomCatalogV3.begin,resume:PhysicalRoomCatalogV3.resume,close:PhysicalRoomCatalogV3.prototype.close};
const rootApi={finish:PhysicalRoomClientOperationV3.prototype.finish,check:PhysicalRoomClientOperationV3.prototype.check,close:PhysicalRoomClientOperationV3.prototype.discardAndClose};
const assetsApi={begin:PhysicalRoomAssetAdoption.begin,resume:PhysicalRoomAssetAdoption.resume,finish:PhysicalRoomAssetAdoption.prototype.finish,check:PhysicalRoomAssetAdoption.prototype.check,base:PhysicalRoomAssetAdoption.prototype.baseFile,close:PhysicalRoomAssetAdoption.prototype.close};
const preparation=RoomExecutionArchive.prototype.preparation,base=RoomExecutionArchive.prototype.base;
export class RoomRunTargets {
 #factory:IDBFactory|undefined;#names:readonly string[]=[];
 #catalog:PhysicalRoomCatalogV3|undefined;#root:PhysicalRoomClientOperationV3|undefined;#assets:PhysicalRoomAssetAdoption|undefined;
 constructor(){Object.freeze(this);}
 async recover(archive:RoomExecutionArchive,identity:RoomRunIdentity,participants:readonly PhysicalOperationV3Participant[],actors:StoppedActorCohort,scope:RoomExecutionReadScope,seen:(stage:RoomRunStage)=>boolean,advance:(stage:Exclude<RoomRunStage,'start'>)=>Promise<void>):Promise<void> {
  const plan=identity.execution.plan,layout=plan.layout;
  this.#factory??=recoveryOpeningContext();
  this.#names=[layout.catalogDatabase,layout.operationDatabase,layout.adoptionDatabase,...layout.participants.map(row=>row.selectedUploadsDatabase),...plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))];
  await withExecutionPrepared(preparation.call(archive),scope,async context=>{
   const read={...context.readOptions,checkAuthority:scope.check,signal:scope.signal};
   if(!this.#root){
    const rootExists=await physicalOperationV3Present(layout.operationDatabase,scope.check);scope.check();
    if(rootExists){
     if(!seen('root-started'))throw fail('room_execution_exists');
     if(this.#catalog){await catalogApi.close.call(this.#catalog);this.#catalog=undefined;}
     this.#root=await resumePhysicalRootKeepingActors({...read,database:layout.operationDatabase,catalogDatabase:layout.catalogDatabase,expected:plan.catalog,participants},actors);
    }else{
     if(!this.#catalog){
      const existed=await physicalOperationV3Present(layout.catalogDatabase,scope.check);scope.check();
      if(existed&&!seen('catalog-started'))throw fail('room_execution_exists');
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
    if(existed&&!seen('assets-started'))throw fail('room_execution_exists');
    await advance('assets-started');
    const input={database:layout.adoptionDatabase,checkAuthority:scope.check,signal:scope.signal};
    this.#assets=await(existed?assetsApi.resume.call(PhysicalRoomAssetAdoption,this.#root,input):assetsApi.begin.call(PhysicalRoomAssetAdoption,this.#root,{...input,participants:plan.assets.map(row=>({id:row.id,targetDatabase:layout.participants.find(member=>member.id===row.id)!.selectedUploadsDatabase,base:{file:base.call(archive,row.id,'adoption'),sha256:row.adoptionBase.sha256}}))}));
   }
   scope.check();await assetsApi.finish.call(this.#assets);scope.check();const actual=await assetsApi.check.call(this.#assets);scope.check();
   if(actual.phase!=='ready'||actual.database!==layout.adoptionDatabase||actual.participants.length!==plan.assets.length)throw fail();
   for(const row of plan.assets){
    const member=actual.participants.find(member=>member.id===row.id),target=layout.participants.find(member=>member.id===row.id)!;
    if(!member||member.state!=='complete'||member.targetDatabase!==target.selectedUploadsDatabase||member.base.bytes!==row.adoptionBase.bytes||member.base.sha256!==row.adoptionBase.sha256)throw fail();
    const file=await assetsApi.base.call(this.#assets,row.id);scope.check();
    if(file.size!==row.adoptionBase.bytes||await scope.integrity.digest(file)!==row.adoptionBase.sha256)throw fail();
   }
   await rootApi.check.call(this.#root);scope.check();await advance('assets-ready');
  });
 }
 /** Never release actor escrow until all actual native borrowers have closed.
  * A rejected cleanup keeps the same handles for the next close attempt. */
 async close():Promise<void>{
  if(this.#assets){await assetsApi.close.call(this.#assets);this.#assets=undefined;}
  if(this.#root){await rootApi.close.call(this.#root);this.#root=undefined;}
  if(this.#catalog){await catalogApi.close.call(this.#catalog);this.#catalog=undefined;}
  // Rejected constructors may retain an actual pending request/route outside
  // the returned child set. Drain only those failed openings, never live owners.
  if(this.#factory)for(const name of this.#names)await drainFailedRecoveryOpenings(this.#factory,[name],()=>fail('room_execution_storage'));
 }
}
