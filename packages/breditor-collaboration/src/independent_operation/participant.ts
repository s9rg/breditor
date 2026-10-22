/** A real resumable operational participant: the new native source owns its journal,
 * while this parent holds completed recovery and whole-upload custody until final handoff.
 * No phase marker activates a room, chooses a factory, or authenticates current policy. */
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
import {verifyOperationParticipantOwners,closeOperationParticipantOwners,type OperationParticipantOwners} from './participant_owners.js';
import {verifyOperationRetainedRecovery} from './participant_retained.js';
import type {IndependentOperationParticipantOptions,IndependentOperationParticipantBeginOptions,IndependentOperationParticipantParts} from './participant_contract.js';
import {operationJournalFailure as fail} from './journal_failure.js';
interface State<P extends SharedSelectionPolicy>{readonly choice:OperationParticipantSnapshot<P>;readonly p:PreparedIndependentDeliveryRecovery<P>;readonly journal:IndependentOperationCutJournal;readonly owners:OperationParticipantOwners<P>;readonly recoveryDb:IDBDatabase;readonly leases:RecoveryLease[];legacySession?:SharedIndependentDeliverySession<P>|undefined;legacyPrepared?:PreparedIndependentDeliveryRecovery<P>|undefined}
const key=Object.freeze({}),closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
const names=(s:OperationParticipantSnapshot)=>[s.database,s.sourceDatabase,s.base.options.database,...Object.values(s.base.options.destinations)].sort();
async function releaseParent<P extends SharedSelectionPolicy>(s:State<P>):Promise<void>{
 const settled=await Promise.allSettled([...s.leases].reverse().map(lease=>lease.close()));if(settled.some(r=>r.status==='rejected'))throw fail('independent_operation_cleanup');
}
/** Retired archive cleanup may call a replaced inner facade. It precedes the last
 * current-policy barrier; the live source still owns its separate genuine original. */
function disposeRetiredBackup<P extends SharedSelectionPolicy>(s:State<P>):void{if(s.legacyPrepared){const retired=s.legacyPrepared;s.legacyPrepared=undefined;archive.dispose.call(retired.backup);}}
async function closeState<P extends SharedSelectionPolicy>(s:State<P>,discard:boolean):Promise<void>{
 await closeOperationParticipantOwners(s.owners,discard);if(s.legacySession){await(discard?discardSource:closeSource).call(s.legacySession);s.legacySession=undefined;}await s.journal.close();await releaseParent(s);disposeRetiredBackup(s);s.recoveryDb.close();
}
function fence<P extends SharedSelectionPolicy>(s:State<P>):void{s.recoveryDb.onversionchange=()=>{s.choice.life.changed=true;s.recoveryDb.close();};}
const openingErrors={policy:()=>fail('independent_operation_policy'),busy:()=>fail('independent_operation_busy'),storage:()=>fail('independent_operation_cleanup')};
export class OperationalIndependentDeliveryParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:State<P>;readonly #file:Blob;#closed=false;#busy=false;
 private constructor(token:object,state:State<P>){if(token!==key)throw fail('independent_operation_closed');this.#state=state;this.#file=archive.file.call(state.p.backup);Object.freeze(this);}
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
   state.owners.session=await openJournaledIndependentDelivery({...state.p.factory,database:choice.sourceDatabase},state.journal);choice.guard();await verifyOperationRetainedRecovery(state.p,state.recoveryDb);await verifyOperationParticipantOwners(state.p,state.owners,state.journal);choice.guard();const result=new OperationalIndependentDeliveryParticipant(key,state);opening!.complete();return result;
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
   journal=await IndependentOperationCutJournal.resume({database:choice.database,sourceDatabase:choice.sourceDatabase,prepared:p,writerRecovery:'host-reacquired'});choice.guard();state={choice,p,journal,owners,recoveryDb,leases};await openOperationUploads(p,owners);choice.guard();owners.session=await openJournaledIndependentDelivery({...p.factory,database:choice.sourceDatabase},journal);choice.guard();await verifyOperationRetainedRecovery(p,recoveryDb);await verifyOperationParticipantOwners(p,owners,journal);choice.guard();const result=new OperationalIndependentDeliveryParticipant(key,state);opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw error;}
 }
 #start():void{if(this.#closed)throw fail('independent_operation_closed');if(this.#busy)throw fail('independent_operation_busy');this.#busy=true;}
 file():Blob{if(this.#closed)throw fail('independent_operation_closed');return this.#file;}
 async progress(){this.#start();try{const s=this.#state;s.choice.guard();await verifyOperationRetainedRecovery(s.p,s.recoveryDb);const cut=await s.journal.snapshot();s.choice.guard();return Object.freeze({phase:cut.current===null?'preparing' as const:'operational' as const,pending:cut.pending!==null,sequence:cut.record.sequence});}finally{this.#busy=false;}}
 async check():Promise<void>{this.#start();try{const s=this.#state;await verifyOperationRetainedRecovery(s.p,s.recoveryDb);await verifyOperationParticipantOwners(s.p,s.owners,s.journal);}finally{this.#busy=false;}}
 /** Readable owned work is not hidden when write authority is revoked. Not a portable backup. */
 readableSource(){if(this.#closed)throw fail('independent_operation_closed');return readJournaledSourceData(this.#state.owners.session!,this.#state.journal);}
 /** Release only coordinator custody during awaits; keep source/journal and actual uploads held
  * through the final synchronous policy/native/source barrier. The source retains its own origin. */
 async intoParts():Promise<Readonly<IndependentOperationParticipantParts<P>>>{
  this.#start();try{const s=this.#state;await verifyOperationRetainedRecovery(s.p,s.recoveryDb);await verifyOperationParticipantOwners(s.p,s.owners,s.journal);const source=s.owners.session!,port=independentDeliverySource(source),stamp=port.stamp(),parts=Object.freeze({source:Object.freeze({session:source}),uploads:s.owners.uploads!});
   const check=()=>{s.choice.guard();port.check();const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp[i]))throw fail('independent_operation_source_changed');checkOperationUploads(s.owners);readJournaledSourceData(source,s.journal);};check();await releaseParent(s);check();disposeRetiredBackup(s);check();s.recoveryDb.close();operationUploadCustody.release.call(s.owners.uploadCustody!);this.#closed=true;return parts;
  }finally{this.#busy=false;}
 }
 async close():Promise<void>{return this.#close(false);}
 async discardAndClose():Promise<void>{return this.#close(true);}
 async #close(discard:boolean):Promise<void>{if(this.#closed)return;this.#start();try{await closeState(this.#state,discard);this.#closed=true;}finally{this.#busy=false;}}
}
