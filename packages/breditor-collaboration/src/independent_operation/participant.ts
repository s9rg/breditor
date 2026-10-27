import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** A real resumable operational participant: the new native source owns its journal,
 * while this parent holds completed recovery and whole-upload custody until final handoff.
 * No phase marker activates a room, chooses a factory, or authenticates current policy. */
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {transferRecoveredIndependentDeliveryParticipant} from '../independent_delivery_recovery/recovery.js';
import {prepareIndependentDeliveryRecovery,type PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody} from '../participant_recovery/opening_custody.js';
import {IndependentOperationCutJournal} from './cut_journal.js';
import {openJournaledIndependentDelivery,readJournaledSourceData} from './open_journaled_source.js';
import {snapshotOperationParticipant,prepareColdOperationParticipant,type OperationParticipantSnapshot} from './participant_prepare.js';
import {openOperationUploads,checkOperationUploads,operationUploadCustody} from './participant_assets.js';
import {verifyOperationParticipantOwners,operationParticipantWitness,closeOperationParticipantOwners,type OperationParticipantOwners} from './participant_owners.js';
import {verifyOperationRetainedRecovery} from './participant_retained.js';
import type {IndependentOperationParticipantOptions,IndependentOperationParticipantBeginOptions,IndependentOperationParticipantParts} from './participant_contract.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {prepareSourceUploadHandoff,type SourceUploadHandoff} from '../operation_cohort/source_handoff.js';
import {prepareOperationalCohort,type OperationalCohortReservation} from '../operation_cohort/cohort.js';
import {operationalReadReservation,type OperationalReadReservation} from '../operation_read/reservation.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {makeFreshDeliveryParentHistoryRead,type FreshDeliveryParentHistoryOptions,type FreshDeliveryParentHistoryRead} from './fresh_parent_history.js';
interface State<P extends SharedSelectionPolicy>{readonly choice:OperationParticipantSnapshot<P>;readonly p:PreparedIndependentDeliveryRecovery<P>;readonly journal:IndependentOperationCutJournal;readonly owners:OperationParticipantOwners<P>;recoveryDb:IDBDatabase;recoveryDbClosed?:boolean;readonly leases:RecoveryLease[];legacySession?:SharedIndependentDeliverySession<P>|undefined;legacyPrepared?:PreparedIndependentDeliveryRecovery<P>|undefined}
export type IndependentDeliveryParentCustody<P extends SharedSelectionPolicy=SharedSelectionPolicy>=State<P>;
const key=Object.freeze({}),closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
const names=(s:OperationParticipantSnapshot)=>[s.database,s.sourceDatabase,s.base.options.database,...Object.values(s.base.options.destinations)].sort();
async function releaseParent<P extends SharedSelectionPolicy>(s:State<P>):Promise<void>{
 const settled=await Promise.allSettled([...s.leases].reverse().map(lease=>lease.close()));if(settled.some(r=>r.status==='rejected'))throw fail('independent_operation_cleanup');
}
/** Retired archive cleanup may call a replaced inner facade. It precedes the last
 * current-policy barrier; the live source still owns its separate genuine original. */
function disposeRetiredBackup<P extends SharedSelectionPolicy>(s:State<P>):void{if(s.legacyPrepared){const retired=s.legacyPrepared;archive.dispose.call(retired.backup);s.legacyPrepared=undefined;}}
async function closeState<P extends SharedSelectionPolicy>(s:State<P>,discard:boolean):Promise<void>{
 await closeOperationParticipantOwners(s.owners,discard);if(s.legacySession){await(discard?discardSource:closeSource).call(s.legacySession);s.legacySession=undefined;}await s.journal.close();await releaseParent(s);disposeRetiredBackup(s);s.recoveryDb.close();
}
function fence<P extends SharedSelectionPolicy>(s:State<P>):void{s.recoveryDb.onversionchange=()=>{s.choice.life.changed=true;s.recoveryDb.close();};}
async function retained<P extends SharedSelectionPolicy>(s:State<P>):Promise<void>{s.choice.guard();if(s.recoveryDbClosed){const db=await existingDatabase(s.p.options.database);if(!db)throw fail('independent_operation_missing');s.recoveryDb=db;s.recoveryDbClosed=false;fence(s);s.choice.guard();}await verifyOperationRetainedRecovery(s.p,s.recoveryDb);s.choice.guard();}
function closeRecoveryHandle<P extends SharedSelectionPolicy>(s:State<P>):void{if(!s.recoveryDbClosed){s.recoveryDb.close();s.recoveryDbClosed=true;}}
const openingErrors={policy:()=>fail('independent_operation_policy'),busy:()=>fail('independent_operation_busy'),storage:()=>fail('independent_operation_cleanup')};
let reserve:<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentDeliveryParticipant<P>[])=>OperationalCohortReservation<Readonly<IndependentOperationParticipantParts<P>>>;
let reserveRead:<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentDeliveryParticipant<P>[])=>OperationalReadReservation<Readonly<IndependentOperationParticipantParts<P>>>;
let reserveFreshRead:<P extends SharedSelectionPolicy>(owner:OperationalIndependentDeliveryParticipant<P>,read:FreshDeliveryParentHistoryOptions<P>,authority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode)=>FreshDeliveryParentHistoryRead;
/** Fresh read admission never invokes the old writer/handoff grant. */
export function reserveFreshIndependentDeliveryHistoryRead<P extends SharedSelectionPolicy>(owner:OperationalIndependentDeliveryParticipant<P>,read:FreshDeliveryParentHistoryOptions<P>,checkAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode){return reserveFreshRead(owner,read,checkAuthority,signal,mode);}
/** Read-only source/upload custody. Unlike the handoff reservation, preparing
 * this scope never releases parent leases or retires retained originals. */
