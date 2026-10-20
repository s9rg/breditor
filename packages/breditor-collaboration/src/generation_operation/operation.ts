/** Continued native operation from genuine recovery custody. Stored readiness grants no authority. */
import {transferRecoveredGenerationParticipant} from "../generation_participant/recovery.js";
import {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {generationParticipantDigest} from "../generation_participant/codec.js";
import {generationParticipantSelection} from "../generation_participant/policy.js";
import {prepareGenerationRecovery,type PreparedGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import {readGenerationRecoveryDatabase} from "../generation_participant/recovery_database.js";
import {verifyGenerationOwners,discardGenerationOwners,generationOwnerSource,type GenerationRecoveryOwners} from "../generation_participant/recovery_components.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import type {SharedSelectionPolicy} from "../types.js";
import {NativeGenerationOperationOrigin} from "./origin.js";
import {beginGenerationOperationSnapshot,operationCurrentGuard,prepareTransferredGenerationOperation,guardedGenerationPrepared,operationDatabaseName,snapshotGenerationOperationResume,generationOperationFence,type GenerationOperationLife} from "./prepare.js";
import {createGenerationOperationDatabase,existingGenerationOperationDatabase,readGenerationOperationDatabase,generationOperationRecord,publishGenerationOperation,type GenerationOperationRecord} from "./database.js";
import {openOperationalGenerationOwners,verifyOperationalGenerationOwners} from "./components.js";
import {generationOperationFailure as fail} from "./policy.js";
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {generationSource} from "../generation_source/admission.js";
import type {SharedGenerationOperationBeginOptions,SharedGenerationOperationResumeOptions,SharedGenerationOperationProgress,OperationalSharedGenerationParticipantParts} from "./contract.js";
export interface OperationalGenerationCustody<P extends SharedSelectionPolicy>{p:PreparedGenerationRecovery<P>;owners:GenerationRecoveryOwners<P>;origin:NativeGenerationOperationOrigin;db:IDBDatabase;recoveryDb:IDBDatabase;record:GenerationOperationRecord;leases:RecoveryLease[];life:GenerationOperationLife}
type State<P extends SharedSelectionPolicy>=OperationalGenerationCustody<P>;
export interface OperationalGenerationHandoff<T>{commit():T;abandon():void}
let prepareGenerationGroup:<T>(owners:readonly OperationalSharedGenerationParticipant<SharedSelectionPolicy>[],take:(states:readonly State<SharedSelectionPolicy>[],released:()=>void)=>Promise<T>,verify:(states:readonly State<SharedSelectionPolicy>[])=>void)=>Promise<OperationalGenerationHandoff<T>>;
/** Internal all-or-nothing custody capsule for the generation-aware room adapter.
 * Only genuine held operation owners participate; this is not a public adoption API. */
export function prepareOperationalGenerationHandoff<T>(owners:readonly OperationalSharedGenerationParticipant<SharedSelectionPolicy>[],take:(states:readonly State<SharedSelectionPolicy>[],released:()=>void)=>Promise<T>,verify:(states:readonly State<SharedSelectionPolicy>[])=>void):Promise<OperationalGenerationHandoff<T>>{return prepareGenerationGroup(owners,take,verify);}
const key=Object.freeze({});
async function release(db:IDBDatabase,recoveryDb:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const result=await Promise.allSettled([...leases].reverse().map(l=>l.close()));if(result.some(r=>r.status==="rejected"))throw fail();db.close();recoveryDb.close();}
/** Read the actual two retained originals and markers, not a cached phase/readiness field. */
async function retained<P extends SharedSelectionPolicy>(s:Pick<State<P>,"p"|"db"|"record"|"recoveryDb">):Promise<void>{
 const p=s.p;p.guard();const old=await readGenerationRecoveryDatabase(s.recoveryDb,p.record);p.guard();if(old.record.phase!=="ready")throw fail("generation_operation_diverged");const current=await readGenerationOperationDatabase(s.db,s.record);p.guard();if(current.record.phase!==s.record.phase)throw fail("generation_operation_diverged");
 for(const file of [old.file,current.file]){if(await generationParticipantDigest(file,p.options.signal)!==p.options.expected.sha256)throw fail("generation_operation_diverged");p.guard();}
}
export class OperationalSharedGenerationParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:State<P>;#closed=false;#busy=false;#released=false;
 private constructor(token:object,state:State<P>){if(token!==key)throw fail("generation_operation_closed");this.#state=state;generationOperationFence(state.db,state.life);generationOperationFence(state.recoveryDb,state.life);Object.freeze(this);}
 static{
  prepareGenerationGroup=async(input,take,verify)=>{
   if(!Array.isArray(input)||input.length>1024)throw fail("generation_operation_policy");const owners=[...input];
   if(new Set(owners).size!==owners.length)throw fail("generation_operation_policy");
   for(const owner of owners){if(!owner||typeof owner!=="object"||!(#state in owner))throw fail("generation_operation_policy");if(owner.#closed||owner.#released)throw fail("generation_operation_closed");if(owner.#busy)throw fail("generation_operation_busy");}
   for(const owner of owners)owner.#busy=true;
   let offered=false,finished=false;const abandon=()=>{if(finished)return;finished=true;for(const owner of owners)owner.#busy=false;};
   try{
    for(const owner of owners){owner.#guard();await retained(owner.#state);await verifyOperationalGenerationOwners(owner.#state.p,owner.#state.owners,owner.#state.origin);owner.#guard();}
    const states=owners.map(owner=>owner.#state),result=await take(states,()=>{for(const owner of owners)owner.#released=true;});
    const handoff=Object.freeze({commit(){
     if(finished)throw fail("generation_operation_closed");
     try{
      verify(states);
      // All current host guards precede the pure private-custody sweep. No await
      // or host callback remains between that sweep and consuming the cohort.
      // The cohort now holds cleanup-only children: releasing their external
      // leases intentionally closed the individual handoff paths. Validate the
      // capsule's private custody and current authority, not those public paths.
      for(const owner of owners){if(owner.#closed||!owner.#released||!owner.#busy)throw fail("generation_operation_closed");owner.#state.p.guard();}
      for(const owner of owners){const s=owner.#state;generationSource(generationOwnerSource(s.p,s.owners).session).checkManaged();RichAssetStore.prototype.checkOpen.call(s.owners.uploads!);}
      for(const owner of owners){owner.#state.origin.dispose();owner.#state.p.backup.dispose();owner.#closed=true;}
      return result;
     }finally{abandon();}
    },abandon});offered=true;return handoff;
   }finally{if(!offered)abandon();}
  };
 }
 /** Insert operational intent, verify, publish, then transfer the still-held native/source leases. */
 static begin<Q extends SharedSelectionPolicy>(options:SharedGenerationOperationBeginOptions<Q>):Promise<OperationalSharedGenerationParticipant<Q>>{return this.#fromRecovered(options,false);}
 /** Retry an interrupted publication while the original genuine completed owner is still held. */
 static resumeRecovered<Q extends SharedSelectionPolicy>(options:SharedGenerationOperationBeginOptions<Q>):Promise<OperationalSharedGenerationParticipant<Q>>{return this.#fromRecovered(options,true);}
 static async #fromRecovered<Q extends SharedSelectionPolicy>(options:SharedGenerationOperationBeginOptions<Q>,resume:boolean):Promise<OperationalSharedGenerationParticipant<Q>>{
  const input=beginGenerationOperationSnapshot(options),life={changed:false},guard=operationCurrentGuard(input.checkAuthority,input.signal,life);guard();let p:PreparedGenerationRecovery<Q>|undefined,origin:NativeGenerationOperationOrigin|undefined,db:IDBDatabase|undefined,lease:RecoveryLease|undefined;
  try{const state=await transferRecoveredGenerationParticipant(input.recovered,async old=>{
   guard();operationDatabaseName(input.database,old.p);if(JSON.stringify(input.expected)!==JSON.stringify(old.p.options.expected))throw fail("generation_operation_diverged");lease=await RecoveryLease.acquire(JSON.stringify(input.database));guard();
   p=guardedGenerationPrepared(await prepareTransferredGenerationOperation(old.p,SharedGenerationParticipantBackup.prototype.file.call(old.p.backup),input.checkAuthority,input.signal),guard);if(p.record.plan!==old.p.record.plan)throw fail("generation_operation_diverged");origin=await NativeGenerationOperationOrigin.read(p);p.guard();let record=generationOperationRecord(p.options.database,p.record.plan);
   if(resume){db=await existingGenerationOperationDatabase(input.database);generationOperationFence(db,life);record=(await readGenerationOperationDatabase(db,record)).record;}else{db=await createGenerationOperationDatabase(input.database,record,SharedGenerationParticipantBackup.prototype.file.call(p.backup),p.guard);generationOperationFence(db,life);}
   generationOperationFence(old.db,life);p.guard();const state={p,origin,owners:old.owners,db,recoveryDb:old.db,record,leases:[...old.leases,lease],life};await retained(state);await verifyGenerationOwners(p,old.owners);await verifyOperationalGenerationOwners(p,old.owners,origin);p.guard();
   if(record.phase==="prepared"){record=await publishGenerationOperation(db,record,p.guard);state.record=record;}await retained(state);await verifyOperationalGenerationOwners(p,old.owners,origin);return state;
  },state=>{state.p.guard();state.origin.verifySource(generationOwnerSource(state.p,state.owners));});return new OperationalSharedGenerationParticipant(key,state);
  }catch(error){origin?.dispose();p?.backup.dispose();db?.close();await lease?.close();throw error;}
 }
 /** Reopen actual current generation/companion/upload stores with fresh host factories and policy. */
 static async resume<Q extends SharedSelectionPolicy>(input:SharedGenerationOperationResumeOptions<Q>):Promise<OperationalSharedGenerationParticipant<Q>>{
  const chosen=snapshotGenerationOperationResume(input),life={changed:false},guard=operationCurrentGuard(chosen.base.options.checkAuthority,chosen.base.options.signal,life),leases:RecoveryLease[]=[],owners:GenerationRecoveryOwners<Q>={};let p:PreparedGenerationRecovery<Q>|undefined,origin:NativeGenerationOperationOrigin|undefined,db:IDBDatabase|undefined,recoveryDb:IDBDatabase|undefined;guard();
  try{for(const name of [chosen.database,chosen.base.options.database,...Object.values(chosen.base.options.destinations)].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingGenerationOperationDatabase(chosen.database);generationOperationFence(db,life);const saved=await readGenerationOperationDatabase(db);guard();if(saved.record.recoveryDatabase!==chosen.base.options.database||saved.record.plan!==chosen.base.record.plan)throw fail("generation_operation_diverged");p=guardedGenerationPrepared(await prepareGenerationRecovery(chosen.base,saved.file),guard);p.guard();
   recoveryDb=await existingDatabase(p.options.database);if(!recoveryDb)throw fail("generation_operation_missing");generationOperationFence(recoveryDb,life);const record=saved.record;await retained({p,db,recoveryDb,record});origin=await NativeGenerationOperationOrigin.read(p);const state={p,owners,db,recoveryDb,record,leases,life,origin};p.guard();await openOperationalGenerationOwners(p,owners,origin);await retained(state);await verifyOperationalGenerationOwners(p,owners,origin);
   if(record.phase==="prepared"){await verifyGenerationOwners(p,owners);state.record=await publishGenerationOperation(db,record,p.guard);await retained(state);await verifyOperationalGenerationOwners(p,owners,origin);}
   p.guard();origin.verifySource(generationOwnerSource(p,owners));return new OperationalSharedGenerationParticipant(key,state);
  }catch(error){try{await discardGenerationOwners(owners);}finally{origin?.dispose();p?.backup.dispose();if(db&&recoveryDb)await release(db,recoveryDb,leases);else{db?.close();recoveryDb?.close();for(const lease of leases.reverse())await lease.close();}}throw error;}
 }
 #guard():void{if(this.#closed||this.#released)throw fail("generation_operation_closed");this.#state.p.guard();}
 #start(requireCustody=true):void{if(this.#closed||requireCustody&&this.#released)throw fail("generation_operation_closed");if(this.#busy)throw fail("generation_operation_busy");this.#busy=true;}
 origin(){if(this.#closed)throw fail("generation_operation_closed");return generationParticipantSelection(this.#state.p.options.expected);}
 file():Blob{if(this.#closed)throw fail("generation_operation_closed");return SharedGenerationParticipantBackup.prototype.file.call(this.#state.p.backup);}
 async progress():Promise<Readonly<SharedGenerationOperationProgress>>{this.#start();try{this.#guard();await retained(this.#state);this.#guard();return Object.freeze({phase:this.#state.record.phase});}finally{this.#busy=false;}}
 async check():Promise<void>{this.#start();try{this.#guard();await retained(this.#state);await verifyOperationalGenerationOwners(this.#state.p,this.#state.owners,this.#state.origin);}finally{this.#busy=false;}}
 /** The host may continue editing/transport after transfer; saved operation intent stays retained. */
 async intoParts():Promise<Readonly<OperationalSharedGenerationParticipantParts<P>>>{
  this.#start();try{const s=this.#state;this.#guard();await retained(s);await verifyOperationalGenerationOwners(s.p,s.owners,s.origin);const parts=Object.freeze({source:generationOwnerSource(s.p,s.owners),uploads:s.owners.uploads!});await release(s.db,s.recoveryDb,s.leases);this.#released=true;s.p.guard();s.origin.verifySource(parts.source);RichAssetStore.prototype.checkOpen.call(parts.uploads);s.origin.dispose();s.p.backup.dispose();this.#closed=true;return parts;}finally{this.#busy=false;}
 }
 /** Failed ordinary saves or custody releases remain retryable; original files are not discarded. */
 async close():Promise<void>{if(this.#closed)return;this.#start(false);try{const s=this.#state;await s.owners.session?.close();s.owners.uploads?.close();await release(s.db,s.recoveryDb,s.leases);this.#released=true;s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
 async discardAndClose():Promise<void>{if(this.#closed)return;this.#start(false);try{const s=this.#state;await discardGenerationOwners(s.owners);await release(s.db,s.recoveryDb,s.leases);this.#released=true;s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
}
