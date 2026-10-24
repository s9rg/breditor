/** Private resumable whole-input/source/upload coordinator. Native history is restored
 * by the actual source component while genuine asset custody stays held. A ready row
 * never grants permission or substitutes for either owner. No network starts here. */
import type {SharedSelectionPolicy} from '../types.js';
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {prepareSourceUploadHandoff,type SourceUploadHandoff} from '../operation_cohort/source_handoff.js';
import {prepareOperationalCohort,type OperationalCohortReservation} from '../operation_cohort/cohort.js';
import type {RestoredOperationParticipantParts} from './parts.js';
import {readRestoredOperationInput,type RestoredOperationInput} from '../restored_operation/input.js';
import {openRestoredOperationSource} from '../restored_operation/open_source.js';
import {restoredOperationJournalBinding} from '../restored_operation/journal.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody} from '../participant_recovery/opening_custody.js';
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import {restoredParticipantPolicy,type RestoredParticipantOptions} from './policy.js';
import {initialRestoredParticipant,readRestoredParticipantRecord,type RestoredParticipantRecord} from './record.js';
import {createRestoredParticipantDatabase,existingRestoredParticipantDatabase,readRestoredParticipantDatabase,writeRestoredParticipantDatabase} from './database.js';
import {checkRestoredUploads,openRestoredUploads,verifyRestoredUploads,closeRestoredUploads,restoredUploadCustody,type RestoredUploadOwners} from './uploads.js';
import {operationalReadReservation,type OperationalReadReservation} from '../operation_read/reservation.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {makeFreshRestoredDeliveryHistoryRead,type FreshRestoredDeliveryHistoryOptions,type FreshRestoredDeliveryHistoryRead} from './fresh_parent_history.js';
type Pair<P extends SharedSelectionPolicy>=Awaited<ReturnType<typeof openRestoredOperationSource<P>>>;
interface State<P extends SharedSelectionPolicy>{readonly choice:ReturnType<typeof restoredParticipantPolicy<P>>;readonly input:RestoredOperationInput;readonly plan:string;db:IDBDatabase;dbClosed:boolean;leases:RecoveryLease[];leasesReleased:boolean;inputRetired:boolean;readonly uploads:RestoredUploadOwners;pair?:Pair<P>}
export type RestoredDeliveryParentCustody<P extends SharedSelectionPolicy=SharedSelectionPolicy>=State<P>;
const key=Object.freeze({}),closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
const errors={policy:()=>fail('restored_participant_policy'),busy:()=>fail('restored_participant_busy'),storage:()=>fail('restored_participant_cleanup')};
const coordinatorNames=(s:State<SharedSelectionPolicy>['choice'])=>[s.database,s.sourceDatabase,s.uploadsDatabase].sort();
async function present(name:string):Promise<boolean>{const db=await existingDatabase(name);if(!db)return false;db.close();return true;}
async function releaseLeases<P extends SharedSelectionPolicy>(s:State<P>):Promise<void>{if(s.leasesReleased)return;const done=await Promise.allSettled([...s.leases].reverse().map(lease=>lease.close()));if(done.some(r=>r.status==='rejected'))throw fail('restored_participant_cleanup');s.leasesReleased=true;}
function retireInput<P extends SharedSelectionPolicy>(s:State<P>){if(!s.inputRetired){s.input.dispose();s.inputRetired=true;}}
async function closeState<P extends SharedSelectionPolicy>(s:State<P>,discard:boolean):Promise<void>{
 if(s.pair)await(discard?discardSource:closeSource).call(s.pair.source);await closeRestoredUploads(s.uploads);await releaseLeases(s);retireInput(s);if(!s.dbClosed){s.db.close();s.dbClosed=true;}
}
function fence<P extends SharedSelectionPolicy>(s:State<P>){s.db.onversionchange=()=>{s.choice.life.changed=true;s.db.close();s.dbClosed=true;};}
/** Actual source/origin lifetime and both native/companion epochs remain held
 * after temporary input/coordinator cleanup and through the final group fence. */
