import {RecoveryCleanupScope,type RecoveryCleanupTicket} from '../participant_recovery/cleanup_scope.js';
import {managedSourceCore} from "../managed_custody.js";
import {retainInternalFailureCause} from "../internal_failure_cause.js";
import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {participantAuthority,participantSelection} from "../participant_backup/policy.js";
import {captureSharedAssetReferences,SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {transferRecoveredParticipant} from "../participant_recovery/recovery.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {RecoveryOpeningCustody,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
import {existingDatabase,readRecoveryJournal} from "../participant_recovery/journal.js";
import type {PreparedRecovery} from "../participant_recovery/prepare.js";
import {checkComponent,checkManagedRecoveryOwners,checkRecoveryOwnerBindings,ownerSources,discardRecoveryOwners,type RecoveryOwners} from "../participant_recovery/components.js";
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
import type {SharedRichEditor} from "../core.js";
import type {SharedParticipantOperationBeginOptions,SharedParticipantOperationResumeOptions,SharedParticipantOperationProgress,OperationalSharedParticipantParts} from "./types.js";
import {prepareOperationalCohort,type OperationalCohortReservation} from "../operation_cohort/cohort.js";
import {createOriginalOperationalRecordRead,type OperationalParentRecordRead} from '../operation_read/parent_records.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {checkManagedSource} from '../managed_custody.js';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {readOriginalOperationalRecords} from './read_records.js';
import {captureOriginalRecordReferences,type OriginalRecordReferenceMetadata} from '../persistence/original_record_reference_capture.js';
import type {OriginalReferenceRestore,OriginalReferenceEditor} from '../persistence/original_reference_replay.js';
import {parentReferenceOptions} from '../operation_read/reference_options.js';
import {originalHistoryRecords} from './history_records.js';
import {captureOriginalRecordReferencesAfterOrigins,type OriginalRecordReferenceCapture} from '../persistence/original_record_reference_capture.js';
import {composeOperationalHistoryReferences,type OperationalHistoryReferenceMetadata} from '../operation_read/history_references.js';
import type {OperationalParentReferenceRead} from '../operation_read/reference_read.js';

const key=Object.freeze({});
const checkHandoffSource=SharedAssetReferenceCapture.prototype.check,disposeHandoffSource=SharedAssetReferenceCapture.prototype.dispose;
interface Life{changed:boolean}
export interface OperationalParticipantCustody<P extends SharedSelectionPolicy>{p:PreparedRecovery<P>;origin:ParticipantOrigin;owners:RecoveryOwners<P>;db:IDBDatabase;recoveryDb:IDBDatabase;leases:RecoveryLease[];record:OperationRecord;life:Life;currentGuard:()=>void}
type State<P extends SharedSelectionPolicy>=OperationalParticipantCustody<P>;
export interface OperationalParticipantHandoff<T>{commit():T;abandon():void}
let reserveOperationalGroup:(owners:readonly OperationalSharedParticipant<SharedSelectionPolicy>[])=>OperationalCohortReservation<State<SharedSelectionPolicy>>;
let exactOperational:<P extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<P>)=>Promise<void>;
let resumeHeld:<P extends SharedSelectionPolicy>(options:SharedParticipantOperationBeginOptions<P>)=>Promise<OperationalSharedParticipant<P>>;
export interface OriginalOperationalReferenceOptions{readonly restore:OriginalReferenceRestore;readonly editor?:OriginalReferenceEditor;readonly checkAuthority:()=>void;readonly signal?:AbortSignal}
export type OriginalOperationalRecordRead=OperationalParentRecordRead<OriginalOperationalReferenceOptions,OriginalRecordReferenceMetadata>;
let captureParentRecords:<P extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<P>,authority:()=>void,signal?:AbortSignal)=>Promise<OriginalOperationalRecordRead>;
let captureHistoryReferences:<P extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<P>,options:OriginalOperationalReferenceOptions)=>Promise<OperationalParentReferenceRead<OperationalHistoryReferenceMetadata<OriginalRecordReferenceMetadata>>>;
/** Fresh read authorization, not the parent's old writer grant or handoff gate. */
export function captureOriginalOperationalRecords<P extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<P>,checkAuthority:()=>void,signal?:AbortSignal){return captureParentRecords(owner,checkAuthority,signal);}
/** Explicit archive-plus-current scope. Preserves the source-only reader's
 * defaults, and owns a fresh parent reservation until this opaque read closes. */
