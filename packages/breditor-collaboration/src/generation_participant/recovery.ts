/** Restartable, non-overwriting generation source + whole-upload recovery. Never activates a room. */
import {RecoveryLease} from "../participant_recovery/lease.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import {requireAbsent} from "../participant_recovery/inspect.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {RichAssetStore} from "@breditor/experimental-rich-content";
import type {SharedGenerationSourceSelection} from "../generation_source/contract.js";
import {generationSource} from "../generation_source/admission.js";
import {SharedGenerationParticipantBackup} from "./backup.js";
import {generationParticipantDigest} from "./codec.js";
import {generationParticipantFailure as fail} from "./policy.js";
import {snapshotGenerationRecovery,prepareGenerationRecovery,type PreparedGenerationRecovery} from "./prepare_recovery.js";
import {createGenerationRecoveryDatabase,readGenerationRecoveryDatabase,writeGenerationRecoveryRecord,type GenerationRecoveryRecord} from "./recovery_database.js";
import {restoreGenerationSource,restoreGenerationUploads,checkGenerationOwner,verifyGenerationOwners,discardGenerationOwners,generationOwnerSource,type GenerationRecoveryOwners} from "./recovery_components.js";
import type {SharedGenerationParticipantRecoveryOptions,SharedGenerationParticipantResumeOptions,SharedGenerationParticipantRecoveryProgress} from "./recovery_contract.js";
const key=Object.freeze({});
export interface RecoveredGenerationCustody<P extends SharedSelectionPolicy>{p:PreparedGenerationRecovery<P>;owners:GenerationRecoveryOwners<P>;db:IDBDatabase;leases:RecoveryLease[];record:GenerationRecoveryRecord}
type ReadyState<P extends SharedSelectionPolicy>=RecoveredGenerationCustody<P>;
let recoveredGeneration:<P extends SharedSelectionPolicy>(state:ReadyState<P>)=>RecoveredSharedGenerationParticipant<P>;
let transferGeneration:<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedGenerationParticipant<P>,take:(state:ReadyState<P>)=>Promise<T>,verify:(value:T)=>void)=>Promise<T>;
/** Internal actual custody transfer. Never an archive/metadata adoption hook. */
export function transferRecoveredGenerationParticipant<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedGenerationParticipant<P>,take:(state:ReadyState<P>)=>Promise<T>,verify:(value:T)=>void):Promise<T>{return transferGeneration(owner,take,verify);}
async function release(db:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const result=await Promise.allSettled([...leases].reverse().map(l=>l.close()));if(result.some(r=>r.status==="rejected"))throw fail();db.close();}
async function retained<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,db:IDBDatabase,accepted:readonly GenerationRecoveryRecord[]):Promise<GenerationRecoveryRecord>{
 p.guard();const r=await readGenerationRecoveryDatabase(db,p.record);p.guard();if(!accepted.some(a=>JSON.stringify(a)===JSON.stringify(r.record)))throw fail("generation_participant_diverged");if(await generationParticipantDigest(r.file,p.options.signal)!==p.options.expected.sha256)throw fail("generation_participant_integrity");p.guard();return r.record;
}
export interface RecoveredSharedGenerationParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:SharedGenerationSourceSelection<P>;readonly uploads:RichAssetStore}
export class RecoveredSharedGenerationParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:ReadyState<P>;#closed=false;#busy=false;#released=false;
 private constructor(token:object,state:ReadyState<P>){if(token!==key)throw fail("generation_participant_closed");this.#state=state;Object.freeze(this);}
 static{recoveredGeneration=<Q extends SharedSelectionPolicy>(state:ReadyState<Q>)=>new RecoveredSharedGenerationParticipant(key,state);
  transferGeneration=async(owner,take,verify)=>{if(owner.#closed||owner.#released)throw fail("generation_participant_closed");if(owner.#busy)throw fail("generation_participant_busy");owner.#busy=true;try{const s=owner.#state;await retained(s.p,s.db,[s.record]);await verifyGenerationOwners(s.p,s.owners);await retained(s.p,s.db,[s.record]);s.p.guard();const value=await take(s);s.p.guard();verify(value);owner.#closed=true;s.p.backup.dispose();return value;}finally{owner.#busy=false;}};
 }
 file():Blob{if(this.#closed)throw fail("generation_participant_closed");return SharedGenerationParticipantBackup.prototype.file.call(this.#state.p.backup);}
 /** Verify actual retained data/native owners, then transfer still-held source leases to the caller. */
 async intoParts():Promise<Readonly<RecoveredSharedGenerationParticipantParts<P>>>{
  if(this.#closed||this.#released)throw fail("generation_participant_closed");if(this.#busy)throw fail("generation_participant_busy");this.#busy=true;try{const {p,owners,db,leases,record}=this.#state;await retained(p,db,[record]);await verifyGenerationOwners(p,owners);await retained(p,db,[record]);p.guard();const parts=Object.freeze({source:generationOwnerSource(p,owners),uploads:owners.uploads!});await release(db,leases);this.#released=true;p.guard();generationSource(parts.source.session).checkManaged();this.#closed=true;p.backup.dispose();return parts;}finally{this.#busy=false;}
 }
 async close():Promise<void>{if(this.#closed)return;if(this.#busy)throw fail("generation_participant_busy");this.#busy=true;try{const {p,owners,db,leases}=this.#state;await owners.session?.close();owners.uploads?.close();await release(db,leases);this.#closed=true;p.backup.dispose();}finally{this.#busy=false;}}
 async discardAndClose():Promise<void>{if(this.#closed)return;if(this.#busy)throw fail("generation_participant_busy");this.#busy=true;try{const {p,owners,db,leases}=this.#state;await discardGenerationOwners(owners);await release(db,leases);this.#closed=true;p.backup.dispose();}finally{this.#busy=false;}}
}
export class SharedGenerationParticipantRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #p:PreparedGenerationRecovery<P>;readonly #db:IDBDatabase;readonly #leases:RecoveryLease[];#record:GenerationRecoveryRecord;#pending:GenerationRecoveryRecord|undefined;#closed=false;#closing=false;#running:Promise<RecoveredSharedGenerationParticipant<P>>|undefined;
 private constructor(token:object,p:PreparedGenerationRecovery<P>,db:IDBDatabase,leases:RecoveryLease[],record:GenerationRecoveryRecord){if(token!==key)throw fail("generation_participant_closed");this.#p=p;this.#db=db;this.#leases=leases;this.#record=record;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);}
 static begin<Q extends SharedSelectionPolicy>(options:SharedGenerationParticipantRecoveryOptions<Q>):Promise<SharedGenerationParticipantRecovery<Q>>{return this.#open(options,false);}
 static resume<Q extends SharedSelectionPolicy>(options:SharedGenerationParticipantResumeOptions<Q>):Promise<SharedGenerationParticipantRecovery<Q>>{return this.#open(options,true);}
 static async #open<Q extends SharedSelectionPolicy>(input:SharedGenerationParticipantRecoveryOptions<Q>|SharedGenerationParticipantResumeOptions<Q>,resume:boolean):Promise<SharedGenerationParticipantRecovery<Q>>{
  const base=snapshotGenerationRecovery(input,!resume),leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,p:PreparedGenerationRecovery<Q>|undefined,transferred=false;
  try{for(const name of [base.options.database,...Object.values(base.options.destinations)].sort()){base.guard();leases.push(await RecoveryLease.acquire(JSON.stringify(name)));base.guard();}
   if(resume){db=await existingDatabase(base.options.database);base.guard();if(!db)throw fail("generation_participant_missing");const stored=await readGenerationRecoveryDatabase(db,base.record);base.guard();p=await prepareGenerationRecovery(base,stored.file);base.guard();transferred=true;return new SharedGenerationParticipantRecovery(key,p,db,leases,stored.record);}
   const file=SharedGenerationParticipantBackup.prototype.file.call((input as SharedGenerationParticipantRecoveryOptions<Q>).backup);p=await prepareGenerationRecovery(base,file);base.guard();for(const name of Object.values(base.options.destinations)){await requireAbsent(name);base.guard();}db=await createGenerationRecoveryDatabase(base.options.database,base.record,file);base.guard();await retained(p,db,[base.record]);transferred=true;return new SharedGenerationParticipantRecovery(key,p,db,leases,base.record);
  }finally{if(!transferred){db?.close();p?.backup.dispose();for(const l of leases.reverse())await l.close();}}
 }
 #guard():void{if(this.#closed||this.#closing)throw fail("generation_participant_closed");this.#p.guard();}
 /** Readable original file survives cancellation/version-change failure until explicit close. */
 file():Blob{if(this.#closed)throw fail("generation_participant_closed");return SharedGenerationParticipantBackup.prototype.file.call(this.#p.backup);}
 /** Durable markers only; finish always re-inspects and natively reopens actual components. */
 async progress():Promise<SharedGenerationParticipantRecoveryProgress>{this.#guard();const r=await retained(this.#p,this.#db,[this.#record,...(this.#pending?[this.#pending]:[])]);this.#guard();return Object.freeze({phase:r.phase,source:r.source,uploads:r.uploads});}
 async #update(next:GenerationRecoveryRecord):Promise<void>{this.#guard();this.#pending=next;try{await writeGenerationRecoveryRecord(this.#db,this.#record,next,()=>this.#guard());this.#guard();this.#record=next;}finally{this.#pending=undefined;}}
 finish():Promise<RecoveredSharedGenerationParticipant<P>>{this.#guard();if(this.#running)return this.#running;this.#running=this.#finish().finally(()=>{this.#running=undefined;});return this.#running;}
 async #finish():Promise<RecoveredSharedGenerationParticipant<P>>{
  const p=this.#p,owners:GenerationRecoveryOwners<P>={};let transferred=false;
  try{await this.progress();for(const step of ["source","uploads"] as const){this.#guard();const state=this.#record[step];if(state==="reserved"){await requireAbsent(p.options.destinations[step]);await this.#update({...this.#record,[step]:"started"});}
    if(step==="source")await restoreGenerationSource(p,owners,state==="complete");else await restoreGenerationUploads(p,owners,state==="complete");this.#guard();checkGenerationOwner(p,owners);if(state!=="complete")await this.#update({...this.#record,[step]:"complete"});
   }
   await verifyGenerationOwners(p,owners);this.#guard();await this.progress();if(this.#record.phase!=="ready")await this.#update({...this.#record,phase:"ready"});await this.progress();this.#guard();
   const result=recoveredGeneration({p,owners,db:this.#db,leases:this.#leases,record:this.#record});this.#closed=true;transferred=true;return result;
  }finally{if(!transferred)await discardGenerationOwners(owners);}
 }
 async close():Promise<void>{if(this.#closed)return;this.#closing=true;try{await this.#running;}catch{/* finish retains the original failure; committed destinations stay intact. */}if(this.#closed)return;await release(this.#db,this.#leases);this.#closed=true;this.#p.backup.dispose();}
}