async function witness<P extends SharedSelectionPolicy>(s:State<P>){
 s.choice.guard();if(!s.pair)throw fail('restored_participant_not_ready');const source=s.pair.source,port=independentDeliverySource(source),managed=independentDeliverySessionPort(source).check,scope=restoredOperationJournalBinding(s.pair.journal).borrowRead(source,s.choice.guard,s.input.options.signal);let returned=false;
 try{const data=scope.readSource(),stamp=port.stamp(),current=()=>{scope.checkCurrent();managed();checkRestoredUploads(s.uploads);const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp[i]))throw fail('restored_participant_source_changed');},check=()=>{scope.check();current();if(JSON.stringify(port.read())!==JSON.stringify(data))throw fail('restored_participant_source_changed');current();};
  check();await scope.readSnapshot();check();await verifyRestoredUploads(s.input,s.uploads,false,check);check();const result={check,current,release:scope.release};check();returned=true;return result;
 }finally{if(!returned)scope.release();}
}
let reserve:<P extends SharedSelectionPolicy>(owners:readonly RestoredOperationParticipant<P>[])=>OperationalCohortReservation<Readonly<RestoredOperationParticipantParts<P>>>;
let reserveRead:<P extends SharedSelectionPolicy>(owners:readonly RestoredOperationParticipant<P>[])=>OperationalReadReservation<Readonly<RestoredOperationParticipantParts<P>>>;
let reserveFreshRead:<P extends SharedSelectionPolicy>(owner:RestoredOperationParticipant<P>,read:FreshRestoredDeliveryHistoryOptions<P>,authority:()=>void,signal?:AbortSignal)=>FreshRestoredDeliveryHistoryRead;
/** Fresh parent/input/native read; no mutable delivery owner is projected. */
export function reserveFreshRestoredDeliveryHistoryRead<P extends SharedSelectionPolicy>(owner:RestoredOperationParticipant<P>,read:FreshRestoredDeliveryHistoryOptions<P>,checkAuthority:()=>void,signal?:AbortSignal){return reserveFreshRead(owner,read,checkAuthority,signal);}
/** Non-consuming graph read, retaining input, coordinator and source leases. */
export function reserveRestoredOperationRead<P extends SharedSelectionPolicy>(owners:readonly RestoredOperationParticipant<P>[]):OperationalReadReservation<Readonly<RestoredOperationParticipantParts<P>>>{return reserveRead(owners);}
/** Genuine restored-graph parents use their own input/journal/source contract;
 * no local provenance or caller readiness flag supplies this reservation. */
