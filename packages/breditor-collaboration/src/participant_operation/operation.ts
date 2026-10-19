import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {participantAuthority,participantSelection} from "../participant_backup/policy.js";
import {captureSharedAssetReferences} from "../asset_references_capture.js";
import {transferRecoveredParticipant} from "../participant_recovery/recovery.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {existingDatabase,readRecoveryJournal} from "../participant_recovery/journal.js";
import type {PreparedRecovery} from "../participant_recovery/prepare.js";
import {checkComponent,ownerSources,discardRecoveryOwners,type RecoveryOwners} from "../participant_recovery/components.js";
import {ParticipantOrigin} from "./origin.js";
import {operationDestination,prepareTransferredOrigin,prepareOperationalResume} from "./prepare.js";
import {operationFailure,operationSignal,operationName,SharedParticipantOperationError} from "./errors.js";
import {operationRecord,type OperationRecord} from "./record.js";
import {createOperationDatabase} from "./create_database.js";
import {existingOperationDatabase,readOperationDatabase} from "./read_database.js";
import {publishParticipantOperation} from "./publish.js";
import {openOperationalComponents,operationPolicy} from "./components.js";
import {verifyOperationalOwners} from "./verify.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedParticipantOperationBeginOptions,SharedParticipantOperationResumeOptions,SharedParticipantOperationProgress,OperationalSharedParticipantParts} from "./types.js";

