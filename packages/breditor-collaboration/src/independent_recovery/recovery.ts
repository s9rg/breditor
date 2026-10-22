/** Complete local-only source, original-provider and whole-upload custody.
 * Runtime owners, current policy and actual native replay remain authoritative. */
import type {SharedSelectionPolicy} from '../types.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {independentRecoveryArchive as archive} from './archive.js';
import {independentRecoverySource as sourceRead} from './source.js';
import {snapshotIndependentRecovery,prepareIndependentRecovery,type PreparedIndependentRecovery} from './prepare.js';
import {createIndependentRecoveryDatabase,readIndependentRecoveryDatabase,writeIndependentRecoveryRecord} from './database.js';
import {restoreIndependentSource,restoreIndependentUploads,verifyIndependentOwners,checkIndependentOwner,checkIndependentUploadCustody,releaseIndependentUploadCustody,closeIndependentOwners,type IndependentRecoveryOwners} from './components.js';
import type {IndependentRecoveryRecord} from './record.js';
import type {SharedIndependentParticipantRecoveryOptions,SharedIndependentParticipantResumeOptions,SharedIndependentParticipantRecoveryProgress,RecoveredSharedIndependentParticipantParts} from './contract.js';
import {independentRecoveryFailure as fail} from './policy.js';
const key=Object.freeze({});
export interface IndependentRecoveryCustody<P extends SharedSelectionPolicy>{readonly p:PreparedIndependentRecovery<P>;readonly owners:IndependentRecoveryOwners<P>;readonly db:IDBDatabase;readonly leases:RecoveryLease[];readonly record:IndependentRecoveryRecord;readonly life:{changed:boolean}}
async function release(db:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const results=await Promise.allSettled([...leases].reverse().map(lease=>lease.close()));if(results.some(row=>row.status==='rejected'))throw fail();db.close();}
async function retained<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>,db:IDBDatabase,accepted:readonly IndependentRecoveryRecord[]):Promise<IndependentRecoveryRecord>{
 p.guard();const value=await readIndependentRecoveryDatabase(db,p.record,p.guard);p.guard();if(!accepted.some(record=>JSON.stringify(record)===JSON.stringify(value.record)))throw fail('independent_recovery_diverged');if(await independentParticipantDigest(value.file,p.options.signal)!==p.options.expected.sha256)throw fail('independent_recovery_integrity');p.guard();return value.record;
}
let ready:<P extends SharedSelectionPolicy>(state:IndependentRecoveryCustody<P>)=>RecoveredSharedIndependentParticipant<P>;
let transfer:<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedIndependentParticipant<P>,take:(state:IndependentRecoveryCustody<P>)=>Promise<T>,verify:(value:T)=>void)=>Promise<T>;
/** Private actual-source/backup/upload/attempt transfer for a future room parent.
 * No public constructor or serialized ready marker can adopt this custody. */