export function reserveRestoredOperationGroup<P extends SharedSelectionPolicy>(owners:readonly RestoredOperationParticipant<P>[]):OperationalCohortReservation<Readonly<RestoredOperationParticipantParts<P>>>{return reserve(owners);}
export class RestoredOperationParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly #state:State<P>;#exposed=false;#closed=false;#busy=false;#readToken:object|undefined;
 private constructor(token:object,state:State<P>){if(token!==key)throw fail('restored_participant_closed');this.#state=state;Object.freeze(this);}
 static{reserveFreshRead=(owner,read,authority,signal)=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('restored_participant_policy');owner.#start();const token={};owner.#readToken=token;let released=false;
  const held=()=>{if(released||owner.#closed||!owner.#exposed||!owner.#busy||owner.#readToken!==token)throw fail('restored_participant_closed');},release=()=>{if(released)return;held();released=true;owner.#readToken=undefined;owner.#busy=false;};
  try{return makeFreshRestoredDeliveryHistoryRead(owner.#state,held,release,read,authority,signal);}catch(error){release();throw error;}
 };}
 static{reserve=<Q extends SharedSelectionPolicy>(provided:readonly RestoredOperationParticipant<Q>[])=>{
  const owners=snapshotInventoryInputs(provided,()=>fail('restored_participant_policy'),owner=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('restored_participant_policy');if(!owner.#exposed||owner.#closed)throw fail('restored_participant_closed');if(owner.#busy)throw fail('restored_participant_busy');return owner;});
  if(new Set(owners).size!==owners.length)throw fail('restored_participant_policy');for(const owner of owners)owner.#busy=true;
  const witnesses:Awaited<ReturnType<typeof witness>>[]=[],handoffs:SourceUploadHandoff<Readonly<RestoredOperationParticipantParts<Q>>>[]=[];let finished=false,started=false;
  const current=()=>{if(finished||handoffs.length!==owners.length)throw fail('restored_participant_closed');};
  const abandon=()=>{if(finished)return;finished=true;try{for(const h of handoffs)h.abandon();}finally{try{for(const w of witnesses)w.release();}finally{for(const owner of owners)owner.#busy=false;}}};
  try{const part=(index:number)=>{const h=handoffs[index];if(!h)throw fail('restored_participant_closed');return h.value;},states=Object.freeze(owners.map((_,i)=>Object.freeze({get source(){return part(i).source;},get uploads(){return part(i).uploads;}})));
   return{states,assetStores:[],
    async verify(){if(finished||started)throw fail('restored_participant_busy');started=true;for(const owner of owners){await owner.#verify();const s=owner.#state,w=await witness(s);witnesses.push(w);await releaseLeases(s);w.check();retireInput(s);w.check();if(!s.dbClosed){s.db.close();s.dbClosed=true;}w.check();handoffs.push(prepareSourceUploadHandoff({source:s.pair!.source,check:w.check,current:w.current,uploads:()=>{restoredUploadCustody.release.call(s.uploads.custody!);return s.uploads.store!;},release:w.release,closed:()=>fail('restored_participant_closed'),createParts(readSource,readUploads){const source=Object.freeze({get session(){return readSource();}});return Object.freeze({get source(){readSource();return source;},get uploads(){return readUploads();}});}}));}},
    markReleased(){current();},checkBindings(){current();},disposeAuxiliaries(){current();},
    checkCurrent(){current();for(const h of handoffs)h.check();},checkManaged(){current();for(const h of handoffs)h.checkCurrent();},
    consume(){for(const h of handoffs)h.consume();for(const owner of owners){owner.#closed=true;owner.#busy=false;}finished=true;},abandon,
   };
  }catch(error){abandon();throw error;}
 };}
 static{reserveRead=<Q extends SharedSelectionPolicy>(provided:readonly RestoredOperationParticipant<Q>[])=>{
  const error=()=>fail('restored_participant_busy'),owners=snapshotInventoryInputs(provided,()=>fail('restored_participant_policy'),owner=>{if(!owner||typeof owner!=='object'||!(#state in owner))throw fail('restored_participant_policy');owner.#readable();if(owner.#busy)throw error();return owner;});
  if(new Set(owners).size!==owners.length)throw fail('restored_participant_policy');for(const owner of owners)owner.#busy=true;
  try{return operationalReadReservation(owners.length,async index=>{
   const owner=owners[index]!,s=owner.#state;checkRecoveryLeasesHeld(s.leases);await owner.#verify();const held=await witness(s);let complete=false;
   const current=()=>{if(owner.#closed||!owner.#busy||s.leasesReleased||s.dbClosed||s.inputRetired)throw error();checkRecoveryLeasesHeld(s.leases);held.current();};
   try{current();const value=Object.freeze({source:Object.freeze({session:s.pair!.source}),uploads:s.uploads.store!});
    const result={value,check:()=>{held.check();current();},current,async verify(){checkRecoveryLeasesHeld(s.leases);await owner.#verify();held.check();current();},release:held.release};current();complete=true;return result;
   }finally{if(!complete)held.release();}
  },()=>{for(const owner of owners)owner.#busy=false;},error);}catch(error){for(const owner of owners)owner.#busy=false;throw error;}
 };}
 static begin<Q extends SharedSelectionPolicy>(file:Blob,options:RestoredParticipantOptions<Q>):Promise<RestoredOperationParticipant<Q>>{return RestoredOperationParticipant.#open(options,file);}
 static resume<Q extends SharedSelectionPolicy>(options:RestoredParticipantOptions<Q>):Promise<RestoredOperationParticipant<Q>>{return RestoredOperationParticipant.#open(options);}
 static async #open<Q extends SharedSelectionPolicy>(options:RestoredParticipantOptions<Q>,file?:Blob):Promise<RestoredOperationParticipant<Q>>{
  const choice=restoredParticipantPolicy(options),leases:RecoveryLease[]=[];let opening:RecoveryOpeningCustody|undefined,db:IDBDatabase|undefined,input:RestoredOperationInput|undefined,state:State<Q>|undefined;
  try{
   opening=await RecoveryOpeningCustody.reserve(choice.context,choice.names,async()=>{if(state){await closeState(state,true);return;}input?.dispose();db?.close();const done=await Promise.allSettled([...leases].reverse().map(lease=>lease.close()));if(done.some(r=>r.status==='rejected'))throw fail('restored_participant_cleanup');},errors);choice.guard();
   for(const name of[choice.database,choice.sourceDatabase,choice.uploadsDatabase].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));choice.guard();}
   if(file===undefined){db=await existingRestoredParticipantDatabase(choice.database);choice.guard();file=(await readRestoredParticipantDatabase(db)).file;choice.guard();}
   input=await readRestoredOperationInput(file,choice.sourceOptions) as unknown as RestoredOperationInput;choice.guard();
   const plan=JSON.stringify({format:'breditor/shared-restored-participant-plan',formatVersion:1,input:{kind:input.kind,selection:input.selection,fileSha256:input.fileSha256},databases:{coordinator:choice.database,journal:choice.journalDatabase,source:choice.sourceDatabase,uploads:choice.uploadsDatabase}});
   db??=await createRestoredParticipantDatabase(choice.database,initialRestoredParticipant(plan),input.file,choice.guard);choice.guard();
   state={choice,input,plan,db,dbClosed:false,leases,leasesReleased:false,inputRetired:false,uploads:{}};fence(state);const result=new RestoredOperationParticipant(key,state);await result.#read();choice.guard();opening.complete();result.#exposed=true;return result;
  }catch(e){if(opening)await opening.rollback();throw e;}
 }
 #readable(){if(!this.#exposed||this.#closed)throw fail('restored_participant_closed');}
 #start(){this.#readable();if(this.#busy)throw fail('restored_participant_busy');this.#busy=true;}
 async #database(){const s=this.#state;s.choice.guard();if(s.leasesReleased){const leases:RecoveryLease[]=[];try{for(const name of coordinatorNames(s.choice)){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));s.choice.guard();}s.leases=leases;s.leasesReleased=false;}catch(e){await Promise.allSettled(leases.map(l=>l.close()));throw e;}}
  if(s.dbClosed){s.db=await existingRestoredParticipantDatabase(s.choice.database);s.dbClosed=false;fence(s);s.choice.guard();}return s.db;
 }
 async #read():Promise<RestoredParticipantRecord>{const s=this.#state,db=await this.#database();s.choice.guard();const raw=await readRestoredParticipantDatabase(db);s.choice.guard();if(await digest(raw.file,s.input.options.signal)!==s.input.fileSha256)throw fail('restored_participant_input_changed');s.choice.guard();return readRestoredParticipantRecord(raw.record,s.plan);}
 async #move(before:RestoredParticipantRecord,next:RestoredParticipantRecord){const s=this.#state;await writeRestoredParticipantDatabase(s.db,before,next,s.choice.guard);s.choice.guard();}
 #sourceCheck(stamp?:readonly object[]){const s=this.#state;s.choice.guard();if(!s.pair)throw fail('restored_participant_source');const b=restoredOperationJournalBinding(s.pair.journal),port=independentDeliverySource(s.pair.source);if(JSON.stringify(b.operationIdentity)!==JSON.stringify(s.input.identity)||port.operation!==s.pair.journal)throw fail('restored_participant_source');const data=b.readSource(s.pair.source);b.nativeCaptureGuard.capture(port.core,data.source.versions);checkRestoredUploads(s.uploads);if(stamp){const now=port.stamp();if(stamp.length!==now.length||stamp.some((v,i)=>v!==now[i]))throw fail('restored_participant_source_changed');}s.choice.guard();}
 async #verify(){const s=this.#state,r=await this.#read();if(r.source!=='complete'||r.uploads!=='complete'||!s.pair)throw fail('restored_participant_not_ready');this.#sourceCheck();const port=independentDeliverySource(s.pair.source),stamp=port.stamp();await verifyRestoredUploads(s.input,s.uploads,false,s.choice.guard);const b=restoredOperationJournalBinding(s.pair.journal),progress=await b.progress();if(!progress.ready)throw fail('restored_participant_not_ready');if(await digest(b.inputFile(),s.input.options.signal)!==s.input.fileSha256)throw fail('restored_participant_input_changed');await this.#read();this.#sourceCheck(stamp);}
 file():Blob{this.#readable();return this.#state.input.file;}
 readableSource(){if(!this.#exposed)throw fail('restored_participant_closed');if(this.#closed||!this.#state.pair)throw fail('restored_participant_source');return restoredOperationJournalBinding(this.#state.pair.journal).readSource(this.#state.pair.source);}
 async progress(){this.#start();try{const r=await this.#read();return Object.freeze({uploads:r.uploads,source:r.source,phase:r.source==='complete'?'ready' as const:'preparing' as const});}finally{this.#busy=false;}}
 /** Failed finish retains actual partial owners for retry; a cold resume independently
  * re-admits stored input/components. No component is inferred from its marker alone. */
 async finish():Promise<void>{this.#start();try{const s=this.#state;let r=await this.#read();
  if(r.uploads==='reserved'){await this.#move(r,{...r,uploads:'started'});r=await this.#read();}
  await openRestoredUploads(s.input,s.uploads,s.choice.uploadsDatabase,r.uploads==='complete',s.choice.guard);s.choice.guard();if(r.uploads==='started'){await this.#move(r,{...r,uploads:'complete'});r=await this.#read();}
  if(r.source==='reserved'){await this.#move(r,{...r,source:'started'});r=await this.#read();}
  if(!s.pair){const journalExists=await present(s.choice.journalDatabase);s.choice.guard();if(r.source==='complete'&&(!journalExists||!await present(s.choice.sourceDatabase)))throw fail('restored_participant_source_missing');s.choice.guard();s.pair=await openRestoredOperationSource(s.choice.sourceOptions,journalExists?undefined:s.input.file);s.choice.guard();}
  await s.pair.source.flush();s.choice.guard();this.#sourceCheck();if(r.source==='started'){await this.#move(r,{...r,source:'complete'});r=await this.#read();}await this.#verify();
 }finally{this.#busy=false;}}
 async check(){this.#start();try{await this.#verify();}finally{this.#busy=false;}}
 /** All awaited coordinator callbacks settle while real source/input/uploads remain
  * owned. A late refusal keeps those owners and can reacquire coordinator leases. */
 async intoParts():Promise<Readonly<RestoredOperationParticipantParts<P>>>{const group=reserveRestoredOperationGroup([this]),handoff=await prepareOperationalCohort([group],async()=>group.states[0]!,()=>{},()=>{},()=>fail('restored_participant_closed'));return handoff.commit();}
 async close():Promise<void>{return this.#close(false);}
 async discardAndClose():Promise<void>{return this.#close(true);}
 async #close(discard:boolean){if(this.#closed)return;this.#start();try{await closeState(this.#state,discard);this.#closed=true;}finally{this.#busy=false;}}
}
