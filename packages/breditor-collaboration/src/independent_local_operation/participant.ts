/** Complete local operational custody. The native source owns its journal and
 * original provider; this parent owns whole uploads and retained recovery until
 * the final callback-free handoff. No relay identity or activation is inferred. */
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {transferRecoveredIndependentParticipant} from '../independent_recovery/recovery.js';
import {prepareIndependentRecovery} from '../independent_recovery/prepare.js';
import {readIndependentRecoveryDatabase} from '../independent_recovery/database.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {IndependentLocalOperationCutJournal as Journal} from './cut_journal.js';
import {openJournaledIndependentLocalHistory,readJournaledLocalSourceData} from './open_journaled_source.js';
import {LocalOperationParticipantOpening as Opening} from './participant_opening.js';
import {snapshotLocalParticipant} from './participant_prepare.js';
import {localParticipantRecord} from './participant_record.js';
import {createLocalParticipantDatabase,readLocalParticipantDatabase} from './participant_database.js';
import {prepareLocalParticipantJournal} from './participant_journal.js';
import {localParticipantBaseline,openLocalUploads,checkLocalUploads,localUploadCustody} from './participant_assets.js';
import {verifyLocalRetainedRecovery,verifyInitialLocalJournal} from './participant_retained.js';
import {localParticipantWitness,type LocalParticipantOwners} from './participant_owners.js';
import {fenceLocalParticipantDatabase,retainedLocalParticipantRecord,updateLocalParticipant,releaseLocalParticipantLeases,disposeLocalParticipantBackups,closeLocalParticipantHandles,closeLocalParticipantState,type LocalParticipantState} from './participant_state.js';
import type {LocalOperationParticipantOptions,LocalOperationParticipantBeginOptions,LocalOperationParticipantParts} from './participant_contract.js';
import {localJournalFailure as fail} from './journal_failure.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {prepareNativeInputHandoff,type NativeInputHandoff} from '../native_input_operation/handoff.js';
import type {OperationalCohortReservation} from '../operation_cohort/cohort.js';
import {operationalReadReservation,type OperationalReadReservation} from '../operation_read/reservation.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {makeFreshLocalParentHistoryRead,type FreshLocalParentHistoryOptions,type FreshLocalParentHistoryRead} from './fresh_parent_history.js';
const key=Object.freeze({}),closeSource=Session.prototype.close,journalFile=Journal.prototype.file,journalBlob=Journal.prototype.blob,journalClose=Journal.prototype.close,journalProgress=Journal.prototype.progress;
let reserve:<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentLocalParticipant<P>[])=>OperationalCohortReservation<Readonly<LocalOperationParticipantParts<P>>>;
export interface LocalParticipantReadParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:Readonly<{session:Session<P>}>;readonly uploads:NonNullable<LocalParticipantOwners<P>['uploads']>}
let reserveRead:<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentLocalParticipant<P>[])=>OperationalReadReservation<LocalParticipantReadParts<P>>;
let reserveFreshRead:<P extends SharedSelectionPolicy>(owner:OperationalIndependentLocalParticipant<P>,read:FreshLocalParentHistoryOptions<P>,authority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode)=>FreshLocalParentHistoryRead;
/** Fresh non-consuming protected-parent read; no mutable source escapes. */
export function reserveFreshIndependentLocalHistoryRead<P extends SharedSelectionPolicy>(owner:OperationalIndependentLocalParticipant<P>,read:FreshLocalParentHistoryOptions<P>,checkAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode){return reserveFreshRead(owner,read,checkAuthority,signal,mode);}
/** Non-consuming native/upload inspection; no coordinator lease is released. */
export function reserveIndependentLocalRead<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentLocalParticipant<P>[]):OperationalReadReservation<LocalParticipantReadParts<P>>{return reserveRead(owners);}
/** Intrinsic legacy-local group. Original provider semantics remain original;
 * neither a snapshot family tag nor a saved marker supplies these owners. */