export function transferRecoveredIndependentParticipant<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedIndependentParticipant<P>,take:(state:IndependentRecoveryCustody<P>)=>Promise<T>,verify:(value:T)=>void):Promise<T>{return transfer(owner,take,verify);}
export class RecoveredSharedIndependentParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:IndependentRecoveryCustody<P>;readonly #file:Blob;#closed=false;#closing=false;#busy=false;#released=false;#running:Promise<void>|undefined;#done:(()=>void)|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,state:IndependentRecoveryCustody<P>){if(token!==key)throw fail('independent_recovery_closed');this.#state=state;this.#file=archive.file.call(state.p.backup);Object.freeze(this);}
 static{ready=<Q extends SharedSelectionPolicy>(state:IndependentRecoveryCustody<Q>)=>new RecoveredSharedIndependentParticipant(key,state);
  transfer=async(owner,take,verify)=>{owner.#start();let capture:ReturnType<typeof sourceRead.capture>|undefined;try{const s=owner.#state;owner.#guard();await retained(s.p,s.db,[s.record]);await verifyIndependentOwners(s.p,s.owners);owner.#guard();capture=sourceRead.capture({session:s.owners.session!});const value=await take(s);owner.#guard();await retained(s.p,s.db,[s.record]);await verifyIndependentOwners(s.p,s.owners);owner.#guard();verify(value);owner.#guard();checkIndependentOwner(s.p,s.owners);checkIndependentUploadCustody(s.owners);owner.#guard();sourceRead.check(capture);checkIndependentUploadCustody(s.owners);owner.#closed=true;return value;}finally{if(capture)sourceRead.dispose(capture);owner.#end();}};
 }
 #start():void{if(this.#closed||this.#closing||this.#released)throw fail('independent_recovery_closed');if(this.#busy)throw fail('independent_recovery_busy');this.#busy=true;this.#running=new Promise<void>(resolve=>{this.#done=resolve;});}
 #end():void{this.#busy=false;this.#done?.();this.#done=undefined;this.#running=undefined;}
 #guard():void{if(this.#closed||this.#closing)throw fail('independent_recovery_closed');this.#state.p.guard();if(this.#closed||this.#closing)throw fail('independent_recovery_closed');}
 /** Recovery export is available after grant loss while actual custody is held. */
 file():Blob{if(this.#closed)throw fail('independent_recovery_closed');return this.#file;}
 blob(asset:string,generation:string):Blob|undefined{if(this.#closed)throw fail('independent_recovery_closed');return archive.blob.call(this.#state.p.backup,asset,generation);}
 /** Transfer original-provider ownership too; disposing it here would lose
  * selected bytes that are deliberately absent from the whole upload store. */
 async intoParts():Promise<Readonly<RecoveredSharedIndependentParticipantParts<P>>>{
  this.#start();let capture:ReturnType<typeof sourceRead.capture>|undefined;
  try{const s=this.#state;this.#guard();await retained(s.p,s.db,[s.record]);await verifyIndependentOwners(s.p,s.owners);this.#guard();await retained(s.p,s.db,[s.record]);this.#guard();const parts=Object.freeze({source:Object.freeze({session:s.owners.session!}),uploads:s.owners.uploads!,original:s.p.backup});capture=sourceRead.capture(parts.source);
   await release(s.db,s.leases);this.#released=true;this.#guard();sourceRead.check(capture);checkIndependentOwner(s.p,s.owners);checkIndependentUploadCustody(s.owners);this.#guard();sourceRead.check(capture);releaseIndependentUploadCustody(s.owners);this.#closed=true;return parts;
  }finally{if(capture)sourceRead.dispose(capture);this.#end();}
 }
 close():Promise<void>{return this.#close(false);}
 discardAndClose():Promise<void>{return this.#close(true);}
 #close(discard:boolean):Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=this.#finishClose(discard).finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
 async #finishClose(discard:boolean):Promise<void>{await this.#running;if(this.#closed)return;const s=this.#state;await closeIndependentOwners(s.owners,discard);await release(s.db,s.leases);this.#released=true;archive.dispose.call(s.p.backup);this.#closed=true;}
}
export class SharedIndependentParticipantRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #p:PreparedIndependentRecovery<P>;readonly #db:IDBDatabase;readonly #leases:RecoveryLease[];#record:IndependentRecoveryRecord;#pending:IndependentRecoveryRecord|undefined;#closed=false;#closing=false;#running:Promise<RecoveredSharedIndependentParticipant<P>>|undefined;#cleanup:Promise<void>|undefined;
 readonly #rollback=new RecoveryCleanupScope(()=>fail());readonly #life:{changed:boolean};
 private constructor(token:object,p:PreparedIndependentRecovery<P>,db:IDBDatabase,leases:RecoveryLease[],record:IndependentRecoveryRecord,life:{changed:boolean}){if(token!==key)throw fail('independent_recovery_closed');this.#p=p;this.#db=db;this.#leases=leases;this.#record=record;this.#life=life;Object.freeze(this);}
 static begin<Q extends SharedSelectionPolicy>(input:SharedIndependentParticipantRecoveryOptions<Q>):Promise<SharedIndependentParticipantRecovery<Q>>{if(this!==SharedIndependentParticipantRecovery)throw fail('independent_recovery_policy');return SharedIndependentParticipantRecovery.#open(input,false);}
 static resume<Q extends SharedSelectionPolicy>(input:SharedIndependentParticipantResumeOptions<Q>):Promise<SharedIndependentParticipantRecovery<Q>>{if(this!==SharedIndependentParticipantRecovery)throw fail('independent_recovery_policy');return SharedIndependentParticipantRecovery.#open(input,true);}
 static async #open<Q extends SharedSelectionPolicy>(input:SharedIndependentParticipantRecoveryOptions<Q>|SharedIndependentParticipantResumeOptions<Q>,resume:boolean):Promise<SharedIndependentParticipantRecovery<Q>>{
  const context=recoveryOpeningContext(),locks=navigator.locks,base=snapshotIndependentRecovery(input,!resume),life={changed:false},current=()=>{if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_recovery_versionchange');},guard=()=>{current();base.guard();current();},chosen={...base,guard},leases:RecoveryLease[]=[],names=[base.options.database,...Object.values(base.options.destinations)].sort();let db:IDBDatabase|undefined,p:PreparedIndependentRecovery<Q>|undefined,complete=false;
  const opening=await RecoveryOpeningCustody.reserve(context,names,async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>{if(p)archive.dispose.call(p.backup);}),...[...leases].reverse().map(lease=>lease.close())]);if(results.some(row=>row.status==='rejected'))throw fail();},{policy:()=>fail('independent_recovery_policy'),busy:()=>fail('independent_recovery_busy'),storage:()=>fail()});
  try{guard();for(const name of names){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   if(resume){db=await existingDatabase(base.options.database);guard();if(!db)throw fail('independent_recovery_missing');db.onversionchange=()=>{life.changed=true;db!.close();};const saved=await readIndependentRecoveryDatabase(db,base.record,guard);guard();p=await prepareIndependentRecovery(chosen,saved.file);guard();await retained(p,db,[saved.record]);const result=new SharedIndependentParticipantRecovery(key,p,db,leases,saved.record,life);opening.complete();complete=true;return result;}
   p=await prepareIndependentRecovery(chosen,base.file!);guard();for(const name of Object.values(base.options.destinations)){await requireAbsent(name);guard();}db=await createIndependentRecoveryDatabase(base.options.database,base.record,base.file!,guard,base.options.signal);db.onversionchange=()=>{life.changed=true;db!.close();};guard();await retained(p,db,[base.record]);const result=new SharedIndependentParticipantRecovery(key,p,db,leases,base.record,life);opening.complete();complete=true;return result;
  }finally{if(!complete)await opening.rollback();}
 }
 #guard():void{if(this.#closed||this.#closing)throw fail('independent_recovery_closed');this.#p.guard();if(this.#closed||this.#closing)throw fail('independent_recovery_closed');}
 file():Blob{if(this.#closed)throw fail('independent_recovery_closed');return archive.file.call(this.#p.backup);}
 async progress():Promise<SharedIndependentParticipantRecoveryProgress>{this.#guard();const record=await retained(this.#p,this.#db,[this.#record,...(this.#pending?[this.#pending]:[])]);this.#guard();return Object.freeze({phase:record.phase,source:record.source,uploads:record.uploads});}
 async #reconcile():Promise<void>{const current=await retained(this.#p,this.#db,[this.#record,...(this.#pending?[this.#pending]:[])]);this.#guard();this.#record=current;this.#pending=undefined;}
 async #update(next:IndependentRecoveryRecord):Promise<void>{this.#guard();this.#pending=next;await writeIndependentRecoveryRecord(this.#db,this.#record,next,()=>this.#guard(),this.#p.options.signal);this.#guard();this.#record=next;this.#pending=undefined;}
 finish():Promise<RecoveredSharedIndependentParticipant<P>>{
  if(this.#closed||this.#closing)throw fail('independent_recovery_closed');if(this.#running)return this.#running;if(this.#rollback.pending)throw fail('independent_recovery_busy');
  // Reserve before invoking any current-policy callback, including reentry.
  this.#running=Promise.resolve().then(()=>{this.#guard();return this.#finish();}).finally(()=>{this.#running=undefined;});return this.#running;
 }
 async #finish():Promise<RecoveredSharedIndependentParticipant<P>>{
  const p=this.#p,owners:IndependentRecoveryOwners<P>={},cleanup=this.#rollback.retain(()=>closeIndependentOwners(owners,true));let transferred=false;
  try{await this.#reconcile();for(const step of ['source','uploads'] as const){this.#guard();const state=this.#record[step];if(state==='reserved'){await requireAbsent(p.options.destinations[step]);await this.#update({...this.#record,[step]:'started'});}if(step==='source')await restoreIndependentSource(p,owners,state==='complete');else await restoreIndependentUploads(p,owners,state==='complete');this.#guard();checkIndependentOwner(p,owners);if(state!=='complete')await this.#update({...this.#record,[step]:'complete'});}
   await verifyIndependentOwners(p,owners);this.#guard();await this.#reconcile();if(this.#record.phase!=='ready')await this.#update({...this.#record,phase:'ready'});await this.#reconcile();this.#guard();const result=ready({p,owners,db:this.#db,leases:this.#leases,record:this.#record,life:this.#life});cleanup.complete();this.#closed=true;transferred=true;return result;
  }finally{if(!transferred)await cleanup.rollback();}
 }
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=this.#finishClose().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
 async #finishClose():Promise<void>{try{await this.#running;}catch{/* Finish retains its original failure. */}if(this.#closed)return;await this.#rollback.drain();await release(this.#db,this.#leases);archive.dispose.call(this.#p.backup);this.#closed=true;}
}
