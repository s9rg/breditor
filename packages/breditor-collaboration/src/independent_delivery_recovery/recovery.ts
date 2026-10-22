/** Resumable complete-delivery + whole-upload custody. Local readiness is never room activation. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import {deliveryRecoverySource as sourceRead} from './source.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {deliveryRecoveryArchive as archive} from './archive.js';
import {snapshotIndependentDeliveryRecovery,prepareIndependentDeliveryRecovery,type PreparedIndependentDeliveryRecovery} from './prepare.js';
import {createIndependentDeliveryRecoveryDatabase,readIndependentDeliveryRecoveryDatabase,writeIndependentDeliveryRecoveryRecord} from './database.js';
import type {IndependentDeliveryRecoveryRecord} from './record.js';
import {restoreIndependentDeliverySource,restoreIndependentDeliveryUploads,checkIndependentDeliveryOwner,verifyIndependentDeliveryOwners,closeIndependentDeliveryOwners,checkIndependentDeliveryUploadCustody,releaseIndependentDeliveryUploadCustody,type IndependentDeliveryRecoveryOwners} from './components.js';
import type {SharedIndependentDeliveryParticipantRecoveryOptions,SharedIndependentDeliveryParticipantResumeOptions,SharedIndependentDeliveryParticipantRecoveryProgress} from './contract.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';
const key=Object.freeze({});
export interface IndependentDeliveryRecoveryCustody<P extends SharedSelectionPolicy>{p:PreparedIndependentDeliveryRecovery<P>;owners:IndependentDeliveryRecoveryOwners<P>;db:IDBDatabase;leases:RecoveryLease[];record:IndependentDeliveryRecoveryRecord;life:{changed:boolean}}
export interface RecoveredSharedIndependentDeliveryParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:Readonly<{session:SharedIndependentDeliverySession<P>}>;readonly uploads:RichAssetStore}
async function release(db:IDBDatabase,leases:RecoveryLease[]):Promise<void>{const results=await Promise.allSettled([...leases].reverse().map(lease=>lease.close()));if(results.some(r=>r.status==='rejected'))throw fail();db.close();}
/** Verify the retained original bytes on every public boundary; markers alone cannot certify them. */
async function retained<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,db:IDBDatabase,accepted:readonly IndependentDeliveryRecoveryRecord[]):Promise<IndependentDeliveryRecoveryRecord>{
 p.guard();const value=await readIndependentDeliveryRecoveryDatabase(db,p.record);p.guard();if(!accepted.some(record=>JSON.stringify(record)===JSON.stringify(value.record)))throw fail('independent_delivery_recovery_diverged');if(await independentDeliveryParticipantDigest(value.file,p.options.signal)!==p.options.expected.sha256)throw fail('independent_delivery_recovery_integrity');p.guard();return value.record;
}
let ready:<P extends SharedSelectionPolicy>(state:IndependentDeliveryRecoveryCustody<P>)=>RecoveredSharedIndependentDeliveryParticipant<P>;
let transfer:<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedIndependentDeliveryParticipant<P>,take:(state:IndependentDeliveryRecoveryCustody<P>)=>Promise<T>,verify:(value:T)=>void)=>Promise<T>;
/** Internal genuine-owner transfer for the subsequent operation/room parent, never a DTO adoption hook. */
export function transferRecoveredIndependentDeliveryParticipant<P extends SharedSelectionPolicy,T>(owner:RecoveredSharedIndependentDeliveryParticipant<P>,take:(state:IndependentDeliveryRecoveryCustody<P>)=>Promise<T>,verify:(value:T)=>void):Promise<T>{return transfer(owner,take,verify);}
export class RecoveredSharedIndependentDeliveryParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:IndependentDeliveryRecoveryCustody<P>;readonly #file:Blob;#closed=false;#busy=false;#released=false;
 private constructor(token:object,state:IndependentDeliveryRecoveryCustody<P>){if(token!==key)throw fail('independent_delivery_recovery_closed');this.#state=state;this.#file=archive.file.call(state.p.backup);Object.freeze(this);}
 static{ready=<Q extends SharedSelectionPolicy>(state:IndependentDeliveryRecoveryCustody<Q>)=>new RecoveredSharedIndependentDeliveryParticipant(key,state);
  transfer=async(owner,take,verify)=>{owner.#start();try{const s=owner.#state;await retained(s.p,s.db,[s.record]);await verifyIndependentDeliveryOwners(s.p,s.owners);await retained(s.p,s.db,[s.record]);s.p.guard();const value=await take(s);s.p.guard();verify(value);checkIndependentDeliveryOwner(s.p,s.owners);checkIndependentDeliveryUploadCustody(s.owners);owner.#closed=true;return value;}finally{owner.#busy=false;}};
 }
 #start():void{if(this.#closed||this.#released)throw fail('independent_delivery_recovery_closed');if(this.#busy)throw fail('independent_delivery_recovery_busy');this.#busy=true;}
 file():Blob{if(this.#closed)throw fail('independent_delivery_recovery_closed');return this.#file;}
 /** No session escapes until exact native, packet, upload and current-policy checks have passed. */
 async intoParts():Promise<Readonly<RecoveredSharedIndependentDeliveryParticipantParts<P>>>{
  this.#start();let capture:ReturnType<typeof sourceRead.capture>|undefined;
  try{const s=this.#state;await retained(s.p,s.db,[s.record]);await verifyIndependentDeliveryOwners(s.p,s.owners);await retained(s.p,s.db,[s.record]);s.p.guard();const parts=Object.freeze({source:Object.freeze({session:s.owners.session!}),uploads:s.owners.uploads!});capture=sourceRead.capture(parts.source);await release(s.db,s.leases);this.#released=true;s.p.guard();sourceRead.check(capture);checkIndependentDeliveryOwner(s.p,s.owners);archive.dispose.call(s.p.backup);s.p.guard();sourceRead.check(capture);releaseIndependentDeliveryUploadCustody(s.owners);this.#closed=true;return parts;}
  finally{if(capture)sourceRead.dispose(capture);this.#busy=false;}
 }
 async close():Promise<void>{await this.#close(false);}
 async discardAndClose():Promise<void>{await this.#close(true);}
 async #close(discard:boolean):Promise<void>{if(this.#closed)return;if(this.#busy)throw fail('independent_delivery_recovery_busy');this.#busy=true;try{const s=this.#state;await closeIndependentDeliveryOwners(s.owners,discard);await release(s.db,s.leases);this.#released=true;archive.dispose.call(s.p.backup);this.#closed=true;}finally{this.#busy=false;}}
}
export class SharedIndependentDeliveryParticipantRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #p:PreparedIndependentDeliveryRecovery<P>;readonly #db:IDBDatabase;readonly #leases:RecoveryLease[];readonly #life:{changed:boolean};#record:IndependentDeliveryRecoveryRecord;#pending:IndependentDeliveryRecoveryRecord|undefined;#closed=false;#closing=false;#running:Promise<RecoveredSharedIndependentDeliveryParticipant<P>>|undefined;
 readonly #rollback=new RecoveryCleanupScope(()=>fail());
 private constructor(token:object,p:PreparedIndependentDeliveryRecovery<P>,db:IDBDatabase,leases:RecoveryLease[],record:IndependentDeliveryRecoveryRecord,life:{changed:boolean}){if(token!==key)throw fail('independent_delivery_recovery_closed');this.#p=p;this.#db=db;this.#leases=leases;this.#record=record;this.#life=life;Object.freeze(this);}
 static begin<Q extends SharedSelectionPolicy>(input:SharedIndependentDeliveryParticipantRecoveryOptions<Q>):Promise<SharedIndependentDeliveryParticipantRecovery<Q>>{return this.#open(input,false);}
 static resume<Q extends SharedSelectionPolicy>(input:SharedIndependentDeliveryParticipantResumeOptions<Q>):Promise<SharedIndependentDeliveryParticipantRecovery<Q>>{return this.#open(input,true);}
 static async #open<Q extends SharedSelectionPolicy>(input:SharedIndependentDeliveryParticipantRecoveryOptions<Q>|SharedIndependentDeliveryParticipantResumeOptions<Q>,resume:boolean):Promise<SharedIndependentDeliveryParticipantRecovery<Q>>{
  const base=snapshotIndependentDeliveryRecovery(input,!resume),context=recoveryOpeningContext(),locks=navigator.locks,file=resume?undefined:archive.file.call((input as SharedIndependentDeliveryParticipantRecoveryOptions<Q>).backup),life={changed:false},current=()=>{if(life.changed||globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw fail('independent_delivery_recovery_versionchange');},guard=()=>{current();base.guard();current();},chosen={...base,guard},leases:RecoveryLease[]=[],names=[base.options.database,...Object.values(base.options.destinations)].sort();let db:IDBDatabase|undefined,p:PreparedIndependentDeliveryRecovery<Q>|undefined,complete=false;guard();
  const opening=await RecoveryOpeningCustody.reserve(context,names,async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>{if(p)archive.dispose.call(p.backup);}),...[...leases].reverse().map(lease=>lease.close())]);if(results.some(r=>r.status==='rejected'))throw fail();},{policy:()=>fail('independent_delivery_recovery_policy'),busy:()=>fail('independent_delivery_recovery_busy'),storage:()=>fail()});
  try{for(const name of names){guard();leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   if(resume){db=await existingDatabase(base.options.database);guard();if(!db)throw fail('independent_delivery_recovery_missing');db.onversionchange=()=>{life.changed=true;db!.close();};const saved=await readIndependentDeliveryRecoveryDatabase(db,base.record);guard();p=await prepareIndependentDeliveryRecovery(chosen,saved.file);guard();await retained(p,db,[saved.record]);const owner=new SharedIndependentDeliveryParticipantRecovery(key,p,db,leases,saved.record,life);opening.complete();complete=true;return owner;}
   p=await prepareIndependentDeliveryRecovery(chosen,file!);guard();for(const name of Object.values(base.options.destinations)){await requireAbsent(name);guard();}db=await createIndependentDeliveryRecoveryDatabase(base.options.database,base.record,file!,guard);db.onversionchange=()=>{life.changed=true;db!.close();};guard();await retained(p,db,[base.record]);const owner=new SharedIndependentDeliveryParticipantRecovery(key,p,db,leases,base.record,life);opening.complete();complete=true;return owner;
  }finally{if(!complete)await opening.rollback();}
 }
 #guard():void{if(this.#closed||this.#closing)throw fail('independent_delivery_recovery_closed');this.#p.guard();}
 file():Blob{if(this.#closed)throw fail('independent_delivery_recovery_closed');return archive.file.call(this.#p.backup);}
 async progress():Promise<SharedIndependentDeliveryParticipantRecoveryProgress>{this.#guard();const record=await retained(this.#p,this.#db,[this.#record,...(this.#pending?[this.#pending]:[])]);this.#guard();return Object.freeze({phase:record.phase,source:record.source,uploads:record.uploads});}
 async #reconcile():Promise<void>{const current=await retained(this.#p,this.#db,[this.#record,...(this.#pending?[this.#pending]:[])]);this.#guard();this.#record=current;this.#pending=undefined;}
 async #update(next:IndependentDeliveryRecoveryRecord):Promise<void>{this.#guard();this.#pending=next;await writeIndependentDeliveryRecoveryRecord(this.#db,this.#record,next,()=>this.#guard());this.#guard();this.#record=next;this.#pending=undefined;}
 finish():Promise<RecoveredSharedIndependentDeliveryParticipant<P>>{this.#guard();if(this.#running)return this.#running;if(this.#rollback.pending)throw fail('independent_delivery_recovery_busy');this.#running=this.#finish().finally(()=>{this.#running=undefined;});return this.#running;}
 async #finish():Promise<RecoveredSharedIndependentDeliveryParticipant<P>>{
  const p=this.#p,owners:IndependentDeliveryRecoveryOwners<P>={},cleanup=this.#rollback.retain(()=>closeIndependentDeliveryOwners(owners,true));let transferred=false;
  try{await this.#reconcile();for(const step of ['source','uploads'] as const){this.#guard();const state=this.#record[step];if(state==='reserved'){await requireAbsent(p.options.destinations[step]);await this.#update({...this.#record,[step]:'started'});}
    if(step==='source')await restoreIndependentDeliverySource(p,owners,state==='complete');else await restoreIndependentDeliveryUploads(p,owners,state==='complete');this.#guard();checkIndependentDeliveryOwner(p,owners);if(state!=='complete')await this.#update({...this.#record,[step]:'complete'});
   }
   await verifyIndependentDeliveryOwners(p,owners);this.#guard();await this.#reconcile();if(this.#record.phase!=='ready')await this.#update({...this.#record,phase:'ready'});await this.#reconcile();this.#guard();const result=ready({p,owners,db:this.#db,leases:this.#leases,record:this.#record,life:this.#life});cleanup.complete();this.#closed=true;transferred=true;return result;
  }finally{if(!transferred)await cleanup.rollback();}
 }
 /** Settle actual in-flight cleanup before releasing coordinator locks; committed data is never deleted. */
 async close():Promise<void>{if(this.#closed)return;this.#closing=true;try{await this.#running;}catch{/* finish retains its original failure. */}if(this.#closed)return;await this.#rollback.drain();await release(this.#db,this.#leases);archive.dispose.call(this.#p.backup);this.#closed=true;}
}
