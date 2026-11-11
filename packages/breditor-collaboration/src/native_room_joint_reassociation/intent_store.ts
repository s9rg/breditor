/** One absent-only restart association and advisory publication observations.
 * Every open/retry verifies the complete descriptor pin. Saved observations
 * supply neither the actor cohort nor permission to serve or expose it. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {fields,integer} from '../physical_room_record_cut/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {nativePublicationRequest,nativePublicationReceipt} from '../native_publication_control/identity.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import type {JointReassociationChoice} from './contract.js';
import type {JointHandoverReassociationChoice} from './handover_contract.js';
import {jointReassociationChoice,reassociationPredecessorChoice} from './identity.js';
import {jointHandoverReassociationChoice,handoverReassociationPredecessorChoice} from './handover_identity.js';
import {localSnapshot,localJson} from '../selected_local_review_delivery/policy.js';
import {metadataSnapshot,metadataJson} from '../selected_local_metadata_delivery/policy.js';
import {jointIntentFailure as fail,jointEqual as equal} from '../native_room_joint_activation/intent_policy.js';
type StateFormat='breditor/joint-native-room-reassociation-state'|'breditor/joint-native-handover-reassociation-state';
interface PublicationState<Format extends StateFormat> {
 readonly format:Format;readonly formatVersion:1;
 readonly revision:number;readonly phase:'prepared'|'request-started'|'receipt-observed';
 readonly receipt:SharedNativeRoomPublicationReceipt|null;
}
export interface JointReassociationPublicationState extends PublicationState<'breditor/joint-native-room-reassociation-state'> {}
export interface JointHandoverReassociationPublicationState extends PublicationState<'breditor/joint-native-handover-reassociation-state'> {}
type ReassociationChoice=JointReassociationChoice|JointHandoverReassociationChoice;
const tables=['reassociation'],journalKey=Object.freeze({});
/** This digest binds only the new descriptor. Native admission and actual
 * target/metadata checks remain required on every publication attempt. */