export function reserveOperationalIndependentLocalGroup<P extends SharedSelectionPolicy>(owners:readonly OperationalIndependentLocalParticipant<P>[]):OperationalCohortReservation<Readonly<LocalOperationParticipantParts<P>>>{return reserve(owners);}
async function verified(state:LocalParticipantState,initial=false){await retainedLocalParticipantRecord(state);await verifyLocalRetainedRecovery(state.p,state.recoveryDb!);state.choice.guard();return localParticipantWitness(state.p,state.baseline,state.owners,state.journal,initial);}
export class OperationalIndependentLocalParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:LocalParticipantState<P>;#exposed=false;#closed=false;#busy=false;#readToken:object|undefined;
 private constructor(token:object,state:LocalParticipantState<P>){if(token!==key)throw fail('independent_local_participant_closed');this.#state=state;Object.freeze(this);}
 static{reserveFreshRead=(owner,read,authority,signal,mode)=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('independent_local_participant_policy');owner.#start();const token={};owner.#readToken=token;let released=false;
  const held=()=>{if(released||owner.#closed||!owner.#exposed||!owner.#busy||owner.#readToken!==token)throw fail('independent_local_participant_closed');},release=()=>{if(released)return;held();released=true;owner.#readToken=undefined;owner.#busy=false;};
  try{return makeFreshLocalParentHistoryRead(owner.#state,held,release,read,authority,signal,mode);}catch(error){release();throw error;}
 };}
 static{reserve=<Q extends SharedSelectionPolicy>(provided:readonly OperationalIndependentLocalParticipant<Q>[])=>{
  const owners=snapshotInventoryInputs(provided,()=>fail('independent_local_participant_policy'),owner=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('independent_local_participant_policy');if(!owner.#exposed||owner.#closed)throw fail('independent_local_participant_closed');if(owner.#busy)throw fail('independent_local_participant_busy');return owner;});
  if(new Set(owners).size!==owners.length)throw fail('independent_local_participant_policy');for(const owner of owners)owner.#busy=true;
  const witnesses:Awaited<ReturnType<typeof verified>>[]=[],handoffs:NativeInputHandoff<Q>[]=[];let finished=false,started=false;
  const current=()=>{if(finished||handoffs.length!==owners.length)throw fail('independent_local_participant_closed');};
  const abandon=()=>{if(finished)return;finished=true;try{for(const h of handoffs)h.abandon();}finally{try{for(const w of witnesses)w.release();}finally{for(const owner of owners)owner.#busy=false;}}};
  try{
   const part=(index:number)=>{const h=handoffs[index];if(!h)throw fail('independent_local_participant_closed');return h.value;};
   const states=Object.freeze(owners.map((_,index)=>Object.freeze({get source(){return part(index).source;},get uploads(){return part(index).uploads;},get original(){return part(index).input;}})));
   return{states,assetStores:[],
    async verify(){if(finished||started)throw fail('independent_local_participant_busy');started=true;for(const owner of owners){const s=owner.#state,w=await verified(s);witnesses.push(w);if(s.record.phase!=='operational')throw fail('independent_local_participant_record');await releaseLocalParticipantLeases(s);w.check();await retainedLocalParticipantRecord(s);await verifyLocalRetainedRecovery(s.p,s.recoveryDb!);w.check();disposeLocalParticipantBackups(s);w.check();closeLocalParticipantHandles(s);w.check();const source=s.owners.session!,journal=s.journal;handoffs.push(prepareNativeInputHandoff({source,check:w.check,current:w.current,uploads:()=>{localUploadCustody.release.call(s.owners.uploadCustody!);return s.owners.uploads!;},release:w.release,file:()=>journalFile.call(journal),blob:(asset,generation)=>journalBlob.call(journal,asset,generation),closed:()=>fail('independent_local_participant_closed')}));}},
    markReleased(){current();},checkBindings(){current();},disposeAuxiliaries(){current();},
    checkCurrent(){current();for(const h of handoffs)h.check();},
    checkManaged(){current();for(const h of handoffs)h.checkCurrent();},
    consume(){for(const h of handoffs)h.consume();for(const owner of owners){owner.#closed=true;owner.#busy=false;}finished=true;},
    abandon,
   };
  }catch(error){abandon();throw error;}
 };}
 static{reserveRead=<Q extends SharedSelectionPolicy>(provided:readonly OperationalIndependentLocalParticipant<Q>[])=>{
  const error=()=>fail('independent_local_participant_busy'),owners=snapshotInventoryInputs(provided,()=>fail('independent_local_participant_policy'),owner=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('independent_local_participant_policy');owner.#readable();if(owner.#busy)throw error();return owner;});
  if(new Set(owners).size!==owners.length)throw fail('independent_local_participant_policy');for(const owner of owners)owner.#busy=true;
  try{return operationalReadReservation(owners.length,async index=>{
   const owner=owners[index]!,s=owner.#state;checkRecoveryLeasesHeld(s.leases);const witness=await verified(s);let complete=false;
   const current=()=>{if(owner.#closed||!owner.#busy)throw error();checkRecoveryLeasesHeld(s.leases);witness.current();};
   try{if(s.record.phase!=='operational')throw fail('independent_local_participant_record');current();const value=Object.freeze({source:Object.freeze({session:s.owners.session!}),uploads:s.owners.uploads!});
    const result={value,check:()=>{witness.check();current();},current,async verify(){await retainedLocalParticipantRecord(s);await verifyLocalRetainedRecovery(s.p,s.recoveryDb!);witness.check();current();},release:witness.release};current();complete=true;return result;
   }finally{if(!complete)witness.release();}
  },()=>{for(const owner of owners)owner.#busy=false;},error);}catch(error){for(const owner of owners)owner.#busy=false;throw error;}
 };}
 static begin<Q extends SharedSelectionPolicy>(input:LocalOperationParticipantBeginOptions<Q>):Promise<OperationalIndependentLocalParticipant<Q>>{if(this!==OperationalIndependentLocalParticipant)throw fail('independent_local_participant_policy');return OperationalIndependentLocalParticipant.#fromRecovered(input,false);}
 static resumeRecovered<Q extends SharedSelectionPolicy>(input:LocalOperationParticipantBeginOptions<Q>):Promise<OperationalIndependentLocalParticipant<Q>>{if(this!==OperationalIndependentLocalParticipant)throw fail('independent_local_participant_policy');return OperationalIndependentLocalParticipant.#fromRecovered(input,true);}
 static async #fromRecovered<Q extends SharedSelectionPolicy>(input:LocalOperationParticipantBeginOptions<Q>,resume:boolean):Promise<OperationalIndependentLocalParticipant<Q>>{
  const choice=snapshotLocalParticipant(input,true),newLeases:RecoveryLease[]=[];let opening:Opening|undefined,parentDb:IDBDatabase|undefined,p:Awaited<ReturnType<typeof prepareIndependentRecovery<Q>>>|undefined,journal:Journal|undefined,state:LocalParticipantState<Q>|undefined,transferred=false;
  opening=await Opening.reserve(choice.context,choice.names,[choice.journalDatabase,choice.sourceDatabase],async()=>{if(transferred){await closeLocalParticipantState(state!,true);return;}if(journal)await journalClose.call(journal);if(p)archive.dispose.call(p.backup);parentDb?.close();await releaseLocalParticipantLeases({leases:newLeases});});
  try{
   state=await transferRecoveredIndependentParticipant(choice.recovered!,async old=>{
    choice.guard();if(old.record.plan!==choice.base.record.plan)throw fail('independent_local_participant_recovery_diverged');for(const name of [choice.database,choice.sourceDatabase].sort()){newLeases.push(await RecoveryLease.acquire(JSON.stringify(name)));choice.guard();}
    const initial=await localParticipantRecord(choice);choice.guard();
    if(resume){parentDb=await existingDatabase(choice.database);if(!parentDb)throw fail('independent_local_participant_missing');}else parentDb=await createLocalParticipantDatabase(choice.context,choice.database,initial,choice.guard,choice.base.options.signal);
    choice.guard();const record=await readLocalParticipantDatabase(parentDb,initial,choice.guard);choice.guard();if(record.phase==='operational')throw fail('independent_local_participant_recovery_diverged');
    p=await prepareIndependentRecovery(choice.base,archive.file.call(old.p.backup));choice.guard();const baseline=await localParticipantBaseline(p);choice.guard();journal=await prepareLocalParticipantJournal(opening!,choice,p,record,resume);choice.guard();await verifyInitialLocalJournal(choice,p,journal);choice.guard();
    const selected:LocalParticipantState<Q>={choice,p,baseline,journal,owners:{uploads:old.owners.uploads!,uploadCustody:old.owners.uploadCustody!},parentDb,recoveryDb:old.db,leases:[...old.leases,...newLeases],record,legacySession:old.owners.session!,legacyBackup:old.p.backup,backupDisposed:false};fenceLocalParticipantDatabase(selected,parentDb);if(record.phase==='preparing')await updateLocalParticipant(selected,'prepared');
    await verifyLocalRetainedRecovery(p,old.db);choice.guard();checkLocalUploads(selected.owners);return selected;
   },value=>{choice.guard();checkLocalUploads(value.owners);});
   transferred=true;fenceLocalParticipantDatabase(state,state.recoveryDb!);choice.guard();
   // The genuine old owner completed its final source/upload checks above. Only
   // now can this parent retire that native owner and acquire the author again.
   await closeSource.call(state.legacySession!);delete state.legacySession;choice.guard();state.owners.session=await openJournaledIndependentLocalHistory(choice.session,state.journal);choice.guard();
   const witness=await verified(state,true);try{witness.check();await updateLocalParticipant(state,'operational');witness.check();const result=new OperationalIndependentLocalParticipant(key,state);witness.check();opening.complete();result.#exposed=true;return result;}finally{witness.release();}
  }catch(error){await opening.rollback();throw error;}
 }
 static async resume<Q extends SharedSelectionPolicy>(input:LocalOperationParticipantOptions<Q>):Promise<OperationalIndependentLocalParticipant<Q>>{
  if(this!==OperationalIndependentLocalParticipant)throw fail('independent_local_participant_policy');const choice=snapshotLocalParticipant(input,false),leases:RecoveryLease[]=[],owners:LocalParticipantOwners<Q>={};let opening:Opening|undefined,parentDb:IDBDatabase|undefined,recoveryDb:IDBDatabase|undefined,p:Awaited<ReturnType<typeof prepareIndependentRecovery<Q>>>|undefined,journal:Journal|undefined,state:LocalParticipantState<Q>|undefined;
  opening=await Opening.reserve(choice.context,choice.names,[choice.journalDatabase,choice.sourceDatabase],async()=>{if(state){await closeLocalParticipantState(state,true);return;}if(journal)await journalClose.call(journal);if(p)archive.dispose.call(p.backup);recoveryDb?.close();parentDb?.close();await releaseLocalParticipantLeases({leases});});
  try{
   choice.guard();for(const name of choice.names.filter(name=>name!==choice.journalDatabase)){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));choice.guard();}
   const initial=await localParticipantRecord(choice);choice.guard();parentDb=await existingDatabase(choice.database);if(!parentDb)throw fail('independent_local_participant_missing');choice.guard();const record=await readLocalParticipantDatabase(parentDb,initial,choice.guard);choice.guard();recoveryDb=await existingDatabase(choice.base.options.database);if(!recoveryDb)throw fail('independent_local_participant_missing');choice.guard();const saved=await readIndependentRecoveryDatabase(recoveryDb,choice.base.record,choice.guard);choice.guard();
   p=await prepareIndependentRecovery(choice.base,saved.file);choice.guard();await verifyLocalRetainedRecovery(p,recoveryDb);const baseline=await localParticipantBaseline(p);choice.guard();journal=await prepareLocalParticipantJournal(opening,choice,p,record,true);choice.guard();if(record.phase!=='operational')await verifyInitialLocalJournal(choice,p,journal);choice.guard();state={choice,p,baseline,journal,owners,parentDb,recoveryDb,leases,record,backupDisposed:false};fenceLocalParticipantDatabase(state,parentDb);fenceLocalParticipantDatabase(state,recoveryDb);
   await openLocalUploads(p,baseline,owners,record.phase!=='operational');choice.guard();if(state.record.phase==='preparing')await updateLocalParticipant(state,'prepared');owners.session=await openJournaledIndependentLocalHistory(choice.session,journal);choice.guard();
   const witness=await verified(state,record.phase!=='operational');try{witness.check();if(state.record.phase!=='operational')await updateLocalParticipant(state,'operational');witness.check();const result=new OperationalIndependentLocalParticipant(key,state);witness.check();opening.complete();result.#exposed=true;return result;}finally{witness.release();}
  }catch(error){await opening.rollback();throw error;}
 }
 #readable():void{if(!this.#exposed||this.#closed)throw fail('independent_local_participant_closed');}
 #start():void{this.#readable();if(this.#busy)throw fail('independent_local_participant_busy');this.#busy=true;}
 file():Blob{this.#readable();return this.#state.baseline.file;}
 blob(asset:string,generation:string):Blob|undefined{this.#readable();return journalBlob.call(this.#state.journal,asset,generation);}
 readableSource(){this.#readable();return readJournaledLocalSourceData(this.#state.owners.session!,this.#state.journal);}
 async progress(){this.#start();try{const s=this.#state;await retainedLocalParticipantRecord(s);await verifyLocalRetainedRecovery(s.p,s.recoveryDb!);const cut=await journalProgress.call(s.journal);s.choice.guard();return Object.freeze({phase:s.record.phase,pending:cut.pending!==null,sequence:cut.sequence});}finally{this.#busy=false;}}
 async check():Promise<void>{this.#start();try{const witness=await verified(this.#state);try{witness.check();}finally{witness.release();}}finally{this.#busy=false;}}
 async intoParts():Promise<Readonly<LocalOperationParticipantParts<P>>>{
  this.#start();try{const s=this.#state,witness=await verified(s);try{if(s.record.phase!=='operational')throw fail('independent_local_participant_record');const source=s.owners.session!,original=Object.freeze({file:()=>journalFile.call(s.journal),blob:(asset:string,generation:string)=>journalBlob.call(s.journal,asset,generation)}),parts=Object.freeze({source:Object.freeze({session:source}),uploads:s.owners.uploads!,original});
    await releaseLocalParticipantLeases(s);witness.check();await retainedLocalParticipantRecord(s);await verifyLocalRetainedRecovery(s.p,s.recoveryDb!);witness.check();disposeLocalParticipantBackups(s);witness.check();closeLocalParticipantHandles(s);witness.check();
    // No await or host callback follows the final exact native/source barrier.
    localUploadCustody.release.call(s.owners.uploadCustody!);this.#closed=true;return parts;
   }finally{witness.release();}
  }finally{this.#busy=false;}
 }
 close():Promise<void>{return this.#close(false);}
 discardAndClose():Promise<void>{return this.#close(true);}
 async #close(discard:boolean):Promise<void>{if(this.#closed)return;this.#start();try{await closeLocalParticipantState(this.#state,discard);this.#closed=true;}finally{this.#busy=false;}}
}
