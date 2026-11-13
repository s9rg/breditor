import {operationCutDigest} from '../independent_operation/cut_codec.js';
import {exactOperationRecoveryInput} from '../operation_read/exact_recovery_input.js';
/** Complete restored-local operational ownership. One actual parent coordinates
 * literal input, native journal/source and whole uploads through four reserved
 * namespaces and a final callback-free native/upload handoff. No activation or
 * repeated flat provenance export is inferred. */
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {snapshotRestoredLocalPolicy,restoredLocalInputOptions} from './policy.js';
import {DetachedRestoredLocalInput as Input,restoredLocalInput as incoming} from './input.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {requireAbsent,inspectUploads} from '../participant_recovery/inspect.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {restoredLocalFailure as fail} from './failure.js';
import {RestoredLocalParticipantOpening as Opening} from './participant_opening.js';
import {RestoredLocalOperationJournal as Journal,openRestoredLocalJournalForParticipant,restoredLocalJournalBinding} from './journal.js';
import {openRestoredLocalHistory} from './open_source.js';
import {RestoredLocalParticipantUploads as Uploads,openRestoredLocalUploadsForParticipant,restoredLocalUploads as assets} from './participant_assets.js';
import {restoredLocalParentRecord,readRestoredLocalParentRecord} from './participant_record.js';
import {createRestoredLocalParentDatabase,existingRestoredLocalParentDatabase,readRestoredLocalParentDatabase,writeRestoredLocalParentRecord} from './participant_database.js';
import type {RestoredLocalParticipantOptions,RestoredLocalParticipantParts} from './participant_contract.js';
import {fenceRestoredLocalParentDatabase,retainedRestoredLocalParentRecord,updateRestoredLocalParentRecord,releaseRestoredLocalParentLeases,verifyRestoredLocalParticipant,type RestoredLocalParticipantState} from './participant_state.js';
import type {NativeInputParticipantReservation} from '../native_input_operation/cohort_member.js';
import {operationalReadReservation,type OperationalReadReservation} from '../operation_read/reservation.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {readRestoredLocalUploadStore} from './participant_assets.js';
import {RestoredLocalParticipantWitness as ReadWitness} from './participant_witness.js';
import {makeFreshSnapshotLocalHistoryRead,type FreshSnapshotLocalHistoryOptions,type FreshSnapshotLocalHistoryRead} from './fresh_parent_history.js';
const key=Object.freeze({}),closeSource=Session.prototype.close,discardSource=Session.prototype.discardAndClose,closeJournal=Journal.prototype.close,progressJournal=Journal.prototype.progress,journalBlob=Journal.prototype.blob;
const readWitnessCheck=ReadWitness.prototype.check,readWitnessCurrent=ReadWitness.prototype.checkCurrent,readWitnessRelease=ReadWitness.prototype.release;
let reserve:<P extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<P>)=>NativeInputParticipantReservation<P>;
type ReadParts<P extends SharedSelectionPolicy>=Readonly<Omit<RestoredLocalParticipantParts<P>,'input'>>;
let reserveRead:<P extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<P>)=>OperationalReadReservation<ReadParts<P>>;
let reserveFreshRead:<P extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<P>,read:FreshSnapshotLocalHistoryOptions<P>,authority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode)=>FreshSnapshotLocalHistoryRead;
/** Fresh snapshot parent read, preserving literal input and held uploads. */
export function reserveFreshSnapshotLocalHistoryRead<P extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<P>,read:FreshSnapshotLocalHistoryOptions<P>,checkAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode){return reserveFreshRead(owner,read,checkAuthority,signal,mode);}
/** Non-consuming snapshot/source/upload read. No input or coordinator retires. */
export function reserveRestoredLocalRead<P extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<P>):OperationalReadReservation<ReadParts<P>>{return reserveRead(owner);}
/** Internal genuine-parent reservation, never a structural adapter or root API. */
export function reserveRestoredLocalParticipant<P extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<P>):NativeInputParticipantReservation<P>{return reserve(owner);}
let resumeComplete:typeof OperationalRestoredLocalParticipant.resume;
/** SDK-only complete-existing admission; default resume remains repair-capable. */
export const resumeCompletedOperationalRestoredLocalParticipant:typeof OperationalRestoredLocalParticipant.resume=input=>resumeComplete(input);
export class OperationalRestoredLocalParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:RestoredLocalParticipantState<P>;#exposed=false;#closed=false;#busy=false;#readToken:object|undefined;
 private constructor(token:object,state:RestoredLocalParticipantState<P>){if(token!==key)throw fail();this.#state=state;Object.freeze(this);}
 static{reserveFreshRead=(owner,read,authority,signal,mode)=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('restored_local_participant_policy');owner.#start();const token={};owner.#readToken=token;let released=false;
  const held=()=>{if(released||owner.#closed||!owner.#exposed||!owner.#busy||owner.#readToken!==token)throw fail('restored_local_participant_closed');},release=()=>{if(released)return;held();released=true;owner.#readToken=undefined;owner.#busy=false;};
  try{return makeFreshSnapshotLocalHistoryRead(owner.#state,held,release,read,authority,signal,mode);}catch(error){release();throw error;}
 };}
 static{reserve=<Q extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<Q>)=>{
  if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('restored_local_participant_policy');owner.#start();const s=owner.#state;let witness:Awaited<ReturnType<typeof verifyRestoredLocalParticipant<Q>>>|undefined,prepared=false,finished=false;
  return{
   async prepare(){if(finished||prepared)throw fail('restored_local_participant_busy');prepared=true;witness=await verifyRestoredLocalParticipant(s);if(s.record.phase!=='operational')throw fail('restored_local_participant_record');await releaseRestoredLocalParentLeases(s.leases);witness.check();await retainedRestoredLocalParentRecord(s);witness.check();if(!s.inputDisposed){incoming.dispose.call(s.input);s.inputDisposed=true;}witness.check();if(s.db){s.db.close();delete s.db;}witness.check();return witness.prepareHandoff(s.source);},
   consume(){owner.#closed=true;owner.#busy=false;finished=true;},
   abandon(){if(finished)return;finished=true;try{witness?.release();}finally{owner.#busy=false;}},
  };
 };}
 static{reserveRead=<Q extends SharedSelectionPolicy>(owner:OperationalRestoredLocalParticipant<Q>)=>{
  if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('restored_local_participant_policy');owner.#start();const s=owner.#state,error=()=>fail('restored_local_participant_busy');
  try{return operationalReadReservation(1,async()=>{
   checkRecoveryLeasesHeld(s.leases);const witness=await verifyRestoredLocalParticipant(s);let complete=false;
   const current=()=>{if(owner.#closed||!owner.#busy||s.inputDisposed||!s.db)throw error();checkRecoveryLeasesHeld(s.leases);readWitnessCurrent.call(witness);};
   try{if(s.record.phase!=='operational')throw fail('restored_local_participant_record');current();const value=Object.freeze({source:Object.freeze({session:s.source}),uploads:readRestoredLocalUploadStore(s.uploads)});
    const result={value,check:()=>{readWitnessCheck.call(witness);current();},current,async verify(){checkRecoveryLeasesHeld(s.leases);await retainedRestoredLocalParentRecord(s);readWitnessCheck.call(witness);current();},release:()=>readWitnessRelease.call(witness)};current();complete=true;return result;
   }finally{if(!complete)readWitnessRelease.call(witness);}
  },()=>{owner.#busy=false;},error);}catch(error){owner.#busy=false;throw error;}
 };}
 static begin<Q extends SharedSelectionPolicy>(file:Blob,provided:RestoredLocalParticipantOptions<Q>){if(this!==OperationalRestoredLocalParticipant)throw fail();return OperationalRestoredLocalParticipant.#open(provided,file);}
 static resume<Q extends SharedSelectionPolicy>(provided:RestoredLocalParticipantOptions<Q>){if(this!==OperationalRestoredLocalParticipant)throw fail();return OperationalRestoredLocalParticipant.#open(provided);}
 static{resumeComplete=input=>OperationalRestoredLocalParticipant.#open(input,undefined,true);}
 static async #open<Q extends SharedSelectionPolicy>(provided:RestoredLocalParticipantOptions<Q>,file?:Blob,completeOnly=false){
  const context=recoveryOpeningContext(),locks=navigator.locks,choice=snapshotRestoredLocalPolicy(provided);if(!choice.cohort)throw fail('restored_local_participant_policy');const cohort=choice.cohort,life={changed:false};
  const guard=()=>{if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_participant_storage_changed');choice.guard();if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_participant_storage_changed');};
  const leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,input:Input|undefined,journal:Journal|undefined,uploads:Uploads|undefined,source:Session<Q>|undefined,state:RestoredLocalParticipantState<Q>|undefined;
  const cleanup=async()=>{if(source)await discardSource.call(source);if(journal)await closeJournal.call(journal);if(uploads)await assets.close.call(uploads);await releaseRestoredLocalParentLeases(leases);if(input)incoming.dispose.call(input);db?.close();};
  const opening=await Opening.reserve(context,choice.names,[choice.database,choice.sourceDatabase],cohort.uploadsDatabase,cleanup);
  try{guard();for(const name of choice.names.filter(name=>name!==choice.database)){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   const resume=file===undefined;let stored:Awaited<ReturnType<typeof readRestoredLocalParentDatabase>>|undefined;
   if(resume){db=await existingRestoredLocalParentDatabase(cohort.parentDatabase,guard);fenceRestoredLocalParentDatabase(life,db);stored=await readRestoredLocalParentDatabase(db,guard);file=stored.file;guard();}
   else{for(const name of [choice.database,choice.sourceDatabase,cohort.uploadsDatabase]){await requireAbsent(name);guard();}}
   const exactInput=exactOperationRecoveryInput(provided);if(exactInput)await exactInput(file!);
   const inputOptions={...restoredLocalInputOptions(choice),checkAuthority:guard};input=await incoming.read.call(Input,file!,inputOptions);guard();const id=incoming.identity.call(input),fileSha256=JSON.parse(id.plan).input.fileSha256,initial=incoming.live.call(input),initialRecord=await restoredLocalParentRecord(input);guard();
   db??=await createRestoredLocalParentDatabase(context,cohort.parentDatabase,initialRecord,incoming.file.call(input),guard,choice.read.options.signal);fenceRestoredLocalParentDatabase(life,db);stored??=await readRestoredLocalParentDatabase(db,guard);guard();let record=readRestoredLocalParentRecord(stored.record,initialRecord);if(completeOnly&&record.phase!=='operational')throw fail('restored_local_participant_not_ready');const verifyOnly=completeOnly||(exactInput!==undefined&&record.phase==='operational');
   const existing=await existingDatabase(choice.database),hasJournal=!!existing;existing?.close();guard();if(record.phase!=='preparing'&&!hasJournal)throw fail('restored_local_participant_missing');
   journal=await openRestoredLocalJournalForParticipant(opening,inputOptions,hasJournal?undefined:incoming.file.call(input));guard();
   const cut=await progressJournal.call(journal);guard();
   if(exactInput){
    const live=await operationCutDigest(incoming.targets.call(input).at(-1)!);guard();
    if(cut.current!==null&&cut.current!==live||cut.pending!==null&&cut.pending!==live)throw fail('restored_local_participant_initial_diverged');
   }
   if(verifyOnly&&cut.pending!==null)throw fail('restored_local_participant_not_ready');if(record.phase==='operational'&&cut.current===null)throw fail('restored_local_participant_missing');
   const actualSource=await existingDatabase(choice.sourceDatabase),hasSource=!!actualSource;actualSource?.close();guard();
   if(cut.current!==null&&!hasSource)throw fail('restored_local_participant_missing');
   if(record.phase==='preparing'&&(cut.sequence!=='0'||cut.current!==null||cut.pending!==null||hasSource))throw fail('restored_local_participant_initial_diverged');
   const uploadStatus=await inspectUploads(cohort.uploadsDatabase);guard();if(record.phase!=='preparing'&&uploadStatus==='missing')throw fail('restored_local_participant_missing');
   uploads=await openRestoredLocalUploadsForParticipant(opening,input,{database:cohort.uploadsDatabase,checkAuthority:guard,limits:choice.read.options.limits,...(choice.read.options.signal===undefined?{}:{signal:choice.read.options.signal})},uploadStatus==='retained'||record.phase!=='preparing');guard();
   if(record.phase==='preparing'){
    const next={...record,phase:'prepared' as const};await writeRestoredLocalParentRecord(db,record,next,incoming.file.call(input),guard,choice.read.options.signal);guard();const actualRecord=await readRestoredLocalParentDatabase(db,guard);record=readRestoredLocalParentRecord(actualRecord.record,next);if(record.phase!=='prepared')throw fail('restored_local_participant_record');
   }
   source=await openRestoredLocalHistory(choice.source,journal,verifyOnly);guard();state={choice,context,locks,guard,leases,file:incoming.file.call(input),fileSha256,initial,life,input,journal,uploads,source,inputDisposed:false,db,record};
   const witness=await verifyRestoredLocalParticipant(state,record.phase!=='operational');try{witness.check();if(state.record.phase!=='operational')await updateRestoredLocalParentRecord(state,'operational');witness.check();const result=new OperationalRestoredLocalParticipant<Q>(key,state);witness.check();opening.complete();result.#exposed=true;return result;}finally{witness.release();}
  }catch(error){await opening.rollback();throw error;}
 }
 #readable(){if(!this.#exposed||this.#closed)throw fail('restored_local_participant_closed');}
 #start(){this.#readable();if(this.#busy)throw fail('restored_local_participant_busy');this.#busy=true;}
 file(){this.#readable();return this.#state.file;}
 blob(asset:string,generation:string){this.#readable();return journalBlob.call(this.#state.journal,asset,generation);}
 readableSource(){this.#readable();return restoredLocalJournalBinding(this.#state.journal).readSource(this.#state.source);}
 async progress(){this.#start();try{const s=this.#state;await retainedRestoredLocalParentRecord(s);const cut=await progressJournal.call(s.journal);s.guard();return{phase:s.record.phase,pending:cut.pending!==null,sequence:cut.sequence};}finally{this.#busy=false;}}
 async check(){this.#start();try{const witness=await verifyRestoredLocalParticipant(this.#state);try{witness.check();}finally{witness.release();}}finally{this.#busy=false;}}
 async intoParts():Promise<Readonly<RestoredLocalParticipantParts<P>>>{this.#start();try{const s=this.#state,witness=await verifyRestoredLocalParticipant(s);try{if(s.record.phase!=='operational')throw fail('restored_local_participant_record');await releaseRestoredLocalParentLeases(s.leases);witness.check();await retainedRestoredLocalParentRecord(s);witness.check();if(!s.inputDisposed){incoming.dispose.call(s.input);s.inputDisposed=true;}witness.check();if(s.db){s.db.close();delete s.db;}witness.check();const parts=witness.take(s.source);this.#closed=true;return parts;}finally{witness.release();}}finally{this.#busy=false;}}
 close(){return this.#close(false);}
 discardAndClose(){return this.#close(true);}
 async #close(discard:boolean){if(this.#closed)return;this.#start();try{const s=this.#state;await(discard?discardSource:closeSource).call(s.source);await closeJournal.call(s.journal);await assets.close.call(s.uploads);await releaseRestoredLocalParentLeases(s.leases);if(!s.inputDisposed){incoming.dispose.call(s.input);s.inputDisposed=true;}if(s.db){s.db.close();delete s.db;}this.#closed=true;}finally{this.#busy=false;}}
}