export function captureOriginalOperationalHistoryReferences<P extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<P>,options:OriginalOperationalReferenceOptions){return captureHistoryReferences(owner,options);}
/** Internal aggregate custody: keep every genuine child busy, then verify and consume all together. */
export async function prepareOperationalParticipantHandoff<T>(owners:readonly OperationalSharedParticipant<SharedSelectionPolicy>[],take:(states:readonly State<SharedSelectionPolicy>[],released:()=>void)=>Promise<T>,verify:(states:readonly State<SharedSelectionPolicy>[])=>void,checkSources:()=>void=()=>{}):Promise<OperationalParticipantHandoff<T>>{const group=reserveOperationalParticipantGroup(owners);return prepareOperationalCohort([group],released=>take(group.states,released),()=>verify(group.states),checkSources,()=>operationFailure("operation_closed"));}
/** Internal synchronous reservation for the common mixed-family barrier. */
export function reserveOperationalParticipantGroup(owners:readonly OperationalSharedParticipant<SharedSelectionPolicy>[]):OperationalCohortReservation<State<SharedSelectionPolicy>>{return reserveOperationalGroup(owners);}
export function verifyOperationalParticipantAtOrigin<P extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<P>):Promise<void>{return exactOperational(owner);}
export function resumeOperationalFromRecovered<P extends SharedSelectionPolicy>(options:SharedParticipantOperationBeginOptions<P>):Promise<OperationalSharedParticipant<P>>{return resumeHeld(options);}
function fence(db:IDBDatabase,life:Life):void{db.onversionchange=()=>{life.changed=true;db.close();};}
function guarded<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,life:Life):PreparedRecovery<P>{const before=p.guard;return{...p,guard(){if(life.changed)throw operationFailure("operation_versionchange");before();if(life.changed)throw operationFailure("operation_versionchange");}};}
function failure(error:unknown):Error{return error instanceof SharedParticipantOperationError?error:retainInternalFailureCause(operationFailure("operation_admission"),error);}
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
 readonly #state:State<P>;#closed=false;#busy=false;#released=false;
 readonly #readCleanup=new RecoveryCleanupScope(()=>operationFailure());#failedReadCleanup=false;
 private constructor(token:object,state:State<P>){if(token!==key)throw operationFailure("operation_closed");this.#state=state;fence(state.db,state.life);fence(state.recoveryDb,state.life);Object.freeze(this);}
 static{
  captureHistoryReferences=async(owner,provided)=>{
   const o=parentReferenceOptions(provided,'restore'),parent=await captureParentRecords(owner,o.checkAuthority,o.signal);let capture:OriginalRecordReferenceCapture|undefined,complete=false;const cleanup=owner.#readCleanup.retain(async()=>{capture?.dispose();parent.dispose();});
   try{const s=owner.#state,check=()=>parent.check(),stored=await readOriginalOperationalRecords(s,check,o.signal);check();const origins=await originalHistoryRecords(s,stored.files[0]!.file,check,o.signal);check();const read=await captureOriginalRecordReferencesAfterOrigins({source:s.owners.session!,restore:o.restore,checkAuthority:check,...(o.editor!==undefined?{editor:o.editor}:{}),...(o.signal!==undefined?{signal:o.signal}:{}),...(s.owners.versions?{versions:s.owners.versions}:{}),...(s.owners.revisions?{revisions:s.owners.revisions}:s.owners.suggestions?{suggestions:s.owners.suggestions}:{})},origins);capture=read.capture;check();const result=composeOperationalHistoryReferences('original',parent,capture,read.origins);result.check();cleanup.complete();complete=true;return result;}
   finally{if(!complete)await owner.#rollbackRead(cleanup);}
  };
  captureParentRecords=async<Q extends SharedSelectionPolicy>(owner:OperationalSharedParticipant<Q>,provided:()=>void,signal?:AbortSignal)=>{
   if(!owner||typeof owner!=='object'||!(#state in owner))throw operationFailure('operation_policy');if(owner.#closed||owner.#released)throw operationFailure('operation_closed');if(owner.#failedReadCleanup)await owner.#drainReadCleanup();if(owner.#busy)throw operationFailure('operation_in_use');const authority=participantAuthority(provided);owner.#busy=true;
   const s=owner.#state,session=s.owners.session,uploads=s.owners.uploads,queue=s.owners.suggestions,revisions=s.owners.revisions,versions=s.owners.versions;let observation:OperationalReadCancellation|undefined,result:OriginalOperationalRecordRead|undefined,released=false,complete=false;
   const release=()=>{if(released)return;released=true;try{observation?.close();}finally{owner.#busy=false;}};
   const cleanup=owner.#readCleanup.retain(async()=>{if(result)result.dispose();else release();});
   const current=()=>{if(released||owner.#closed||owner.#released||!owner.#busy||s.life.changed||s.owners.session!==session||s.owners.uploads!==uploads||s.owners.suggestions!==queue||s.owners.revisions!==revisions||s.owners.versions!==versions||!session||!uploads)throw operationFailure('operation_diverged');checkRecoveryLeasesHeld(s.leases);checkRecoveryOwnerBindings(s.owners);const core=managedSourceCore(session);checkManagedSource(session,core);for(const selected of[queue,revisions,versions])if(selected&&managedSourceCore(selected)!==core)throw operationFailure('operation_diverged');RichAssetStore.prototype.checkOpen.call(uploads);observation?.check(()=>operationFailure('operation_aborted'));};
   const check=()=>{current();authority();current();};
   try{observation=new OperationalReadCancellation(signal);check();const stored=await readOriginalOperationalRecords(s,check,signal);check();result=createOriginalOperationalRecordRead<OriginalOperationalReferenceOptions,OriginalRecordReferenceMetadata>(stored.metadata,{check,current,readReferences:async provided=>{const o=parentReferenceOptions(provided,'restore'),readAuthority=participantAuthority(o.checkAuthority),guard=()=>{check();readAuthority();current();};return captureOriginalRecordReferences({source:session!,restore:o.restore,checkAuthority:guard,...(o.editor!==undefined?{editor:o.editor}:{}),...(o.signal!==undefined?{signal:o.signal}:{}),...(versions?{versions}:{}),...(revisions?{revisions}:queue?{suggestions:queue}:{})});},files:()=>stored.files,verify:async()=>{check();const actual=await readOriginalOperationalRecords(s,check,signal);check();if(JSON.stringify(actual.metadata)!==JSON.stringify(stored.metadata))throw operationFailure('operation_diverged');},release});result.check();cleanup.complete();complete=true;return result;}
   finally{if(!complete)await owner.#rollbackRead(cleanup);}
  };
  resumeHeld=options=>this.#fromRecovered(options,true);
  exactOperational=async owner=>{if(owner.#failedReadCleanup)await owner.#drainReadCleanup();if(owner.#busy)throw operationFailure("operation_in_use");owner.#busy=true;try{await owner.#verify();await exact(owner.#state.p,owner.#state.owners);owner.#guard();}finally{owner.#busy=false;}};
  reserveOperationalGroup=input=>{
   if(!Array.isArray(input)||input.length>1024)throw operationFailure("operation_policy");const owners=[...input];
   if(new Set(owners).size!==owners.length)throw operationFailure("operation_policy");
   for(const owner of owners){if(!owner||typeof owner!=="object"||!(#state in owner))throw operationFailure("operation_policy");if(owner.#closed||owner.#released)throw operationFailure("operation_closed");if(owner.#busy)throw operationFailure("operation_in_use");}
   for(const owner of owners)owner.#busy=true;
   return Object.freeze({states:Object.freeze(owners.map(owner=>owner.#state)),assetStores:Object.freeze(owners.map(owner=>owner.#state.owners.uploads!)),
    async verify(){for(const owner of owners)await owner.#verify();},
    markReleased(){for(const owner of owners)owner.#released=true;},
    checkBindings(){for(const owner of owners)checkRecoveryOwnerBindings(owner.#state.owners);},
    checkCurrent(){for(const owner of owners){if(owner.#closed||!owner.#released||!owner.#busy)throw operationFailure("operation_closed");owner.#state.currentGuard();}},
    disposeAuxiliaries(){for(const owner of owners){owner.#state.origin.dispose();owner.#state.p.backup.dispose();}},
    checkManaged(){for(const owner of owners)checkManagedRecoveryOwners(owner.#state.owners);},
    consume(){for(const owner of owners)owner.#closed=true;},
    abandon(){for(const owner of owners)owner.#busy=false;},
   });
  };
 }
 /** Publish retained origin and operational intent before transferring genuine completed custody. */
 static begin<Q extends SharedSelectionPolicy>(supplied:SharedParticipantOperationBeginOptions<Q>):Promise<OperationalSharedParticipant<Q>>{return this.#fromRecovered(supplied,false);}
 static async #fromRecovered<Q extends SharedSelectionPolicy>(supplied:SharedParticipantOperationBeginOptions<Q>,resume:boolean):Promise<OperationalSharedParticipant<Q>>{
  const input={...supplied,expected:participantSelection(supplied.expected)},life={changed:false};operationName(input.database);const authority=participantAuthority(input.checkAuthority),guard=()=>{operationSignal(input.signal);if(life.changed)throw operationFailure("operation_versionchange");authority();if(life.changed)throw operationFailure("operation_versionchange");operationSignal(input.signal);};guard();
  let backup:SharedParticipantBackup|undefined,origin:ParticipantOrigin|undefined,db:IDBDatabase|undefined,lease:RecoveryLease|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   const state=await transferRecoveredParticipant(input.recovered,async old=>{
    guard();operationDestination(input.database,old.prepared);if(JSON.stringify(input.expected)!==JSON.stringify(old.prepared.expected))throw operationFailure("operation_diverged");
    // No owner can be returned on refusal. Keep the actual new coordinator and
    // temporary readers reachable if rollback itself fails; never close old owners.
    opening=await RecoveryOpeningCustody.reserve(recoveryOpeningContext(),[input.database],async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>origin?.dispose()),Promise.resolve().then(()=>backup?.dispose()),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==="rejected"))throw operationFailure();},{policy:()=>operationFailure("operation_policy"),busy:()=>operationFailure("operation_in_use"),storage:()=>operationFailure()});guard();lease=await RecoveryLease.acquire(JSON.stringify(input.database));guard();
    backup=await SharedParticipantBackup.read(old.prepared.backup.file(),input.expected,{limits:old.prepared.limits,...(input.signal?{signal:input.signal}:{})});guard();
    const p=guarded(await prepareTransferredOrigin(old.prepared,backup,input.checkAuthority,input.signal),life);if(p.record.plan!==old.prepared.record.plan)throw operationFailure("operation_diverged");origin=await ParticipantOrigin.read(p as unknown as PreparedRecovery<SharedSelectionPolicy>);p.guard();
    let record=operationRecord(p.database,p.record.plan);if(resume){db=await existingOperationDatabase(input.database,current=>fence(current,life));record=(await readOperationDatabase(db,record)).record;}else db=await createOperationDatabase(input.database,record,backup.file(),p.guard,p.signal);fence(db,life);p.guard();
    const held={p,origin,owners:old.owners,db,recoveryDb:old.db,leases:[...old.leases,lease!],record,life,currentGuard:guard};await retained(held);await verifyOperationalOwners(p,old.owners,origin);if(record.phase==="prepared")record=await publishParticipantOperation(db,record,p.guard,p.signal);held.record=record;p.guard();await retained(held);await verifyOperationalOwners(p,old.owners,origin);return held;
   });
   const result=new OperationalSharedParticipant(key,state);opening!.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw failure(error);}
 }
 /** Reopen retained source and actual current journals with fresh explicit native policies. */
 static async resume<Q extends SharedSelectionPolicy>(supplied:SharedParticipantOperationResumeOptions<Q>):Promise<OperationalSharedParticipant<Q>>{
  const input=snapshot(supplied),life={changed:false},authority=participantAuthority(input.checkAuthority),guard=()=>{operationSignal(input.signal);if(life.changed)throw operationFailure("operation_versionchange");authority();if(life.changed)throw operationFailure("operation_versionchange");operationSignal(input.signal);};
  const names=[input.database,input.recoveryDatabase,...Object.values(input.destinations)];for(const name of names)operationName(name);if(new Set(names).size!==names.length)throw operationFailure("operation_policy");guard();
  const leases:RecoveryLease[]=[],owners:RecoveryOwners<Q>={};let backup:SharedParticipantBackup|undefined,origin:ParticipantOrigin|undefined,db:IDBDatabase|undefined,recoveryDb:IDBDatabase|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   opening=await RecoveryOpeningCustody.reserve(recoveryOpeningContext(),names,async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>discardRecoveryOwners(owners)),Promise.resolve().then(()=>origin?.dispose()),Promise.resolve().then(()=>backup?.dispose()),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>recoveryDb?.close()),...[...leases].reverse().map(lease=>Promise.resolve().then(()=>lease.close()))]);if(results.some(row=>row.status==="rejected"))throw operationFailure();},{policy:()=>operationFailure("operation_policy"),busy:()=>operationFailure("operation_in_use"),storage:()=>operationFailure()});guard();for(const name of names.sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingOperationDatabase(input.database,current=>fence(current,life));const saved=await readOperationDatabase(db);guard();if(saved.record.recoveryDatabase!==input.recoveryDatabase)throw operationFailure("operation_diverged");
   backup=await SharedParticipantBackup.read(saved.file,input.expected,{...(input.limits?{limits:input.limits}:{}),...(input.signal?{signal:input.signal}:{})});guard();const p=guarded(await prepareOperationalResume(input,backup),life);operationDestination(input.database,p);let record=saved.record;if(record.plan!==p.record.plan)throw operationFailure("operation_diverged");
   recoveryDb=await existingDatabase(p.database);if(!recoveryDb)throw operationFailure("operation_missing");fence(recoveryDb,life);const old=await readRecoveryJournal(recoveryDb,p.record);p.guard();if(old.phase!=="ready")throw operationFailure("operation_diverged");
   origin=await ParticipantOrigin.read(p as unknown as PreparedRecovery<SharedSelectionPolicy>);p.guard();await openOperationalComponents(p,origin,input.currentPolicy,owners);p.guard();const state={p,origin,owners,db,recoveryDb,leases,record,life,currentGuard:guard};await retained(state);await verifyOperationalOwners(p,owners,origin);
   if(record.phase==="prepared"){await exact(p,owners);record=await publishParticipantOperation(db,record,p.guard,p.signal);state.record=record;p.guard();await retained(state);await verifyOperationalOwners(p,owners,origin);}
   const result=new OperationalSharedParticipant(key,state);opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw failure(error);}
 }
 /** No read permission is renewed by cleanup. Failed actual closures remain
  * owned here even when opening never returned a facade to its caller. */
 async #rollbackRead(ticket:RecoveryCleanupTicket):Promise<void>{try{await ticket.rollback();}catch(error){this.#failedReadCleanup=true;throw error;}}
 async #drainReadCleanup():Promise<void>{await this.#readCleanup.drain();this.#failedReadCleanup=this.#readCleanup.pending;}
 #guard():void{if(this.#closed||this.#released)throw operationFailure("operation_closed");this.#state.p.guard();}
 /** Original immutable selection, never current role or activation authority. */
 origin(){if(this.#closed)throw operationFailure("operation_closed");return participantSelection(this.#state.p.expected);}
 /** Durable phase only. Actual checks still read native owners and current component data. */
 async progress():Promise<Readonly<SharedParticipantOperationProgress>>{if(this.#failedReadCleanup)await this.#drainReadCleanup();if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{this.#guard();await retained(this.#state);this.#guard();return Object.freeze({phase:this.#state.record.phase});}finally{this.#busy=false;}}
 async #verify():Promise<void>{this.#guard();await retained(this.#state);await verifyOperationalOwners(this.#state.p,this.#state.owners,this.#state.origin);this.#guard();checkManagedRecoveryOwners(this.#state.owners);}
 async check():Promise<void>{if(this.#failedReadCleanup)await this.#drainReadCleanup();if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{await this.#verify();}finally{this.#busy=false;}}
 /** Release coordination only after actual continuity checks; native author leases stay with parts. */
 async intoParts():Promise<Readonly<OperationalSharedParticipantParts<P>>>{
  if(this.#failedReadCleanup)await this.#drainReadCleanup();
  let source:ReturnType<typeof captureSharedAssetReferences>|undefined,handoff:OperationalParticipantHandoff<OperationalSharedParticipantParts<SharedSelectionPolicy>>|undefined;
  try{handoff=await prepareOperationalParticipantHandoff([this as unknown as OperationalSharedParticipant<SharedSelectionPolicy>],async([s],markReleased)=>{const state=s!,parts=Object.freeze({sources:Object.freeze(ownerSources(state.p,state.owners)),session:state.owners.session!,uploads:state.owners.uploads!});source=captureSharedAssetReferences(parts.sources);await release(state.db,state.recoveryDb,state.leases);markReleased();return parts;},states=>{for(const s of states){s.p.guard();s.origin.verify(managedSourceCore(s.owners.session!) as SharedRichEditor<SharedSelectionPolicy>);}},()=>checkHandoffSource.call(source!));return handoff.commit() as unknown as OperationalSharedParticipantParts<P>;}finally{handoff?.abandon();if(source)disposeHandoffSource.call(source);}
 }
 /** Save ordinary owners before releasing custody. Failed saves/releases remain retryable. */
 async close():Promise<void>{if(this.#closed)return;if(this.#failedReadCleanup)await this.#drainReadCleanup();if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{const s=this.#state,o=s.owners;await o.revisions?.close();await o.suggestions?.close();await o.versions?.close();await o.session?.close();o.uploads?.close();await release(s.db,s.recoveryDb,s.leases);s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
 /** Explicitly discard private unsaved state, retaining every committed operation/source/store file. */
 async discardAndClose():Promise<void>{if(this.#closed)return;if(this.#failedReadCleanup)await this.#drainReadCleanup();if(this.#busy)throw operationFailure("operation_in_use");this.#busy=true;try{const s=this.#state;await discardRecoveryOwners(s.owners);await release(s.db,s.recoveryDb,s.leases);s.origin.dispose();s.p.backup.dispose();this.#closed=true;}finally{this.#busy=false;}}
}