export function jointReassociationPublicationBinding(choice:ReassociationChoice){return frozen({bytes:choice.bytes,sha256:Array.from({length:32},(_,i)=>Number.parseInt(choice.sha256.slice(i*2,i*2+2),16))});}
class ReassociationIntentJournal<Format extends StateFormat> {
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #choice;readonly #integrity;readonly #cancel;
 readonly #initial:PublicationState<Format>;readonly #predecessor:(index:number)=>ReassociationChoice;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#db:IDBDatabase|undefined;
 #pending=false;#changed=false;#closing=false;#closed=false;#request:IDBOpenDBRequest|undefined;#reject:((error:unknown)=>void)|undefined;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 constructor(key:object,choice:ReassociationChoice,format:Format,predecessor:(index:number)=>ReassociationChoice,options:SharedArchiveIntegrityOptions){
  if(key!==journalKey)throw fail();
  this.#choice=choice;this.#predecessor=predecessor;
  this.#initial=frozen({format,formatVersion:1,revision:0,phase:'prepared',receipt:null});
  this.#cancel=new PhysicalOperationV3Cancellation(options.signal);
  try{const authority=participantAuthority(options.checkAuthority);this.#integrity=prepareArchiveIntegrity({...options,checkAuthority:()=>{this.#current();authority();this.#current();}});}catch(error){this.#cancel.close();throw error;}
  Object.freeze(this);
 }
 #current=()=>{if(this.#closing||this.#closed||this.#changed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('joint_activation_intent_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);try{this.#cancel.check();}catch{throw fail('joint_activation_intent_closed');}};
 check=()=>{this.#current();this.#integrity.guard();this.#current();};
 #run<T>(work:()=>Promise<T>):Promise<T>{if(this.#running)return Promise.reject(fail('joint_activation_intent_busy'));const job=Promise.resolve().then(()=>{this.check();return work();});this.#running=job;return job.finally(()=>{if(this.#running===job)this.#running=undefined;});}
 #attach(db:IDBDatabase){this.#db=db;db.onclose=()=>{this.#changed=true;};db.onversionchange=()=>{this.#changed=true;db.close();};}
 async #verifyChoice():Promise<void>{
  const original=this.#choice.plan.original,root=new Blob([JSON.stringify(original.plan)]);if(root.size!==original.bytes||await this.#integrity.digest(root)!==original.sha256)throw fail('joint_activation_intent_integrity');this.check();
  for(const selected of [...this.#choice.plan.predecessors.map((_row,i)=>this.#predecessor(i)),this.#choice]){
   const file=new Blob([JSON.stringify(selected.plan)]);if(file.size!==selected.bytes||await this.#integrity.digest(file)!==selected.sha256)throw fail('joint_activation_intent_integrity');this.check();
  }
  for(const row of [...this.#choice.plan.predecessors,this.#choice.plan]){
   const prior=row.prior;if(prior.format==='breditor/metadata-continuation-absence')continue;
   const choice=prior.format==='breditor/handover-metadata-continuation-evidence'?prior.choice.continuation:prior.choice;
   if(prior.review!==null){const snapshot=await localSnapshot(this.#parse(prior.review),choice.review);if(localJson(snapshot)!==prior.review)throw fail('joint_activation_intent_integrity');this.check();}
   if(prior.metadata!==null){const snapshot=await metadataSnapshot(this.#parse(prior.metadata),choice.metadata);if(metadataJson(snapshot)!==prior.metadata)throw fail('joint_activation_intent_integrity');this.check();}
  }
 }
 #parse(text:string):unknown{try{return JSON.parse(text);}catch{throw fail('joint_activation_intent_integrity');}}
 #state(input:unknown):PublicationState<Format>{
  const r=fields(input,['format','formatVersion','revision','phase','receipt']),revision=integer(r['revision'],4096),phase=r['phase'];
  if(r['format']!==this.#initial.format||r['formatVersion']!==1||!['prepared','request-started','receipt-observed'].includes(phase as string)||(phase==='prepared')!==(revision===0))throw fail('joint_activation_intent_integrity');
  const receipt=r['receipt']===null?null:nativePublicationReceipt(JSON.stringify(r['receipt']),nativePublicationRequest(this.#choice.plan.publication,jointReassociationPublicationBinding(this.#choice)));
  if((phase==='receipt-observed')!==(receipt!==null)||phase==='receipt-observed'&&revision<2)throw fail('joint_activation_intent_integrity');
  return frozen({format:this.#initial.format,formatVersion:1 as const,revision,phase:phase as PublicationState<Format>['phase'],receipt});
 }
 /** Creation never overwrites; reopen never creates a missing placeholder. */
 open(create=false):Promise<PublicationState<Format>>{return this.#run(async()=>{
  if(this.#db||this.#opening)throw fail('joint_activation_intent_busy');await this.#verifyChoice();
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[this.#choice.plan.database],()=>this.#close(),{policy:()=>fail(),busy:()=>fail('joint_activation_intent_busy'),storage:()=>fail('joint_activation_intent_storage')});this.check();this.#lease=await RecoveryLease.acquire(JSON.stringify(this.#choice.plan.database));this.check();
  await new Promise<void>((resolve,reject)=>{
   const q=this.#factory.open(this.#choice.plan.database,1);let created=false,refused=false,reason:unknown,unwatch=()=>{};this.#pending=true;this.#request=q;this.#reject=reject;
   const abort=(error:unknown)=>{refused=true;reason=error;if(q.transaction){try{q.transaction.abort();}catch{}}else reject(error);},done=()=>{
    this.#pending=false;this.#request=undefined;this.#reject=undefined;unwatch();
    // A caller may have stopped waiting before IndexedDB settled the open.
    // The retained rollback can now release custody without that caller.
    if(this.#closing)void this.#opening?.rollback().catch(()=>{});
   };
   try{unwatch=this.#cancel.watch(()=>abort(fail('joint_activation_intent_closed')));}catch(error){abort(error);}
   q.onupgradeneeded=event=>{this.#attach(q.result);try{this.check();if(refused)throw reason;if(event.oldVersion!==0)throw fail('joint_activation_intent_exists');if(!create)throw fail('joint_activation_intent_missing');const store=q.result.createObjectStore('reassociation');store.add(JSON.stringify(this.#choice),'choice');store.add(JSON.stringify(this.#initial),'state');created=true;this.check();}catch(error){abort(error);}};
   q.onblocked=()=>{refused=true;reason=fail('joint_activation_intent_busy');reject(reason);};q.onerror=()=>{done();reject(refused?reason:fail('joint_activation_intent_storage'));};q.onsuccess=()=>{this.#attach(q.result);done();try{this.check();if(refused)throw reason;if(create&&!created)throw fail('joint_activation_intent_exists');if(q.result.version!==1||!equal([...q.result.objectStoreNames],tables))throw fail('joint_activation_intent_integrity');resolve();}catch(error){reject(error);}};
  });return this.#read();
 });}
 #transaction<T>(mode:IDBTransactionMode,visit:(rows:ReadonlyMap<string,unknown>,tx:IDBTransaction)=>T):Promise<T>{
  this.check();if(!this.#db)throw fail('joint_activation_intent_closed');return new Promise((resolve,reject)=>{
   const tx=this.#db!.transaction(tables,mode),store=tx.objectStore('reassociation');let reason:unknown,failed=false,ready=false,result:T,unwatch=()=>{};const abort=(error:unknown)=>{failed=true;reason=error;try{tx.abort();}catch{}};tx.onerror=()=>{};
   try{unwatch=this.#cancel.watch(()=>abort(fail('joint_activation_intent_closed')));}catch(error){abort(error);}
   settleOwnedTransaction(tx,()=>{unwatch();this.check();if(!ready)throw fail('joint_activation_intent_integrity');return result;},()=>{unwatch();return failed?reason:fail('joint_activation_intent_storage');},resolve,reject);
   if(store.keyPath!==null||store.autoIncrement||store.indexNames.length){abort(fail('joint_activation_intent_integrity'));return;}
   const count=store.count();count.onsuccess=()=>{try{this.check();if(count.result!==2)throw fail('joint_activation_intent_integrity');const keys=store.getAllKeys(undefined,3),data=store.getAll(undefined,3);let received=0;const take=()=>{if(++received!==2)return;try{this.check();if(!equal(keys.result,['choice','state'])||data.result.length!==2)throw fail('joint_activation_intent_integrity');const rows=new Map(keys.result.map((key,i)=>[key as string,data.result[i]]));if(rows.get('choice')!==JSON.stringify(this.#choice))throw fail('joint_activation_intent_integrity');result=visit(rows,tx);ready=true;}catch(error){abort(error);}};keys.onsuccess=take;data.onsuccess=take;}catch(error){abort(error);}};
  });
 }
 async #read():Promise<PublicationState<Format>>{await this.#verifyChoice();const text=await this.#transaction('readonly',rows=>rows.get('state'));if(typeof text!=='string'||new TextEncoder().encode(text).length>128*1024)throw fail('joint_activation_intent_integrity');let state:PublicationState<Format>;try{state=this.#state(JSON.parse(text));}catch{throw fail('joint_activation_intent_integrity');}if(JSON.stringify(state)!==text)throw fail('joint_activation_intent_integrity');return state;}
 read():Promise<PublicationState<Format>>{return this.#run(()=>this.#read());}
 #advance(receipt:SharedNativeRoomPublicationReceipt|undefined):Promise<PublicationState<Format>>{return this.#run(async()=>{
  const before=await this.#read();this.check();const chosen=receipt===undefined?null:nativePublicationReceipt(JSON.stringify(receipt),nativePublicationRequest(this.#choice.plan.publication,jointReassociationPublicationBinding(this.#choice)));
  if(before.phase==='receipt-observed'){if(chosen&&!equal(chosen,before.receipt))throw fail('joint_activation_intent_integrity');return before;}
  if(before.revision>=4096||chosen&&before.phase!=='request-started')throw fail();const next=this.#state({format:this.#initial.format,formatVersion:1,revision:before.revision+1,phase:chosen?'receipt-observed':'request-started',receipt:chosen}),old=JSON.stringify(before),text=JSON.stringify(next);
  await this.#transaction('readwrite',(rows,tx)=>{if(rows.get('state')!==old)throw fail('joint_activation_intent_stale');tx.objectStore('reassociation').put(text,'state');});
  const after=await this.#read();if(!equal(after,next))throw fail('joint_activation_intent_stale');return after;
 });}
 markPublicationStarted():Promise<PublicationState<Format>>{return this.#advance(undefined);}
 markPublicationObserved(receipt:SharedNativeRoomPublicationReceipt):Promise<PublicationState<Format>>{return this.#advance(receipt);}
 close():Promise<void>{
  this.#closing=true;
  if(this.#pending){this.#reject?.(fail('joint_activation_intent_closed'));try{this.#request?.transaction?.abort();}catch{}}
  return this.#close().then(()=>this.#opening?.rollback(),error=>{
   // Queued opens keep their reservation until the request settles.
   if(!this.#pending)this.#opening?.retainFailedCleanup();
   throw error;
  });
 }
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;const task=Promise.resolve().then(async()=>{await this.#running?.catch(()=>{});if(this.#pending)throw fail('joint_activation_intent_busy');if(this.#db){this.#db.onclose=null;this.#db.onversionchange=null;this.#db.close();}await this.#lease?.close();this.#db=undefined;this.#lease=undefined;this.#cancel.close();this.#closed=true;});this.#cleanup=task.finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}

export class JointReassociationIntentStore extends ReassociationIntentJournal<JointReassociationPublicationState['format']> {
 constructor(choice:JointReassociationChoice,options:SharedArchiveIntegrityOptions){
  const selected=jointReassociationChoice(choice);
  super(journalKey,selected,'breditor/joint-native-room-reassociation-state',index=>reassociationPredecessorChoice(selected.plan,index),options);
 }
}
export class JointHandoverReassociationIntentStore extends ReassociationIntentJournal<JointHandoverReassociationPublicationState['format']> {
 constructor(choice:JointHandoverReassociationChoice,options:SharedArchiveIntegrityOptions){
  const selected=jointHandoverReassociationChoice(choice);
  super(journalKey,selected,'breditor/joint-native-handover-reassociation-state',index=>handoverReassociationPredecessorChoice(selected.plan,index),options);
 }
}
