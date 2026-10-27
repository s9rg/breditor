/** Reachable original-root and selected-upload custody for a cold build. Native
 * parents close before targets borrow the same fresh actors; original upload
 * stores remain genuinely reserved until AFTER successor promotion. */
import {ColdSelectedResources} from '../cold_selected_room/resources.js';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {sameAdoptionBytes} from '../physical_room_asset_adoption/storage.js';
import {PhysicalRoomClientOperationV3,resumePhysicalRootKeepingActors,reopenCompletedPhysicalRoot,withPhysicalOperationV3FreshRetainedNative,type RetainedRootPreparation} from '../physical_room_operation_v3/operation.js';
import {encodeSelectedRoomCurrent} from '../selected_room_current/archive.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {RetainedNativeReadBorrow} from '../complete_operation_cohort/retained_native_read.js';
import type {PhysicalOperationV3ResumeOptions} from '../physical_room_operation_v3/contract.js';
import {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import type {coldRoomExecutionPlan} from './plan.js';
import {recoveryOpeningContext,drainFailedRecoveryOpenings} from '../participant_recovery/opening_custody.js';
import {fail} from '../native_room_execution/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
const rootApi={inspect:reopenCompletedPhysicalRoot,repair:PhysicalRoomClientOperationV3.prototype.finish,close:PhysicalRoomClientOperationV3.prototype.discardAndClose},capture=RichAssetStore.prototype.captureBackup,bindings=StoppedActorCohort.prototype.bindings;
export class ColdRoomExecutionSource{
 readonly #plan;readonly #options;readonly #authority;readonly #actors;readonly #scope;readonly #factory=recoveryOpeningContext();#resources;readonly #intentDatabase;
 #root:PhysicalRoomClientOperationV3|undefined;#loan:RetainedNativeReadBorrow|undefined;#resourcesStarted=false;#resourcesReady=false;#sealing=false;#sealed=false;#last:SelectedRoomCurrentFile|undefined;
 constructor(plan:Awaited<ReturnType<typeof coldRoomExecutionPlan>>,options:PhysicalOperationV3ResumeOptions,actors:StoppedActorCohort,scope:RoomExecutionReadScope,intentDatabase:string){this.#plan=plan;this.#options=options;this.#authority=participantAuthority(options.checkAuthority);this.#actors=actors;this.#scope=scope;this.#intentDatabase=intentDatabase;this.#resources=new ColdSelectedResources(plan.adoption.choice.adoption,intentDatabase,scope.signal);Object.freeze(this);}
 #check=()=>{this.#scope.check();this.#authority();this.#scope.check();bindings.call(this.#actors);};
 async #open(){this.#check();if(this.#sealing)throw fail('room_execution_closed');if(!this.#root){for(const name of this.#plan.names)await drainFailedRecoveryOpenings(this.#factory,[name],()=>fail('room_execution_storage'));this.#check();this.#root=await resumePhysicalRootKeepingActors({...this.#options,checkAuthority:this.#check,signal:this.#scope.signal},this.#actors);this.#check();}}
 async inspect():Promise<void>{await this.#open();await rootApi.inspect(this.#root!);this.#check();}
 /** Explicit deliberate pending-source recovery, never used by inspection. */
 async repair():Promise<void>{await this.#open();await rootApi.repair.call(this.#root!);this.#check();}
 async #prepare(context:RetainedRootPreparation):Promise<void>{
  context.checkCurrent();if(this.#resourcesReady)return;if(this.#resourcesStarted){await this.#resources.abandon();this.#resources=new ColdSelectedResources(this.#plan.adoption.choice.adoption,this.#intentDatabase,this.#scope.signal);this.#resourcesStarted=false;}this.#resourcesStarted=true;
  // The genuine root supplies the exact actual factory/locks/names. The held
  // storage lifetime is deliberately the fresh cohort + job + source authority,
  // not a stale root-busy callback after original native parents have closed.
  await this.#resources.preparePinned(Object.freeze({factory:context.factory,locks:context.locks,namespaces:context.namespaces,checkCurrent:this.#check}));this.#check();this.#resourcesReady=true;
 }
 async #uploads(){const scope=this.#scope,resources=this.#resources,check=()=>{this.#check();resources.checkJob();},saved=await resources.owned.store!.readFresh(check,scope.signal);check();if(JSON.stringify(saved.record)!==JSON.stringify(resources.record)||saved.files.size!==resources.files.size||[...saved.files].some(([id,bytes])=>!sameAdoptionBytes(resources.files.get(id),bytes)))throw fail();
  const uploads=[];for(const row of resources.record.participants){const bytes=resources.files.get(row.id);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.base.bytes||await scope.integrity.digest(new Blob([bytes]))!==row.base.sha256)throw fail();check();const selected=resources.owned.targets.get(row.id)!;const value=await capture.call(selected.store,()=>{check();return undefined;},{signal:scope.signal});check();uploads.push(Object.freeze({id:row.id,database:row.targetDatabase,file:value.backup,sha256:await scope.integrity.digest(value.backup)}));check();}return Object.freeze(uploads);
 }
 async capture():Promise<SelectedRoomCurrentFile>{
  this.#check();if(this.#sealing){await this.sealNative();const uploads=await this.#uploads();if(!this.#last)throw fail();
   // Whole-store custody prevents normal mutations after the native cut. Reread
   // actual bytes anyway; a stale remembered selection is never sufficient.
   const original=this.#lastUploads();if(JSON.stringify(uploads.map(row=>({id:row.id,database:row.database,sha256:row.sha256,bytes:row.file.size})))!==JSON.stringify(original))throw fail();return this.#last;
  }
  await this.inspect();if(this.#loan){await this.#loan.close();this.#loan=undefined;}
  const scope=this.#scope;const value=await withPhysicalOperationV3FreshRetainedNative(this.#root!,{reads:scope.reads,checkAuthority:this.#check,signal:scope.signal},async(visit,borrow)=>{this.#loan=borrow;const uploads=await this.#uploads();this.#check();this.#rememberedUploads=Object.freeze(uploads.map(row=>Object.freeze({id:row.id,database:row.database,sha256:row.sha256,bytes:row.file.size})));const current=await encodeSelectedRoomCurrent({approval:this.#plan.adoption,root:visit.cut,uploads},{wasm:scope.integrity.wasm,checkAuthority:this.#check,signal:scope.signal});await visit.verify();this.#check();return current;},context=>this.#prepare(context));
  await this.#loan!.close();this.#loan=undefined;this.#check();this.#last=value;return value;
 }
 #rememberedUploads:readonly Readonly<{id:string;database:string;sha256:string;bytes:number}>[]|undefined;
 #lastUploads(){if(!this.#rememberedUploads)throw fail();return this.#rememberedUploads;}
 async sealNative():Promise<void>{
  this.#check();if(this.#sealed)return;if(!this.#last)throw fail('room_execution_closed');
  if(!this.#sealing){const uploads=await this.#uploads();if(JSON.stringify(uploads.map(row=>({id:row.id,database:row.database,sha256:row.sha256,bytes:row.file.size})))!==JSON.stringify(this.#lastUploads()))throw fail();this.#sealing=true;}
  if(this.#loan){await this.#loan.close();this.#loan=undefined;}if(this.#root){await rootApi.close.call(this.#root);this.#root=undefined;}
  for(const name of this.#plan.names)await drainFailedRecoveryOpenings(this.#factory,[name],()=>fail('room_execution_storage'));this.#check();this.#sealed=true;
 }
 /** Cleanup never needs an ongoing host grant; rejected closes keep ownership. */
 async close():Promise<void>{if(this.#loan){await this.#loan.close();this.#loan=undefined;}if(this.#root){await rootApi.close.call(this.#root);this.#root=undefined;}for(const name of this.#plan.names)await drainFailedRecoveryOpenings(this.#factory,[name],()=>fail('room_execution_storage'));await this.#resources.abandon();}
}
