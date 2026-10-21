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
import {captureSharedGenerationSource} from "../generation_source/capture.js";
import type {SharedGenerationOperationBeginOptions,SharedGenerationOperationResumeOptions,SharedGenerationOperationProgress,OperationalSharedGenerationParticipantParts} from "./contract.js";
import {prepareOperationalCohort,type OperationalCohortReservation} from "../operation_cohort/cohort.js";
export interface OperationalGenerationCustody<P extends SharedSelectionPolicy>{p:PreparedGenerationRecovery<P>;owners:GenerationRecoveryOwners<P>;origin:NativeGenerationOperationOrigin;db:IDBDatabase;recoveryDb:IDBDatabase;record:GenerationOperationRecord;leases:RecoveryLease[];life:GenerationOperationLife;currentGuard:()=>void}
type State<P extends SharedSelectionPolicy>=OperationalGenerationCustody<P>;
export interface OperationalGenerationHandoff<T>{commit():T;abandon():void}
let reserveGenerationGroup:(owners:readonly OperationalSharedGenerationParticipant<SharedSelectionPolicy>[])=>OperationalCohortReservation<State<SharedSelectionPolicy>>;
let exactGeneration:(owner:OperationalSharedGenerationParticipant<SharedSelectionPolicy>)=>Promise<void>;
/** A prepared aggregate parent may publish only the exact original native/upload cut. */
export function verifyOperationalGenerationAtOrigin(owner:OperationalSharedGenerationParticipant<SharedSelectionPolicy>):Promise<void>{return exactGeneration(owner);}
/** Internal all-or-nothing custody capsule for the generation-aware room adapter.
 * Only genuine held operation owners participate; this is not a public adoption API. */