export function reserveIndependentDeliveryRead<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentDeliveryParticipant<P>[]):OperationalReadReservation<Readonly<IndependentOperationParticipantParts<P>>>{return reserveRead(owners);}
/** Actual complete-delivery writers join the existing shared kernel. Retained
 * packets and receipts keep their complete-delivery identity, never local-only. */
export function reserveOperationalIndependentDeliveryGroup<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentDeliveryParticipant<P>[]):OperationalCohortReservation<Readonly<IndependentOperationParticipantParts<P>>>{return reserve(owners);}
export class OperationalIndependentDeliveryParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:State<P>;readonly #file:Blob;#exposed=false;#closed=false;#busy=false;#readToken:object|undefined;
 private constructor(token:object,state:State<P>){if(token!==key)throw fail('independent_operation_closed');this.#state=state;this.#file=archive.file.call(state.p.backup);Object.freeze(this);}
 static{reserveFreshRead=(owner,read,authority,signal,mode)=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('independent_operation_policy');owner.#start();const token={};owner.#readToken=token;let released=false;
  const held=()=>{if(released||owner.#closed||!owner.#exposed||!owner.#busy||owner.#readToken!==token)throw fail('independent_operation_closed');},release=()=>{if(released)return;held();released=true;owner.#readToken=undefined;owner.#busy=false;};
  try{return makeFreshDeliveryParentHistoryRead(owner.#state,held,release,read,authority,signal,mode);}catch(error){release();throw error;}
 };}
 static{reserve=<Q extends SharedSelectionPolicy>(provided:readonly OperationalIndependentDeliveryParticipant<Q>[])=>{
  const owners=snapshotInventoryInputs(provided,()=>fail('independent_operation_policy'),owner=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('independent_operation_policy');if(!owner.#exposed||owner.#closed)throw fail('independent_operation_closed');if(owner.#busy)throw fail('independent_operation_busy');return owner;});
  if(new Set(owners).size!==owners.length)throw fail('independent_operation_policy');for(const owner of owners)owner.#busy=true;
  const witnesses:Awaited<ReturnType<typeof operationParticipantWitness>>[]=[],handoffs:SourceUploadHandoff<Readonly<IndependentOperationParticipantParts<Q>>>[]=[];let finished=false,started=false;
  const current=()=>{if(finished||handoffs.length!==owners.length)throw fail('independent_operation_closed');};
  const abandon=()=>{if(finished)return;finished=true;try{for(const h of handoffs)h.abandon();}finally{try{for(const w of witnesses)w.release();}finally{for(const owner of owners)owner.#busy=false;}}};
  try{
   const part=(index:number)=>{const h=handoffs[index];if(!h)throw fail('independent_operation_closed');return h.value;};
   const states=Object.freeze(owners.map((_,i)=>Object.freeze({get source(){return part(i).source;},get uploads(){return part(i).uploads;}})));
   return{states,assetStores:[],
    async verify(){if(finished||started)throw fail('independent_operation_busy');started=true;for(const owner of owners){const s=owner.#state;await retained(s);const w=await operationParticipantWitness(s.p,s.owners,s.journal);witnesses.push(w);await releaseParent(s);w.check();await retained(s);w.check();disposeRetiredBackup(s);w.check();closeRecoveryHandle(s);w.check();handoffs.push(prepareSourceUploadHandoff({source:s.owners.session!,check:w.check,current:w.current,uploads:()=>{operationUploadCustody.release.call(s.owners.uploadCustody!);return s.owners.uploads!;},release:w.release,closed:()=>fail('independent_operation_closed'),createParts(readSource,readUploads){const source=Object.freeze({get session(){return readSource();}});return Object.freeze({get source(){readSource();return source;},get uploads(){return readUploads();}});}}));}},
    markReleased(){current();},checkBindings(){current();},disposeAuxiliaries(){current();},
    checkCurrent(){current();for(const h of handoffs)h.check();},checkManaged(){current();for(const h of handoffs)h.checkCurrent();},
    consume(){for(const h of handoffs)h.consume();for(const owner of owners){owner.#closed=true;owner.#busy=false;}finished=true;},abandon,
   };
  }catch(error){abandon();throw error;}
 };}
 static{reserveRead=<Q extends SharedSelectionPolicy>(provided:readonly OperationalIndependentDeliveryParticipant<Q>[])=>{
  const error=()=>fail('independent_operation_busy'),owners=snapshotInventoryInputs(provided,()=>fail('independent_operation_policy'),owner=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('independent_operation_policy');owner.#readable();if(owner.#busy)throw error();return owner;});
  if(new Set(owners).size!==owners.length)throw fail('independent_operation_policy');for(const owner of owners)owner.#busy=true;
  try{return operationalReadReservation(owners.length,async index=>{
   const owner=owners[index]!,s=owner.#state;checkRecoveryLeasesHeld(s.leases);await retained(s);const witness=await operationParticipantWitness(s.p,s.owners,s.journal);let complete=false;
   const current=()=>{if(owner.#closed||!owner.#busy)throw error();checkRecoveryLeasesHeld(s.leases);witness.current();};
   try{current();const value=Object.freeze({source:Object.freeze({session:s.owners.session!}),uploads:s.owners.uploads!});
    const result={value,check:()=>{witness.check();current();},current,async verify(){checkRecoveryLeasesHeld(s.leases);await retained(s);witness.check();current();},release:witness.release};current();complete=true;return result;
   }finally{if(!complete)witness.release();}
  },()=>{for(const owner of owners)owner.#busy=false;},error);}catch(error){for(const owner of owners)owner.#busy=false;throw error;}
 };}
 static begin<Q extends SharedSelectionPolicy>(input:IndependentOperationParticipantBeginOptions<Q>):Promise<OperationalIndependentDeliveryParticipant<Q>>{return this.#fromRecovered(input,false);}
 /** Retry publication while the same genuine completed first-stage owner is still held. */
 static resumeRecovered<Q extends SharedSelectionPolicy>(input:IndependentOperationParticipantBeginOptions<Q>):Promise<OperationalIndependentDeliveryParticipant<Q>>{return this.#fromRecovered(input,true);}
 static async #fromRecovered<Q extends SharedSelectionPolicy>(input:IndependentOperationParticipantBeginOptions<Q>,resume:boolean):Promise<OperationalIndependentDeliveryParticipant<Q>>{
  const choice=snapshotOperationParticipant(input,true);let opening:RecoveryOpeningCustody|undefined,p:PreparedIndependentDeliveryRecovery<Q>|undefined,journal:IndependentOperationCutJournal|undefined,lease:RecoveryLease|undefined,state:State<Q>|undefined,transferred=false;
  try{
   const selected=await transferRecoveredIndependentDeliveryParticipant(choice.recovered!,async old=>{
    choice.guard();if(old.record.plan!==choice.base.record.plan)throw fail('independent_operation_recovery_diverged');
    opening=await RecoveryOpeningCustody.reserve(choice.context,names(choice),async()=>{if(transferred){await closeState(state!,true);return;}await journal?.close();if(p&&!journal)archive.dispose.call(p.backup);await lease?.close();},openingErrors);choice.guard();lease=await RecoveryLease.acquire(JSON.stringify(choice.sourceDatabase));choice.guard();
    p=await prepareIndependentDeliveryRecovery(choice.base,archive.file.call(old.p.backup));choice.guard();journal=await IndependentOperationCutJournal[resume?'resume':'begin']({database:choice.database,sourceDatabase:choice.sourceDatabase,prepared:p,writerRecovery:'host-reacquired'});choice.guard();
    state={choice,p,journal,owners:{uploads:old.owners.uploads!,uploadCustody:old.owners.uploadCustody!},recoveryDb:old.db,leases:[...old.leases,lease],legacySession:old.owners.session!,legacyPrepared:old.p};
    await verifyOperationRetainedRecovery(p,old.db);checkOperationUploads(state.owners);return state;
   },value=>{value.choice.guard();checkOperationUploads(value.owners);});
   transferred=true;state=selected;fence(state);choice.guard();
   // The genuine transfer above still checked the old native owner after its callback.
   // Only now may its author leases settle, while the actual upload custody stays held.
   await closeSource.call(state.legacySession!);state.legacySession=undefined;choice.guard();
   state.owners.session=await openJournaledIndependentDelivery(inheritActorLeaseInput(state.p.factory,{...state.p.factory,database:choice.sourceDatabase}),state.journal);choice.guard();await retained(state);const witness=await operationParticipantWitness(state.p,state.owners,state.journal);try{witness.check();const result=new OperationalIndependentDeliveryParticipant(key,state);witness.check();opening!.complete();result.#exposed=true;return result;}finally{witness.release();}
  }catch(error){if(opening)await opening.rollback();throw error;}
 }
 /** Cold resume reads the actual retained original, cut intent, source and whole uploads.
  * An interrupted handoff never requires manufacturing another recovered-owner marker. */
 static async resume<Q extends SharedSelectionPolicy>(input:IndependentOperationParticipantOptions<Q>):Promise<OperationalIndependentDeliveryParticipant<Q>>{
  const choice=snapshotOperationParticipant(input,false),leases:RecoveryLease[]=[],owners:OperationParticipantOwners<Q>={};let opening:RecoveryOpeningCustody|undefined,p:PreparedIndependentDeliveryRecovery<Q>|undefined,journal:IndependentOperationCutJournal|undefined,recoveryDb:IDBDatabase|undefined,state:State<Q>|undefined;
  try{
   opening=await RecoveryOpeningCustody.reserve(choice.context,names(choice),async()=>{await closeOperationParticipantOwners(owners,true);await journal?.close();if(p&&!journal)archive.dispose.call(p.backup);recoveryDb?.close();const settled=await Promise.allSettled([...leases].reverse().map(lease=>lease.close()));if(settled.some(r=>r.status==='rejected'))throw fail('independent_operation_cleanup');},openingErrors);choice.guard();
   for(const name of names(choice).filter(n=>n!==choice.database)){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));choice.guard();}
   p=await prepareColdOperationParticipant(choice);choice.guard();recoveryDb=await existingDatabase(p.options.database);choice.guard();if(!recoveryDb)throw fail('independent_operation_missing');recoveryDb.onversionchange=()=>{choice.life.changed=true;recoveryDb!.close();};await verifyOperationRetainedRecovery(p,recoveryDb);
   journal=await IndependentOperationCutJournal.resume({database:choice.database,sourceDatabase:choice.sourceDatabase,prepared:p,writerRecovery:'host-reacquired'});choice.guard();state={choice,p,journal,owners,recoveryDb,leases};await openOperationUploads(p,owners);choice.guard();owners.session=await openJournaledIndependentDelivery(inheritActorLeaseInput(p.factory,{...p.factory,database:choice.sourceDatabase}),journal);choice.guard();await retained(state);const witness=await operationParticipantWitness(p,owners,journal);try{witness.check();const result=new OperationalIndependentDeliveryParticipant(key,state);witness.check();opening.complete();result.#exposed=true;return result;}finally{witness.release();}
  }catch(error){if(opening)await opening.rollback();throw error;}
 }
 #readable():void{if(!this.#exposed||this.#closed)throw fail('independent_operation_closed');}
 #start():void{this.#readable();if(this.#busy)throw fail('independent_operation_busy');this.#busy=true;}
 file():Blob{this.#readable();return this.#file;}
 async progress(){this.#start();try{const s=this.#state;await retained(s);const cut=await s.journal.snapshot();s.choice.guard();return Object.freeze({phase:cut.current===null?'preparing' as const:'operational' as const,pending:cut.pending!==null,sequence:cut.record.sequence});}finally{this.#busy=false;}}
 async check():Promise<void>{this.#start();try{const s=this.#state;await retained(s);await verifyOperationParticipantOwners(s.p,s.owners,s.journal);}finally{this.#busy=false;}}
 /** Readable owned work is not hidden when write authority is revoked. Not a portable backup. */
 readableSource(){this.#readable();return readJournaledSourceData(this.#state.owners.session!,this.#state.journal);}
 /** Release only coordinator custody during awaits; keep source/journal and actual uploads held
  * through the final synchronous policy/native/source barrier. The source retains its own origin. */
 async intoParts():Promise<Readonly<IndependentOperationParticipantParts<P>>>{
  const group=reserveOperationalIndependentDeliveryGroup([this]),handoff=await prepareOperationalCohort([group],async()=>group.states[0]!,()=>{},()=>{},()=>fail('independent_operation_closed'));return handoff.commit();
 }
 async close():Promise<void>{return this.#close(false);}
 async discardAndClose():Promise<void>{return this.#close(true);}
 async #close(discard:boolean):Promise<void>{if(this.#closed)return;this.#start();try{await closeState(this.#state,discard);this.#closed=true;}finally{this.#busy=false;}}
}