const key=Object.freeze({});
interface Life{changed:boolean}
interface State<P extends SharedSelectionPolicy>{p:PreparedRecovery<P>;origin:ParticipantOrigin;owners:RecoveryOwners<P>;db:IDBDatabase;recoveryDb:IDBDatabase;leases:RecoveryLease[];record:OperationRecord;life:Life}
function fence(db:IDBDatabase,life:Life):void{db.onversionchange=()=>{life.changed=true;db.close();};}
function guarded<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,life:Life):PreparedRecovery<P>{const before=p.guard;return{...p,guard(){if(life.changed)throw operationFailure("operation_versionchange");before();if(life.changed)throw operationFailure("operation_versionchange");}};}
function failure(error:unknown):Error{return error instanceof SharedParticipantOperationError?error:operationFailure("operation_admission");}
async function release(db:IDBDatabase,recoveryDb:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const results=await Promise.allSettled([...leases].reverse().map(lease=>lease.close()));if(results.some(r=>r.status==="rejected"))throw operationFailure();db.close();recoveryDb.close();}
async function retained<P extends SharedSelectionPolicy>(state:Pick<State<P>,"p"|"db"|"record"|"recoveryDb">):Promise<void>{
 const {p,db,record,recoveryDb}=state;p.guard();const old=await readRecoveryJournal(recoveryDb,p.record);if(old.phase!=="ready")throw operationFailure("operation_diverged");p.guard();
 const current=await readOperationDatabase(db,record);if(current.record.phase!==record.phase)throw operationFailure("operation_diverged");p.guard();
 const admitted=await SharedParticipantBackup.read(current.file,p.expected,{limits:p.limits,...(p.signal?{signal:p.signal}:{})});try{p.guard();}finally{admitted.dispose();}
}
async function exact<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,owners:RecoveryOwners<P>):Promise<void>{
 for(const step of p.record.steps)if(step.step!=="uploads")checkComponent(p,owners,step.step);
 const source=captureSharedAssetReferences(ownerSources(p,owners));try{await p.backup.verifyRecovered(source,owners.uploads!,p.signal?{signal:p.signal}:{});}finally{source.dispose();}p.guard();
}
function snapshot<P extends SharedSelectionPolicy>(input:SharedParticipantOperationResumeOptions<P>):SharedParticipantOperationResumeOptions<P>{
 const o=input.session.options,options={...o,...("review" in o?{review:{...o.review}}:{}),...("relay" in o&&o.relay?{relay:{...o.relay}}:{}),...("reviewedHistory" in o&&o.reviewedHistory?{reviewedHistory:{...o.reviewedHistory}}:{}),...(o.editor?{editor:{...o.editor}}:{})};
 return{...input,expected:participantSelection(input.expected),destinations:{...input.destinations},session:{kind:input.session.kind,options} as SharedParticipantOperationResumeOptions<P>["session"],...(input.suggestions?{suggestions:{...input.suggestions,identity:{...input.suggestions.identity}}}:{}),...(input.revisions?{revisions:{...input.revisions}}:{}),...(input.versions?{versions:{...input.versions,identity:{...input.versions.identity}}}:{}),...(input.limits?{limits:{...input.limits}}:{}),currentPolicy:operationPolicy(input.currentPolicy,input.session.kind.includes("paired"))};
}
/** Durable storage custody, not account authentication, provider closure or room activation. */
export class OperationalSharedParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:State<P>;#closed=false;#busy=false;
 private constructor(token:object,state:State<P>){if(token!==key)throw operationFailure("operation_closed");this.#state=state;fence(state.db,state.life);fence(state.recoveryDb,state.life);Object.freeze(this);}
 /** Publish retained origin and operational intent before transferring genuine completed custody. */
 static async begin<Q extends SharedSelectionPolicy>(supplied:SharedParticipantOperationBeginOptions<Q>):Promise<OperationalSharedParticipant<Q>>{
  const input={...supplied,expected:participantSelection(supplied.expected)},life={changed:false};operationName(input.database);const authority=participantAuthority(input.checkAuthority),guard=()=>{operationSignal(input.signal);if(life.changed)throw operationFailure("operation_versionchange");authority();operationSignal(input.signal);};guard();
  let backup:SharedParticipantBackup|undefined,origin:ParticipantOrigin|undefined,db:IDBDatabase|undefined,lease:RecoveryLease|undefined;
  try{
   const state=await transferRecoveredParticipant(input.recovered,async old=>{
    guard();operationDestination(input.database,old.prepared);if(JSON.stringify(input.expected)!==JSON.stringify(old.prepared.expected))throw operationFailure("operation_diverged");lease=await RecoveryLease.acquire(JSON.stringify(input.database));guard();
    backup=await SharedParticipantBackup.read(old.prepared.backup.file(),input.expected,{limits:old.prepared.limits,...(input.signal?{signal:input.signal}:{})});guard();
    const p=guarded(await prepareTransferredOrigin(old.prepared,backup,input.checkAuthority,input.signal),life);if(p.record.plan!==old.prepared.record.plan)throw operationFailure("operation_diverged");origin=await ParticipantOrigin.read(p as unknown as PreparedRecovery<SharedSelectionPolicy>);p.guard();
    let record=operationRecord(p.database,p.record.plan);db=await createOperationDatabase(input.database,record,backup.file(),p.guard,p.signal);fence(db,life);p.guard();
    const held={p,origin,owners:old.owners,db,recoveryDb:old.db,leases:[...old.leases,lease!],record,life};await retained(held);await verifyOperationalOwners(p,old.owners,origin);record=await publishParticipantOperation(db,record,p.guard,p.signal);held.record=record;p.guard();await retained(held);await verifyOperationalOwners(p,old.owners,origin);return held;
   });
   return new OperationalSharedParticipant(key,state);
  }catch(error){origin?.dispose();backup?.dispose();db?.close();await lease?.close();throw failure(error);}
 }
 /** Reopen retained source and actual current journals with fresh explicit native policies. */
 static async resume<Q extends SharedSelectionPolicy>(supplied:SharedParticipantOperationResumeOptions<Q>):Promise<OperationalSharedParticipant<Q>>{
  const input=snapshot(supplied),life={changed:false},authority=participantAuthority(input.checkAuthority),guard=()=>{operationSignal(input.signal);if(life.changed)throw operationFailure("operation_versionchange");authority();operationSignal(input.signal);};
  const names=[input.database,input.recoveryDatabase,...Object.values(input.destinations)];for(const name of names)operationName(name);if(new Set(names).size!==names.length)throw operationFailure("operation_policy");guard();
  const leases:RecoveryLease[]=[],owners:RecoveryOwners<Q>={};let backup:SharedParticipantBackup|undefined,origin:ParticipantOrigin|undefined,db:IDBDatabase|undefined,recoveryDb:IDBDatabase|undefined;
  try{
   for(const name of names.sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingOperationDatabase(input.database,current=>fence(current,life));const saved=await readOperationDatabase(db);guard();if(saved.record.recoveryDatabase!==input.recoveryDatabase)throw operationFailure("operation_diverged");
   backup=await SharedParticipantBackup.read(saved.file,input.expected,{...(input.limits?{limits:input.limits}:{}),...(input.signal?{signal:input.signal}:{})});guard();const p=guarded(await prepareOperationalResume(input,backup),life);operationDestination(input.database,p);let record=saved.record;if(record.plan!==p.record.plan)throw operationFailure("operation_diverged");
   recoveryDb=await existingDatabase(p.database);if(!recoveryDb)throw operationFailure("operation_missing");fence(recoveryDb,life);const old=await readRecoveryJournal(recoveryDb,p.record);p.guard();if(old.phase!=="ready")throw operationFailure("operation_diverged");
   origin=await ParticipantOrigin.read(p as unknown as PreparedRecovery<SharedSelectionPolicy>);p.guard();await openOperationalComponents(p,origin,input.currentPolicy,owners);p.guard();const state={p,origin,owners,db,recoveryDb,leases,record,life};await retained(state);await verifyOperationalOwners(p,owners,origin);
   if(record.phase==="prepared"){await exact(p,owners);record=await publishParticipantOperation(db,record,p.guard,p.signal);state.record=record;p.guard();await retained(state);await verifyOperationalOwners(p,owners,origin);}
   return new OperationalSharedParticipant(key,state);
  }catch(error){try{await discardRecoveryOwners(owners);}finally{origin?.dispose();backup?.dispose();if(db&&recoveryDb)await release(db,recoveryDb,leases);else{db?.close();recoveryDb?.close();for(const lease of leases.reverse())await lease.close();}}throw failure(error);}
 }
 #guard():void{if(this.#closed)throw operationFailure("operation_closed");this.#state.p.guard();}
 /** Original immutable selection, never current role or activation authority. */
 origin(){if(this.#closed)throw operationFailure("operation_closed");return participantSelection(this.#state.p.expected);}
 /** Durable phase only. Actual checks still read native owners and current component data. */
 async progress():Promise<Readonly<SharedParticipantOperationProgress>>{if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{this.#guard();await retained(this.#state);this.#guard();return Object.freeze({phase:this.#state.record.phase});}finally{this.#busy=false;}}
 async #verify():Promise<void>{this.#guard();await retained(this.#state);await verifyOperationalOwners(this.#state.p,this.#state.owners,this.#state.origin);this.#guard();}
 async check():Promise<void>{if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{await this.#verify();}finally{this.#busy=false;}}
 /** Release coordination only after actual continuity checks; native author leases stay with parts. */
 async intoParts():Promise<Readonly<OperationalSharedParticipantParts<P>>>{
  if(this.#closed)throw operationFailure("operation_closed");if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;
  try{await this.#verify();const s=this.#state,parts=Object.freeze({sources:Object.freeze(ownerSources(s.p,s.owners)),session:s.owners.session!,uploads:s.owners.uploads!});await release(s.db,s.recoveryDb,s.leases);s.origin.dispose();s.p.backup.dispose();this.#closed=true;return parts;}finally{this.#busy=false;}
 }
 /** Save ordinary owners before releasing custody. Failed saves/releases remain retryable. */
 async close():Promise<void>{if(this.#closed)return;if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{const s=this.#state,o=s.owners;await o.revisions?.close();await o.suggestions?.close();await o.versions?.close();await o.session?.close();o.uploads?.close();await release(s.db,s.recoveryDb,s.leases);s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
 /** Explicitly discard private unsaved state, retaining every committed operation/source/store file. */
 async discardAndClose():Promise<void>{if(this.#closed)return;if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{const s=this.#state;await discardRecoveryOwners(s.owners);await release(s.db,s.recoveryDb,s.leases);s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
}
