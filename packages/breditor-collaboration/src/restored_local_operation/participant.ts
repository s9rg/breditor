/** Complete restored-local operational ownership. One actual parent coordinates
 * literal input, native journal/source and whole uploads through four reserved
 * namespaces and a final callback-free native/upload handoff. No activation or
 * repeated flat provenance export is inferred. */
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
const key=Object.freeze({}),closeSource=Session.prototype.close,discardSource=Session.prototype.discardAndClose,closeJournal=Journal.prototype.close,progressJournal=Journal.prototype.progress,journalBlob=Journal.prototype.blob;
export class OperationalRestoredLocalParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:RestoredLocalParticipantState<P>;#closed=false;#busy=false;
 private constructor(token:object,state:RestoredLocalParticipantState<P>){if(token!==key)throw fail();this.#state=state;Object.freeze(this);}
 static begin<Q extends SharedSelectionPolicy>(file:Blob,provided:RestoredLocalParticipantOptions<Q>){if(this!==OperationalRestoredLocalParticipant)throw fail();return OperationalRestoredLocalParticipant.#open(provided,file);}
 static resume<Q extends SharedSelectionPolicy>(provided:RestoredLocalParticipantOptions<Q>){if(this!==OperationalRestoredLocalParticipant)throw fail();return OperationalRestoredLocalParticipant.#open(provided);}
 static async #open<Q extends SharedSelectionPolicy>(provided:RestoredLocalParticipantOptions<Q>,file?:Blob){
  const context=recoveryOpeningContext(),locks=navigator.locks,choice=snapshotRestoredLocalPolicy(provided);if(!choice.cohort)throw fail('restored_local_participant_policy');const cohort=choice.cohort,life={changed:false};
  const guard=()=>{if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_participant_storage_changed');choice.guard();if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('restored_local_participant_storage_changed');};
  const leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,input:Input|undefined,journal:Journal|undefined,uploads:Uploads|undefined,source:Session<Q>|undefined,state:RestoredLocalParticipantState<Q>|undefined;
  const cleanup=async()=>{if(source)await discardSource.call(source);if(journal)await closeJournal.call(journal);if(uploads)await assets.close.call(uploads);await releaseRestoredLocalParentLeases(leases);if(input)incoming.dispose.call(input);db?.close();};
  const opening=await Opening.reserve(context,choice.names,[choice.database,choice.sourceDatabase],cohort.uploadsDatabase,cleanup);
  try{guard();for(const name of choice.names.filter(name=>name!==choice.database)){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   const resume=file===undefined;let stored:Awaited<ReturnType<typeof readRestoredLocalParentDatabase>>|undefined;
   if(resume){db=await existingRestoredLocalParentDatabase(cohort.parentDatabase,guard);fenceRestoredLocalParentDatabase(life,db);stored=await readRestoredLocalParentDatabase(db,guard);file=stored.file;guard();}
   else{for(const name of [choice.database,choice.sourceDatabase,cohort.uploadsDatabase]){await requireAbsent(name);guard();}}
   const inputOptions={...restoredLocalInputOptions(choice),checkAuthority:guard};input=await incoming.read.call(Input,file!,inputOptions);guard();const id=incoming.identity.call(input),fileSha256=JSON.parse(id.plan).input.fileSha256,initial=incoming.live.call(input),initialRecord=await restoredLocalParentRecord(input);guard();
   db??=await createRestoredLocalParentDatabase(context,cohort.parentDatabase,initialRecord,incoming.file.call(input),guard,choice.read.options.signal);fenceRestoredLocalParentDatabase(life,db);stored??=await readRestoredLocalParentDatabase(db,guard);guard();let record=readRestoredLocalParentRecord(stored.record,initialRecord);
   const existing=await existingDatabase(choice.database),hasJournal=!!existing;existing?.close();guard();if(record.phase!=='preparing'&&!hasJournal)throw fail('restored_local_participant_missing');
   journal=await openRestoredLocalJournalForParticipant(opening,inputOptions,hasJournal?undefined:incoming.file.call(input));guard();
   const cut=await progressJournal.call(journal);guard();
   if(record.phase==='operational'&&cut.current===null)throw fail('restored_local_participant_missing');
   const actualSource=await existingDatabase(choice.sourceDatabase),hasSource=!!actualSource;actualSource?.close();guard();
   if(cut.current!==null&&!hasSource)throw fail('restored_local_participant_missing');
   if(record.phase==='preparing'&&(cut.sequence!=='0'||cut.current!==null||cut.pending!==null||hasSource))throw fail('restored_local_participant_initial_diverged');
   const uploadStatus=await inspectUploads(cohort.uploadsDatabase);guard();if(record.phase!=='preparing'&&uploadStatus==='missing')throw fail('restored_local_participant_missing');
   uploads=await openRestoredLocalUploadsForParticipant(opening,input,{database:cohort.uploadsDatabase,checkAuthority:guard,limits:choice.read.options.limits,...(choice.read.options.signal===undefined?{}:{signal:choice.read.options.signal})},uploadStatus==='retained'||record.phase!=='preparing');guard();
   if(record.phase==='preparing'){
    const next={...record,phase:'prepared' as const};await writeRestoredLocalParentRecord(db,record,next,incoming.file.call(input),guard,choice.read.options.signal);guard();const actualRecord=await readRestoredLocalParentDatabase(db,guard);record=readRestoredLocalParentRecord(actualRecord.record,next);if(record.phase!=='prepared')throw fail('restored_local_participant_record');
   }
   source=await openRestoredLocalHistory(choice.source,journal);guard();state={choice,context,locks,guard,leases,file:incoming.file.call(input),fileSha256,initial,life,input,journal,uploads,source,inputDisposed:false,db,record};
   const witness=await verifyRestoredLocalParticipant(state,record.phase!=='operational');try{witness.check();if(state.record.phase!=='operational')await updateRestoredLocalParentRecord(state,'operational');witness.check();}finally{witness.release();}
   const result=new OperationalRestoredLocalParticipant<Q>(key,state);opening.complete();return result;
  }catch(error){await opening.rollback();throw error;}
 }
 #start(){if(this.#closed)throw fail('restored_local_participant_closed');if(this.#busy)throw fail('restored_local_participant_busy');this.#busy=true;}
 file(){if(this.#closed)throw fail('restored_local_participant_closed');return this.#state.file;}
 blob(asset:string,generation:string){if(this.#closed)throw fail('restored_local_participant_closed');return journalBlob.call(this.#state.journal,asset,generation);}
 readableSource(){if(this.#closed)throw fail('restored_local_participant_closed');return restoredLocalJournalBinding(this.#state.journal).readSource(this.#state.source);}
 async progress(){this.#start();try{const s=this.#state;await retainedRestoredLocalParentRecord(s);const cut=await progressJournal.call(s.journal);s.guard();return{phase:s.record.phase,pending:cut.pending!==null,sequence:cut.sequence};}finally{this.#busy=false;}}
 async check(){this.#start();try{const witness=await verifyRestoredLocalParticipant(this.#state);try{witness.check();}finally{witness.release();}}finally{this.#busy=false;}}
 async intoParts():Promise<Readonly<RestoredLocalParticipantParts<P>>>{this.#start();try{const s=this.#state,witness=await verifyRestoredLocalParticipant(s);try{if(s.record.phase!=='operational')throw fail('restored_local_participant_record');await releaseRestoredLocalParentLeases(s.leases);witness.check();await retainedRestoredLocalParentRecord(s);witness.check();if(!s.inputDisposed){incoming.dispose.call(s.input);s.inputDisposed=true;}witness.check();if(s.db){s.db.close();delete s.db;}witness.check();const parts=witness.take(s.source);this.#closed=true;return parts;}finally{witness.release();}}finally{this.#busy=false;}}
 close(){return this.#close(false);}
 discardAndClose(){return this.#close(true);}
 async #close(discard:boolean){if(this.#closed)return;this.#start();try{const s=this.#state;await(discard?discardSource:closeSource).call(s.source);await closeJournal.call(s.journal);await assets.close.call(s.uploads);await releaseRestoredLocalParentLeases(s.leases);if(!s.inputDisposed){incoming.dispose.call(s.input);s.inputDisposed=true;}if(s.db){s.db.close();delete s.db;}this.#closed=true;}finally{this.#busy=false;}}
}
