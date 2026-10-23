/** Complete graph ownership: literal input, journal/source and whole uploads
 * cross one actual four-name recovery path. All custody and final witnesses
 * use shared genuine machinery, not a copied graph-owner overlay. */
import type {SharedSelectionPolicy} from '../types.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {RecoveryLease} from '../participant_recovery/lease.js';import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {requireAbsent,inspectUploads} from '../participant_recovery/inspect.js';import {existingDatabase} from '../participant_recovery/journal.js';
import {NativeInputParticipantOpening as Opening} from '../native_input_operation/participant_opening.js';
import {NativeInputParticipantUploads as Uploads,nativeInputUploads as assets,openNativeInputUploadsForParticipant} from '../native_input_operation/participant_uploads.js';
import {flatLocalJournalFamily,nativeInputJournalFamily} from '../native_input_operation/journal_families.js';
import {snapshotFlatLocalPolicy,flatLocalInputOptions} from './policy.js';import {DetachedFlatLocalInput as Input,flatLocalInput as input} from './input.js';
import {FlatLocalOperationJournal as Journal,openFlatLocalJournalForParticipant,flatLocalJournalBinding} from './journal.js';import {openFlatLocalHistory} from './open_source.js';
import {makeFlatLocalParentRecord,readFlatLocalParentRecord} from './participant_record.js';
import {createFlatLocalParentDatabase,existingFlatLocalParentDatabase,readFlatLocalParentDatabase,writeFlatLocalParentRecord} from './participant_database.js';
import {fenceFlatLocalParentDatabase,releaseFlatLocalParentLeases,retainedFlatLocalParentRecord,updateFlatLocalParentRecord,verifyFlatLocalParticipant,type FlatLocalParticipantState} from './participant_state.js';
import type {FlatLocalParticipantOptions,FlatLocalParticipantParts} from './participant_contract.js';import {flatLocalFailure as fail} from './failure.js';
const key=Object.freeze({}),closeSource=Session.prototype.close,discardSource=Session.prototype.discardAndClose;
export class OperationalFlatLocalParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:FlatLocalParticipantState<P>;#exposed=false;#closed=false;#busy=false;
 private constructor(token:object,state:FlatLocalParticipantState<P>){if(token!==key)throw fail('flat_local_input_participant_policy');this.#state=state;Object.freeze(this);}
 static begin<Q extends SharedSelectionPolicy>(file:Blob,provided:FlatLocalParticipantOptions<Q>):Promise<OperationalFlatLocalParticipant<Q>>{if(this!==OperationalFlatLocalParticipant)throw fail();return OperationalFlatLocalParticipant.#open(provided,file);}
 static resume<Q extends SharedSelectionPolicy>(provided:FlatLocalParticipantOptions<Q>):Promise<OperationalFlatLocalParticipant<Q>>{if(this!==OperationalFlatLocalParticipant)throw fail();return OperationalFlatLocalParticipant.#open(provided);}
 static async #open<Q extends SharedSelectionPolicy>(provided:FlatLocalParticipantOptions<Q>,file?:Blob):Promise<OperationalFlatLocalParticipant<Q>>{
  const context=recoveryOpeningContext(),locks=navigator.locks,choice=snapshotFlatLocalPolicy(provided),intrinsic=nativeInputJournalFamily(flatLocalJournalFamily);if(!choice.cohort)throw fail('flat_local_input_participant_policy');const cohort=choice.cohort,life={changed:false};
  const guard=()=>{if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('flat_local_input_participant_storage_changed');choice.guard();if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('flat_local_input_participant_storage_changed');};
  const leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,incoming:Input|undefined,journal:Journal|undefined,uploads:Uploads|undefined,source:Session<Q>|undefined,state:FlatLocalParticipantState<Q>|undefined;
  const cleanup=async()=>{if(source)await discardSource.call(source);if(journal)await intrinsic.journal.close(journal);if(uploads)await assets.close.call(uploads);await releaseFlatLocalParentLeases(leases);if(incoming)input.dispose.call(incoming);db?.close();};
  const opening=await Opening.reserve(flatLocalJournalFamily,context,choice.names,[choice.database,choice.sourceDatabase],cohort.uploadsDatabase,cleanup);
  try{guard();for(const name of choice.names.filter(name=>name!==choice.database)){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   let stored:Awaited<ReturnType<typeof readFlatLocalParentDatabase>>|undefined;if(file===undefined){db=await existingFlatLocalParentDatabase(cohort.parentDatabase,guard);fenceFlatLocalParentDatabase(life,db);stored=await readFlatLocalParentDatabase(db,guard);file=stored.file;guard();}else for(const name of[choice.database,choice.sourceDatabase,cohort.uploadsDatabase]){await requireAbsent(name);guard();}
   const inputOptions={...flatLocalInputOptions(choice),checkAuthority:guard};incoming=await input.read.call(Input,file,inputOptions);guard();const initial=input.live.call(incoming),initialRecord=await makeFlatLocalParentRecord(incoming);guard();
   db??=await createFlatLocalParentDatabase(context,cohort.parentDatabase,initialRecord,input.file.call(incoming),guard,choice.read.options.signal);fenceFlatLocalParentDatabase(life,db);stored??=await readFlatLocalParentDatabase(db,guard);guard();let record=readFlatLocalParentRecord(stored.record,initialRecord);await input.verifyFile.call(incoming,stored.file,guard);guard();
   const retainedJournal=await existingDatabase(choice.database),hasJournal=!!retainedJournal;retainedJournal?.close();guard();if(record.phase!=='preparing'&&!hasJournal)throw fail('flat_local_input_participant_missing');journal=await openFlatLocalJournalForParticipant(opening,inputOptions,hasJournal?undefined:input.file.call(incoming));guard();const cut=await intrinsic.journal.progress(journal);guard();
   if(record.phase==='operational'&&cut.current===null)throw fail('flat_local_input_participant_missing');const retainedSource=await existingDatabase(choice.sourceDatabase),hasSource=!!retainedSource;retainedSource?.close();guard();if(cut.current!==null&&!hasSource)throw fail('flat_local_input_participant_missing');if(record.phase==='preparing'&&(cut.sequence!=='0'||cut.current!==null||cut.pending!==null||hasSource))throw fail('flat_local_input_participant_initial_diverged');
   const uploadStatus=await inspectUploads(cohort.uploadsDatabase);guard();if(record.phase!=='preparing'&&uploadStatus==='missing')throw fail('flat_local_input_participant_missing');uploads=await openNativeInputUploadsForParticipant(flatLocalJournalFamily,opening,incoming,{database:cohort.uploadsDatabase,checkAuthority:guard,limits:choice.read.options.limits,...(choice.read.options.signal?{signal:choice.read.options.signal}:{})},uploadStatus==='retained'||record.phase!=='preparing');guard();
   if(record.phase==='preparing'){const next={...record,phase:'prepared' as const};await writeFlatLocalParentRecord(db,record,next,input.file.call(incoming),guard,choice.read.options.signal);guard();record=readFlatLocalParentRecord((await readFlatLocalParentDatabase(db,guard)).record,next);if(record.phase!=='prepared')throw fail('flat_local_input_participant_record');}
   source=await openFlatLocalHistory(choice.source,journal);guard();state={choice,context,locks,guard,leases,file:input.file.call(incoming),initial,life,input:incoming,journal,uploads,source,inputDisposed:false,db,record};const witness=await verifyFlatLocalParticipant(state,record.phase!=='operational');
   try{witness.check();if(state.record.phase!=='operational')await updateFlatLocalParentRecord(state,'operational');witness.check();const result=new OperationalFlatLocalParticipant<Q>(key,state);witness.check();opening.complete();result.#exposed=true;return result;}finally{witness.release();}
  }catch(error){await opening.rollback();throw error;}
 }
 #readable():void{if(!this.#exposed||this.#closed)throw fail('flat_local_input_participant_closed');}
 #start():void{this.#readable();if(this.#busy)throw fail('flat_local_input_participant_busy');this.#busy=true;}
 file():Blob{this.#readable();return this.#state.file;}
 blob(asset:string,generation:string):Blob|undefined{this.#readable();return nativeInputJournalFamily(flatLocalJournalFamily).journal.blob(this.#state.journal,asset,generation);}
 readableSource(){this.#readable();return flatLocalJournalBinding(this.#state.journal).readSource(this.#state.source);}
 async progress(){this.#start();try{const s=this.#state;await retainedFlatLocalParentRecord(s);const cut=await nativeInputJournalFamily(flatLocalJournalFamily).journal.progress(s.journal);s.guard();return{phase:s.record.phase,pending:cut.pending!==null,sequence:cut.sequence};}finally{this.#busy=false;}}
 async check():Promise<void>{this.#start();try{const witness=await verifyFlatLocalParticipant(this.#state);try{witness.check();}finally{witness.release();}}finally{this.#busy=false;}}
 async intoParts():Promise<Readonly<FlatLocalParticipantParts<P>>>{this.#start();try{const s=this.#state,witness=await verifyFlatLocalParticipant(s);try{if(s.record.phase!=='operational')throw fail('flat_local_input_participant_record');await releaseFlatLocalParentLeases(s.leases);witness.check();await retainedFlatLocalParentRecord(s);witness.check();if(!s.inputDisposed){input.dispose.call(s.input);s.inputDisposed=true;}witness.check();if(s.db){s.db.close();delete s.db;}witness.check();const parts=witness.take(s.source);this.#closed=true;return parts;}finally{witness.release();}}finally{this.#busy=false;}}
 close():Promise<void>{return this.#close(false);}
 discardAndClose():Promise<void>{return this.#close(true);}
 async #close(discard:boolean):Promise<void>{if(this.#closed)return;this.#start();try{const s=this.#state;await(discard?discardSource:closeSource).call(s.source);await nativeInputJournalFamily(flatLocalJournalFamily).journal.close(s.journal);await assets.close.call(s.uploads);await releaseFlatLocalParentLeases(s.leases);if(!s.inputDisposed){input.dispose.call(s.input);s.inputDisposed=true;}if(s.db){s.db.close();delete s.db;}this.#closed=true;}finally{this.#busy=false;}}
}
