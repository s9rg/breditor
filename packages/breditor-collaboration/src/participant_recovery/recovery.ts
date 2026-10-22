import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {captureSharedAssetReferences,SharedAssetReferenceCapture,type SharedAssetReferenceCaptureOptions} from "../asset_references_capture.js";
import {holdOperationalAssets,type OperationalAssetCustody} from '../operation_cohort/assets.js';
import type {RichAssetStore} from "@breditor/experimental-rich-content";
import {prepareRecovery,type PreparedRecovery} from "./prepare.js";
import {RecoveryLease} from "./lease.js";
import {createRecoveryJournal,existingDatabase,readRecoveryJournal,writeRecoveryJournal,type RecoveryRecord} from "./journal.js";
import {requireAbsent} from "./inspect.js";
import {restoreComponent,checkComponent,checkManagedRecoveryOwners,ownerSources,discardRecoveryOwners,type RecoveryOwners,type RecoverySession} from "./components.js";
import {recoveryFailure} from "./errors.js";
import {RecoveryCleanupScope} from "./cleanup_scope.js";
import {RecoveryOpeningCustody,recoveryOpeningContext} from "./opening_custody.js";
import {commitReadyPreparationRetargets,type ReadyPreparationRetarget} from "./ready_retarget.js";
import type {SharedParticipantRecoveryOptions,SharedParticipantRecoveryProgress} from "./types.js";
import type {SharedSelectionPolicy} from "../types.js";
const recoveryKey=Object.freeze({});
const checkHandoffSource=SharedAssetReferenceCapture.prototype.check,disposeHandoffSource=SharedAssetReferenceCapture.prototype.dispose;
export interface ReadyState<P extends SharedSelectionPolicy>{prepared:PreparedRecovery<P>;owners:RecoveryOwners<P>;db:IDBDatabase;leases:RecoveryLease[]}
export interface RecoveredSharedParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly sources:SharedAssetReferenceCaptureOptions<P>;readonly session:RecoverySession<P>;readonly uploads:RichAssetStore}
async function verify<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,owners:RecoveryOwners<P>):Promise<void>{
 p.guard();checkManagedRecoveryOwners(owners);const source=captureSharedAssetReferences(ownerSources(p,owners));try{await SharedParticipantBackup.prototype.verifyRecovered.call(p.backup,source,owners.uploads!,p.signal?{signal:p.signal}:{});}finally{source.dispose();}p.guard();checkManagedRecoveryOwners(owners);
}
async function release(db:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const results=await Promise.allSettled([...leases].reverse().map(lease=>lease.close()));if(results.some(r=>r.status==="rejected"))throw recoveryFailure("recovery_storage");db.close();}
let readyFactory:<P extends SharedSelectionPolicy>(state:ReadyState<P>)=>RecoveredSharedParticipant<P>;
let transferReady:<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedParticipant<P>,take:(state:ReadyState<P>)=>Promise<T>)=>Promise<T>;
let retargetReady:(values:readonly {owner:RecoveredSharedParticipant<SharedSelectionPolicy>;prepared:PreparedRecovery<SharedSelectionPolicy>}[])=>ReadyPreparationRetarget;
/** Pure, genuine-owner retarget capsule. Construction and validation consume no owner. */
export function prepareRecoveredPreparationRetargets(values:readonly {owner:RecoveredSharedParticipant<SharedSelectionPolicy>;prepared:PreparedRecovery<SharedSelectionPolicy>}[]):ReadyPreparationRetarget{return retargetReady(values);}
/** Internal atomic guard handoff for genuine parent-owned, exact ready participants. */
export function retargetRecoveredPreparations(values:readonly {owner:RecoveredSharedParticipant<SharedSelectionPolicy>;prepared:PreparedRecovery<SharedSelectionPolicy>}[]):void{commitReadyPreparationRetargets([retargetReady(values)]);}
/** Internal custody transfer keeps native and coordinator leases held; no detached ready DTO. */
export function transferRecoveredParticipant<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedParticipant<P>,take:(state:ReadyState<P>)=>Promise<T>):Promise<T>{return transferReady(owner,take);}
/** Held native owners and an exact completion record, not an authenticated connection/activation grant. */
export class RecoveredSharedParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly sources;readonly session;readonly uploads;readonly #state:ReadyState<P>;#closed=false;#busy=false;#released=false;
 private constructor(token:object,state:ReadyState<P>){if(token!==recoveryKey)throw recoveryFailure("recovery_closed");this.#state=state;this.sources=Object.freeze(ownerSources(state.prepared,state.owners));this.session=state.owners.session!;this.uploads=state.owners.uploads!;Object.freeze(this);}
 static{
  retargetReady=values=>{
   if(!Array.isArray(values)||values.length>1024||new Set(values.map(value=>value.owner)).size!==values.length)throw recoveryFailure("recovery_policy");
   const selected=values.map(({owner,prepared})=>{if(!owner||typeof owner!=="object"||!(#state in owner))throw recoveryFailure("recovery_policy");return{owner,prepared,before:owner.#state.prepared};});
   const validate=()=>{for(const {owner,prepared:p,before}of selected){if(owner.#closed||owner.#released||owner.#busy||owner.#state.prepared!==before||p.backup!==before.backup||p.database!==before.database||p.record.plan!==before.record.plan)throw recoveryFailure("recovery_diverged");checkManagedRecoveryOwners(owner.#state.owners);}};validate();
   return Object.freeze({validate,commit(){for(const {owner,prepared}of selected)owner.#state.prepared=prepared;}});
  };
  readyFactory=<Q extends SharedSelectionPolicy>(state:ReadyState<Q>)=>new RecoveredSharedParticipant(recoveryKey,state);
  transferReady=async<Q extends SharedSelectionPolicy,T>(owner:RecoveredSharedParticipant<Q>,take:(state:ReadyState<Q>)=>Promise<T>)=>{
   if(owner.#closed||owner.#released)throw recoveryFailure("recovery_closed");if(owner.#busy)throw recoveryFailure("recovery_in_use");owner.#busy=true;
   try{const state=owner.#state,{prepared:p,owners,db}=state;await verify(p,owners);if((await readRecoveryJournal(db,p.record)).phase!=="ready")throw recoveryFailure("recovery_diverged");p.guard();
    const result=await take(state);await verify(p,owners);if((await readRecoveryJournal(db,p.record)).phase!=="ready")throw recoveryFailure("recovery_diverged");p.guard();checkManagedRecoveryOwners(owners);owner.#closed=true;return result;
   }finally{owner.#busy=false;}
  };
 }
 /** Revalidate the actual owners and retained completion before releasing only coordinator locks. */
 async intoParts():Promise<Readonly<RecoveredSharedParticipantParts<P>>>{
  if(this.#closed||this.#released)throw recoveryFailure("recovery_closed");if(this.#busy)throw recoveryFailure("recovery_in_use");this.#busy=true;
  let assets:OperationalAssetCustody|undefined;
  try{const {prepared:p,owners,db,leases}=this.#state;assets=await holdOperationalAssets([owners.uploads!]);await verify(p,owners);const record=await readRecoveryJournal(db,p.record);if(record.phase!=="ready")throw recoveryFailure("recovery_diverged");p.guard();const source=captureSharedAssetReferences(ownerSources(p,owners));try{await release(db,leases);this.#released=true;p.guard();checkHandoffSource.call(source);checkManagedRecoveryOwners(owners);assets.check();assets.release();this.#closed=true;return Object.freeze({sources:this.sources,session:this.session,uploads:this.uploads});}finally{disposeHandoffSource.call(source);}}finally{assets?.release();this.#busy=false;}
 }
 /** Graceful close retains failures for retry through the original owner close contracts. */
 async close():Promise<void>{if(this.#closed)return;if(this.#busy)throw recoveryFailure("recovery_in_use");this.#busy=true;try{const {owners,db,leases}=this.#state;await owners.revisions?.close();await owners.suggestions?.close();await owners.versions?.close();await owners.session?.close();owners.uploads?.close();await release(db,leases);this.#closed=true;}finally{this.#busy=false;}}
 /** Explicit abandonment never deletes any committed journal, upload or recovery record. */
 async discardAndClose():Promise<void>{if(this.#closed)return;if(this.#busy)throw recoveryFailure("recovery_in_use");this.#busy=true;try{await discardRecoveryOwners(this.#state.owners);await release(this.#state.db,this.#state.leases);this.#closed=true;}finally{this.#busy=false;}}
}
/** Durable per-participant restart coordinator. Original stored families and startup stay unchanged. */
export class SharedParticipantRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #prepared:PreparedRecovery<P>;readonly #db:IDBDatabase;readonly #leases:RecoveryLease[];#record:RecoveryRecord;#closed=false;#closing=false;#running:Promise<RecoveredSharedParticipant<P>>|undefined;
 readonly #rollback=new RecoveryCleanupScope(()=>recoveryFailure("recovery_storage"));
 private constructor(token:object,p:PreparedRecovery<P>,db:IDBDatabase,leases:RecoveryLease[],record:RecoveryRecord){if(token!==recoveryKey)throw recoveryFailure("recovery_closed");this.#prepared=p;this.#db=db;this.#leases=leases;this.#record=record;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);}
 static begin<Q extends SharedSelectionPolicy>(options:SharedParticipantRecoveryOptions<Q>):Promise<SharedParticipantRecovery<Q>>{return this.#open(options,false);}
 static resume<Q extends SharedSelectionPolicy>(options:SharedParticipantRecoveryOptions<Q>):Promise<SharedParticipantRecovery<Q>>{return this.#open(options,true);}
 static async #open<Q extends SharedSelectionPolicy>(options:SharedParticipantRecoveryOptions<Q>,resume:boolean):Promise<SharedParticipantRecovery<Q>>{
  const p=await prepareRecovery(options),leases:RecoveryLease[]=[],names=[p.database,...Object.values(p.destinations)].sort();let db:IDBDatabase|undefined,transferred=false;p.guard();const context=recoveryOpeningContext();
  const opening=await RecoveryOpeningCustody.reserve(context,names,async()=>{
   const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),...[...leases].reverse().map(lease=>Promise.resolve().then(()=>lease.close()))]);if(results.some(r=>r.status==="rejected"))throw recoveryFailure("recovery_storage");
  },{policy:()=>recoveryFailure("recovery_policy"),busy:()=>recoveryFailure("recovery_in_use"),storage:()=>recoveryFailure("recovery_storage")});
  try{for(const name of names){p.guard();leases.push(await RecoveryLease.acquire(JSON.stringify(name)));p.guard();}
   if(resume){db=await existingDatabase(p.database);if(!db)throw recoveryFailure("recovery_missing");const record=await readRecoveryJournal(db,p.record);p.guard();const result=new SharedParticipantRecovery(recoveryKey,p,db,leases,record);opening.complete();transferred=true;return result;}
   for(const name of Object.values(p.destinations)){p.guard();await requireAbsent(name);}p.guard();db=await createRecoveryJournal(p.database,p.record);p.guard();const result=new SharedParticipantRecovery(recoveryKey,p,db,leases,p.record);opening.complete();transferred=true;return result;
  }finally{if(!transferred)await opening.rollback();}
 }
 #guard():void{if(this.#closed||this.#closing)throw recoveryFailure("recovery_closed");this.#prepared.guard();}
 /** Durable markers only. Finish always inspects and natively reopens every actual component. */
 async progress():Promise<SharedParticipantRecoveryProgress>{this.#guard();const record=await readRecoveryJournal(this.#db,this.#prepared.record);this.#guard();if(JSON.stringify(record)!==JSON.stringify(this.#record))throw recoveryFailure("recovery_diverged");return Object.freeze({phase:record.phase,steps:Object.freeze(record.steps.map(s=>Object.freeze({...s})))});}
 async #update(next:RecoveryRecord):Promise<void>{this.#guard();await writeRecoveryJournal(this.#db,this.#record,next,this.#prepared.signal);this.#guard();this.#record=next;}
 finish():Promise<RecoveredSharedParticipant<P>>{this.#guard();if(this.#running)return this.#running;if(this.#rollback.pending)throw recoveryFailure("recovery_in_use");this.#running=this.#finish().finally(()=>{this.#running=undefined;});return this.#running;}
 async #finish():Promise<RecoveredSharedParticipant<P>>{
  const p=this.#prepared,owners:RecoveryOwners<P>={},cleanup=this.#rollback.retain(()=>discardRecoveryOwners(owners));let transferred=false;
  try{await this.progress();for(const [index,row]of this.#record.steps.entries()){
    this.#guard();if(row.state==="reserved"){await requireAbsent(p.destinations[row.step]!);await this.#update({...this.#record,steps:this.#record.steps.map((r,i)=>i===index?{...r,state:"started"}:r)});}
    await restoreComponent(p,owners,row.step,row.state==="complete");this.#guard();
    for(const ready of this.#record.steps.slice(0,index+1))if(ready.step!=="uploads")checkComponent(p,owners,ready.step);
    if(row.state!=="complete")await this.#update({...this.#record,steps:this.#record.steps.map((r,i)=>i===index?{...r,state:"complete"}:r)});
   }
   await verify(p,owners);this.#guard();await this.progress();if(this.#record.phase!=="ready")await this.#update({...this.#record,phase:"ready"});this.#guard();await this.progress();
   checkManagedRecoveryOwners(owners);const result=readyFactory({prepared:p,owners,db:this.#db,leases:this.#leases});cleanup.complete();this.#closed=true;transferred=true;return result;
  }finally{if(!transferred)await cleanup.rollback();}
 }
 /** Wait for private in-flight cleanup, then release handles; retain all committed destinations. */
 async close():Promise<void>{if(this.#closed)return;this.#closing=true;try{await this.#running;}catch{/* The caller of finish retains its original failure. */}if(this.#closed)return;await this.#rollback.drain();await release(this.#db,this.#leases);this.#closed=true;}
}