export async function prepareOperationalGenerationHandoff<T>(owners:readonly OperationalSharedGenerationParticipant<SharedSelectionPolicy>[],take:(states:readonly State<SharedSelectionPolicy>[],released:()=>void)=>Promise<T>,verify:(states:readonly State<SharedSelectionPolicy>[])=>void,checkSources:()=>void=()=>{}):Promise<OperationalGenerationHandoff<T>>{const group=reserveOperationalGenerationGroup(owners);return prepareOperationalCohort([group],released=>take(group.states,released),()=>verify(group.states),checkSources,()=>fail("generation_operation_closed"));}
/** Internal synchronous reservation; never a public structural adoption API. */
export function reserveOperationalGenerationGroup(owners:readonly OperationalSharedGenerationParticipant<SharedSelectionPolicy>[]):OperationalCohortReservation<State<SharedSelectionPolicy>>{return reserveGenerationGroup(owners);}
const key=Object.freeze({});
async function release(db:IDBDatabase,recoveryDb:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const result=await Promise.allSettled([...leases].reverse().map(l=>l.close()));if(result.some(r=>r.status==="rejected"))throw fail();db.close();recoveryDb.close();}
/** Read the actual two retained originals and markers, not a cached phase/readiness field. */
async function retained<P extends SharedSelectionPolicy>(s:Pick<State<P>,"p"|"db"|"record"|"recoveryDb">):Promise<void>{
 const p=s.p;p.guard();const old=await readGenerationRecoveryDatabase(s.recoveryDb,p.record);p.guard();if(old.record.phase!=="ready")throw fail("generation_operation_diverged");const current=await readGenerationOperationDatabase(s.db,s.record);p.guard();if(current.record.phase!==s.record.phase)throw fail("generation_operation_diverged");
 for(const file of [old.file,current.file]){if(await generationParticipantDigest(file,p.options.signal)!==p.options.expected.sha256)throw fail("generation_operation_diverged");p.guard();}
}
export class OperationalSharedGenerationParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:State<P>;readonly #file:Blob;#closed=false;#busy=false;#released=false;
 private constructor(token:object,state:State<P>){if(token!==key)throw fail("generation_operation_closed");this.#state=state;this.#file=SharedGenerationParticipantBackup.prototype.file.call(state.p.backup);generationOperationFence(state.db,state.life);generationOperationFence(state.recoveryDb,state.life);Object.freeze(this);}
 static{
  exactGeneration=async owner=>{owner.#start();try{owner.#guard();await retained(owner.#state);await verifyOperationalGenerationOwners(owner.#state.p,owner.#state.owners,owner.#state.origin);await verifyGenerationOwners(owner.#state.p,owner.#state.owners);owner.#guard();}finally{owner.#busy=false;}};
  reserveGenerationGroup=input=>{
   if(!Array.isArray(input)||input.length>1024)throw fail("generation_operation_policy");const owners=[...input];
   if(new Set(owners).size!==owners.length)throw fail("generation_operation_policy");
   for(const owner of owners){if(!owner||typeof owner!=="object"||!(#state in owner))throw fail("generation_operation_policy");if(owner.#closed||owner.#released)throw fail("generation_operation_closed");if(owner.#busy)throw fail("generation_operation_busy");}
   for(const owner of owners)owner.#busy=true;
   return Object.freeze({states:Object.freeze(owners.map(owner=>owner.#state)),
    async verify(){for(const owner of owners){owner.#guard();await retained(owner.#state);await verifyOperationalGenerationOwners(owner.#state.p,owner.#state.owners,owner.#state.origin);owner.#guard();}},
    markReleased(){for(const owner of owners)owner.#released=true;},
    // Generation origin/capture admission already inspects canonical native
    // source bindings without reading a shadowed public core property.
    checkBindings(){},
    checkCurrent(){for(const owner of owners){if(owner.#closed||!owner.#released||!owner.#busy)throw fail("generation_operation_closed");owner.#state.currentGuard();}},
    disposeAuxiliaries(){for(const owner of owners){owner.#state.origin.dispose();owner.#state.p.backup.dispose();}},
    checkManaged(){for(const owner of owners){const s=owner.#state;generationSource(generationOwnerSource(s.p,s.owners).session).checkManaged();RichAssetStore.prototype.checkOpen.call(s.owners.uploads!);}},
    consume(){for(const owner of owners)owner.#closed=true;},
    abandon(){for(const owner of owners)owner.#busy=false;},
   });
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
   generationOperationFence(old.db,life);p.guard();const state={p,origin,owners:old.owners,db,recoveryDb:old.db,record,leases:[...old.leases,lease],life,currentGuard:guard};await retained(state);await verifyGenerationOwners(p,old.owners);await verifyOperationalGenerationOwners(p,old.owners,origin);p.guard();
   if(record.phase==="prepared"){record=await publishGenerationOperation(db,record,p.guard);state.record=record;}await retained(state);await verifyOperationalGenerationOwners(p,old.owners,origin);return state;
  },state=>{state.p.guard();state.origin.verifySource(generationOwnerSource(state.p,state.owners));});return new OperationalSharedGenerationParticipant(key,state);
  }catch(error){origin?.dispose();p?.backup.dispose();db?.close();await lease?.close();throw error;}
 }
 /** Reopen actual current generation/companion/upload stores with fresh host factories and policy. */
 static async resume<Q extends SharedSelectionPolicy>(input:SharedGenerationOperationResumeOptions<Q>):Promise<OperationalSharedGenerationParticipant<Q>>{
  const chosen=snapshotGenerationOperationResume(input),life={changed:false},guard=operationCurrentGuard(chosen.base.options.checkAuthority,chosen.base.options.signal,life),leases:RecoveryLease[]=[],owners:GenerationRecoveryOwners<Q>={};let p:PreparedGenerationRecovery<Q>|undefined,origin:NativeGenerationOperationOrigin|undefined,db:IDBDatabase|undefined,recoveryDb:IDBDatabase|undefined;guard();
  try{for(const name of [chosen.database,chosen.base.options.database,...Object.values(chosen.base.options.destinations)].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingGenerationOperationDatabase(chosen.database);generationOperationFence(db,life);const saved=await readGenerationOperationDatabase(db);guard();if(saved.record.recoveryDatabase!==chosen.base.options.database||saved.record.plan!==chosen.base.record.plan)throw fail("generation_operation_diverged");p=guardedGenerationPrepared(await prepareGenerationRecovery(chosen.base,saved.file),guard);p.guard();
   recoveryDb=await existingDatabase(p.options.database);if(!recoveryDb)throw fail("generation_operation_missing");generationOperationFence(recoveryDb,life);const record=saved.record;await retained({p,db,recoveryDb,record});origin=await NativeGenerationOperationOrigin.read(p);const state={p,owners,db,recoveryDb,record,leases,life,origin,currentGuard:guard};p.guard();await openOperationalGenerationOwners(p,owners,origin);await retained(state);await verifyOperationalGenerationOwners(p,owners,origin);
   if(record.phase==="prepared"){await verifyGenerationOwners(p,owners);state.record=await publishGenerationOperation(db,record,p.guard);await retained(state);await verifyOperationalGenerationOwners(p,owners,origin);}
   p.guard();origin.verifySource(generationOwnerSource(p,owners));return new OperationalSharedGenerationParticipant(key,state);
  }catch(error){try{await discardGenerationOwners(owners);}finally{origin?.dispose();p?.backup.dispose();if(db&&recoveryDb)await release(db,recoveryDb,leases);else{db?.close();recoveryDb?.close();for(const lease of leases.reverse())await lease.close();}}throw error;}
 }
 #guard():void{if(this.#closed||this.#released)throw fail("generation_operation_closed");this.#state.p.guard();}
 #start(requireCustody=true):void{if(this.#closed||requireCustody&&this.#released)throw fail("generation_operation_closed");if(this.#busy)throw fail("generation_operation_busy");this.#busy=true;}
 origin(){if(this.#closed)throw fail("generation_operation_closed");return generationParticipantSelection(this.#state.p.options.expected);}
 file():Blob{if(this.#closed)throw fail("generation_operation_closed");return this.#file;}
 async progress():Promise<Readonly<SharedGenerationOperationProgress>>{this.#start();try{this.#guard();await retained(this.#state);this.#guard();return Object.freeze({phase:this.#state.record.phase});}finally{this.#busy=false;}}
 async check():Promise<void>{this.#start();try{this.#guard();await retained(this.#state);await verifyOperationalGenerationOwners(this.#state.p,this.#state.owners,this.#state.origin);}finally{this.#busy=false;}}
 /** The host may continue editing/transport after transfer; saved operation intent stays retained. */
 async intoParts():Promise<Readonly<OperationalSharedGenerationParticipantParts<P>>>{
  let source:ReturnType<typeof captureSharedGenerationSource>|undefined,handoff:OperationalGenerationHandoff<OperationalSharedGenerationParticipantParts<SharedSelectionPolicy>>|undefined;
  try{handoff=await prepareOperationalGenerationHandoff([this as unknown as OperationalSharedGenerationParticipant<SharedSelectionPolicy>],async([s],markReleased)=>{const state=s!,parts=Object.freeze({source:generationOwnerSource(state.p,state.owners),uploads:state.owners.uploads!});source=captureSharedGenerationSource(parts.source);await release(state.db,state.recoveryDb,state.leases);markReleased();return parts;},states=>{for(const s of states){s.p.guard();s.origin.verifySource(generationOwnerSource(s.p,s.owners));}},()=>source!.check());return handoff.commit() as unknown as OperationalSharedGenerationParticipantParts<P>;}finally{handoff?.abandon();source?.dispose();}
 }
 /** Failed ordinary saves or custody releases remain retryable; original files are not discarded. */
 async close():Promise<void>{if(this.#closed)return;this.#start(false);try{const s=this.#state;await s.owners.session?.close();s.owners.uploads?.close();await release(s.db,s.recoveryDb,s.leases);this.#released=true;s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
 async discardAndClose():Promise<void>{if(this.#closed)return;this.#start(false);try{const s=this.#state;await discardGenerationOwners(s.owners);await release(s.db,s.recoveryDb,s.leases);this.#released=true;s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
}
