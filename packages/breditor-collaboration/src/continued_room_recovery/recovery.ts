import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {continuedRoomRecoveryCatalog} from '../continued_room_catalog/storage.js';
import {SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {physicalCatalogDatabase,physicalCatalogName,physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options,physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {recoverContinuedRoomSource,recoverContinuedRoomUploads,recoveryFailure as fail,type ContinuedDestinationHold} from './destination.js';
import {accessRecoveryJournal,openRecoveryJournal} from './journal.js';
import type {ContinuedRoomRecoveryOptions,ContinuedRoomRecoveryResult} from './contract.js';

const {metadata,participantRecords,participantUploads,dispose}=SharedContinuedRoomCatalog.prototype;
const {close:release}=RecoveryLease.prototype;

async function restore(input:ContinuedRoomRecoveryOptions,begin:boolean):Promise<ContinuedRoomRecoveryResult>{
 physicalCatalogV2Options(input,['database','catalog','expected','destinations','checkAuthority','writerRecovery'],['signal']);
 const {database:provided,catalog,checkAuthority,writerRecovery}=input;
 if(writerRecovery!=='host-reacquired')throw fail('policy');
 const database=physicalCatalogDatabase(provided),expected=physicalCatalogSelection(input.expected);
 const destinations=physicalCatalogV2Rows(input.destinations,value=>{
  const {id,source,uploads}=archiveFields(value,'id,source,uploads');
  return {id:physicalCatalogName(id),source:physicalCatalogDatabase(source),uploads:physicalCatalogDatabase(uploads)};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const signal=independentRecoverySignal(input.signal),authority=participantAuthority(checkAuthority);
 const held=continuedRoomRecoveryCatalog(catalog);
 if(JSON.stringify(held.selection)!==JSON.stringify(expected))throw fail('policy');
 const namespaces=[database,...destinations.flatMap(row=>[row.source,row.uploads])];
 if(namespaces.includes(held.database)||new Set(namespaces).size!==namespaces.length||
    new Set(destinations.map(row=>row.id)).size!==destinations.length||!destinations.length)throw fail('policy');
 const factory=recoveryOpeningContext(),locks=navigator.locks;
 const leases:RecoveryLease[]=[],destinationsHeld:ContinuedDestinationHold[]=[];
 let db:IDBDatabase|undefined,archive:SharedContinuedRoomCatalog|undefined,changed=false;
 const stable=()=>{
  if(changed||globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('diverged');
  if(signal?.aborted)throw fail('aborted');
  checkRecoveryLeasesHeld(leases);
 };
 const cleanup=async()=>{
  const closed=await Promise.allSettled(destinationsHeld.map(destination=>destination.close()));
  try{if(archive)dispose.call(archive);}
  finally{
   try{db?.close();}
   finally{
    const released=await Promise.allSettled(leases.map(lease=>release.call(lease)));
    if([...closed,...released].some(row=>row.status==='rejected'))throw fail('storage');
   }
  }
 };
 // Retain actual cleanup for the next opener if any lease release fails.
 const opening=await RecoveryOpeningCustody.reserve(factory,[database],cleanup,{
  policy:()=>fail('policy'),busy:()=>fail('busy'),storage:()=>fail('storage'),
 });
 const checkAuthorityCurrent=()=>{stable();authority();stable();};
 const guard=()=>{held.check();checkAuthorityCurrent();};
 try{
  // All coordinators use a common namespace lock order across journals and destinations.
  for(const name of namespaces.slice().sort()){
   guard();
   leases.push(await RecoveryLease.acquire(JSON.stringify(name)));
  }
  guard();
  archive=await held.read(checkAuthorityCurrent,signal);
  guard();
  const entries=metadata.call(archive).participants;
  if(entries.some(row=>row.family!=='continued-local'))throw fail('mixed_pending');
  if(entries.length!==destinations.length||entries.some((row,index)=>row.id!==destinations[index]!.id))throw fail('policy');
  const policies=new Map(held.options.policies.map(row=>[row.id,row]));
  const plan={text:JSON.stringify({catalog:expected,destinations}),steps:entries.length*2};
  if(begin){
   for(const name of namespaces){
    guard();
    const existing=await existingDatabase(name);
    if(existing){existing.close();throw fail('exists');}
   }
  }
  guard();
  db=await openRecoveryJournal(database,plan,begin,guard,signal);
  const journal=db;
  journal.onversionchange=()=>{changed=true;journal.close();};
  let cursor=await accessRecoveryJournal(journal,plan,guard,signal);
  const context=prepareArchiveIntegrity({wasm:held.options.wasm,checkAuthority:guard,...(signal?{signal}:{})});
  for(const [index,destination] of destinations.entries()){
   const recovery=participantRecords.call(archive,destination.id).live;
   const file=participantUploads.call(archive,destination.id);
   const {native,documentHistory,reviewHistory,review}=recovery.identity;
   const policy=policies.get(destination.id)!;
   for(const [offset,work] of [
    (completed:boolean)=>recoverContinuedRoomSource({database:destination.source,native,documentHistory,reviewHistory,
     review:{...review,access:'read_only'},readOnly:true,restoreDocument:policy.restoreDocument},recovery,completed,guard,signal),
    (completed:boolean)=>recoverContinuedRoomUploads(destination.uploads,file,completed,context,policy.limits?{limits:policy.limits}:{},signal),
   ].entries()){
    const step=index*2+offset;
    guard();
    if(step<cursor.completed){destinationsHeld.push(await work(true));continue;}
    if(!cursor.started){
     // A namespace outside the exact started step is never adopted implicitly.
     const occupied=await existingDatabase(offset===0?destination.source:destination.uploads);
     if(occupied){occupied.close();throw fail('exists');}
     cursor=await accessRecoveryJournal(journal,plan,guard,signal,{before:cursor,next:{completed:step,started:true}});
    }
    destinationsHeld.push(await work(false));
    cursor=await accessRecoveryJournal(journal,plan,guard,signal,{before:cursor,next:{completed:step+1,started:false}});
   }
  }
  for(const destination of destinationsHeld)await destination.verify();
  guard();
  if(cursor.completed!==plan.steps||cursor.started)throw fail('diverged');
  const result=frozen({format:'breditor/continued-room-local-recovery' as const,formatVersion:1 as const,catalog:expected,participants:destinations});
  guard();
  for(const destination of destinationsHeld)destination.check();
  return result;
 }finally{await opening.rollback();}
}

/** Recover a new local namespace plan, or verify and continue the exact saved one. */
export const beginContinuedRoomRecovery=(input:ContinuedRoomRecoveryOptions)=>restore(input,true);
export const resumeContinuedRoomRecovery=(input:ContinuedRoomRecoveryOptions)=>restore(input,false);
