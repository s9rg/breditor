import type {AssetLimits} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {continuedRoomRecoveryCatalog} from '../continued_room_catalog/storage.js';
import {continuedCatalogDeliveryBackup,continuedCatalogGenerationBackup,continuedCatalogIndependentBackup,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {deliveryRecoveryArchive} from '../independent_delivery_recovery/archive.js';
import {independentRecoveryArchive} from '../independent_recovery/archive.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {physicalCatalogDatabase,physicalCatalogName,physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options,physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {recoverContinuedRoomSource,recoverContinuedRoomUploads,recoveryFailure as fail,type ContinuedDestinationHold} from './destination.js';
import {recoverIndependentRoomSource} from './independent_destination.js';
import {generationRoomUploads,recoverGenerationRoomSource} from './generation_destination.js';
import {recoverDeliveryRoomSource} from './delivery_destination.js';
import {operationDestinationNames,recoverOperationRoomDestination} from './operation_destination.js';
import {matchContinuedRoomPolicies,snapshotContinuedRoomDeliveryPolicies,snapshotContinuedRoomGenerationPolicies,snapshotContinuedRoomIndependentPolicies} from './policy.js';
import {accessRecoveryJournal,openRecoveryJournal} from './journal.js';
import type {ContinuedRoomRecoveryDestination,ContinuedRoomRecoveryOptions,ContinuedRoomRecoveryResult} from './contract.js';

const {metadata,participantRecords,participantUploads,dispose}=SharedContinuedRoomCatalog.prototype;
const {close:release}=RecoveryLease.prototype;

async function restore(input:ContinuedRoomRecoveryOptions,begin:boolean):Promise<ContinuedRoomRecoveryResult>{
 physicalCatalogV2Options(input,['database','catalog','expected','destinations','checkAuthority','writerRecovery'],['signal','independentPolicies','deliveryPolicies','generationPolicies']);
 const {database:provided,catalog,checkAuthority,writerRecovery}=input;
 const policyFailure=()=>fail('policy');
 const independent=snapshotContinuedRoomIndependentPolicies(input.independentPolicies,policyFailure);
 const generation=snapshotContinuedRoomGenerationPolicies(input.generationPolicies,policyFailure);
 const delivery=snapshotContinuedRoomDeliveryPolicies(input.deliveryPolicies,policyFailure);
 if(writerRecovery!=='host-reacquired')throw fail('policy');
 const database=physicalCatalogDatabase(provided),expected=physicalCatalogSelection(input.expected);
 const destinations=physicalCatalogV2Rows(input.destinations,(value):ContinuedRoomRecoveryDestination=>{
  const extended=Object.hasOwn(value,'operation');
  const {id,source,uploads,operation}=archiveFields(value,extended?'id,source,uploads,operation':'id,source,uploads');
  const base={id:physicalCatalogName(id),source:physicalCatalogDatabase(source),uploads:physicalCatalogDatabase(uploads)};
  if(!extended)return base;
  const {parent,journal}=archiveFields(operation,'parent,journal');
  const names={parent:physicalCatalogDatabase(parent),journal:physicalCatalogDatabase(journal)};
  if([base.source,base.uploads,names.parent,names.journal].some(name=>!name.trim()))throw fail('policy');
  return {...base,operation:names};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const signal=independentRecoverySignal(input.signal),authority=participantAuthority(checkAuthority);
 const held=continuedRoomRecoveryCatalog(catalog);
 if(JSON.stringify(held.selection)!==JSON.stringify(expected))throw fail('policy');
 const namespaces=[database,...destinations.flatMap(operationDestinationNames)];
 if(namespaces.includes(held.database)||new Set(namespaces).size!==namespaces.length||
    new Set(destinations.map(row=>row.id)).size!==destinations.length||!destinations.length)throw fail('policy');
 const factory=recoveryOpeningContext(),locks=navigator.locks;
 const leases:RecoveryLease[]=[],destinationsHeld:ContinuedDestinationHold[]=[];
 const failedOperations=new RecoveryCleanupScope(()=>fail('storage'));
 let db:IDBDatabase|undefined,archive:SharedContinuedRoomCatalog|undefined,changed=false;
 const stable=()=>{
  if(changed||globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('diverged');
  if(signal?.aborted)throw fail('aborted');
  checkRecoveryLeasesHeld(leases);
 };
 const cleanup=async()=>{
  const closed=await Promise.allSettled([failedOperations.drain(),...destinationsHeld.map(destination=>Promise.resolve().then(()=>destination.close()))]);
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
 const guard=()=>{checkAuthorityCurrent();held.check();stable();};
 try{
  // The operation participants take their own namespace leases, including
  // the nested journal. Other destinations are held by this coordinator.
  const outerNames=[database,...destinations.filter(row=>!row.operation).flatMap(operationDestinationNames)];
  for(const name of outerNames.sort()){
   guard();
   leases.push(await RecoveryLease.acquire(JSON.stringify(name)));
  }
  guard();
  archive=await held.read(checkAuthorityCurrent,signal);
  guard();
  const selected=metadata.call(archive);
  const entries=selected.participants.filter(row=>row.family!=='original');
  if(entries.length!==selected.participants.length)throw fail('mixed_pending');
  if(entries.length!==destinations.length||entries.some((row,index)=>row.id!==destinations[index]!.id))throw fail('policy');
  const writers=new Set<string>(),actors=new Set<string>();
  if(!matchContinuedRoomPolicies(entries,'independent-local',independent,policyFailure)||
     !matchContinuedRoomPolicies(entries,'independent-delivery',delivery,policyFailure)||
     !matchContinuedRoomPolicies(entries,'generation',generation,policyFailure))throw policyFailure();
  for(const [index,entry] of entries.entries()){
   const operation=entry.family==='restored-graph'||entry.family==='local-operation-snapshot'||entry.family==='local-operation-flat';
   if(operation!==!!destinations[index]!.operation)throw policyFailure();
   const selection=entry.selection;
   const identity='original'in selection?selection.original.identity:selection.identity;
   const {native,review}='history'in identity.source?identity.source.history:identity.source;
   if(native.room!==selected.current.server.identity.native.source.document||
      writers.has(native.writer)||review&&actors.has(review.actor))throw fail('policy');
   writers.add(native.writer);if(review)actors.add(review.actor);
  }
  const policies=new Map(held.options.policies.map(row=>[row.id,row]));
  const plan={text:JSON.stringify({catalog:expected,destinations}),steps:destinations.reduce((count,row)=>count+(row.operation?1:2),0)};
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
  let step=0;
  const recover=async(names:readonly string[],work:(completed:boolean)=>Promise<ContinuedDestinationHold>)=>{
   guard();
   const completed=step<cursor.completed;
   if(!completed&&!cursor.started){
    // Only the currently recorded step can adopt its own interrupted writes.
    for(const name of names){
     const occupied=await existingDatabase(name);
     if(occupied){occupied.close();throw fail('exists');}
     guard();
    }
    cursor=await accessRecoveryJournal(journal,plan,guard,signal,{before:cursor,next:{completed:step,started:true}});
   }
   destinationsHeld.push(await work(completed));
   step++;
   if(!completed)cursor=await accessRecoveryJournal(journal,plan,guard,signal,{before:cursor,next:{completed:step,started:false}});
  };
  for(const [index,destination] of destinations.entries()){
   const entry=entries[index]!;
   if(entry.family==='restored-graph'||entry.family==='local-operation-snapshot'||entry.family==='local-operation-flat'){
    await recover(operationDestinationNames(destination),completed=>
     recoverOperationRoomDestination(archive!,destination,held.options,completed,context,signal,
      close=>failedOperations.retain(close).complete));
    continue;
   }
   let source:(completed:boolean)=>Promise<ContinuedDestinationHold>;
   let file:Blob,limits:Partial<AssetLimits>|undefined;
   if(entry.family==='independent-local'){
    const backup=continuedCatalogIndependentBackup(archive,destination.id),policy=independent.get(destination.id)!;
    source=completed=>recoverIndependentRoomSource(destination.source,policy.session,backup,completed,guard,signal);
    file=independentRecoveryArchive.uploadBackup.call(backup);
    limits=policy.limits;
   }else if(entry.family==='independent-delivery'){
    const backup=continuedCatalogDeliveryBackup(archive,destination.id),policy=delivery.get(destination.id)!;
    source=completed=>recoverDeliveryRoomSource(destination.source,policy.session,backup,completed,guard,signal);
    file=deliveryRecoveryArchive.uploadBackup.call(backup);
    limits=policy.limits;
   }else if(entry.family==='generation'){
    const backup=continuedCatalogGenerationBackup(archive,destination.id),policy=generation.get(destination.id)!;
    source=completed=>recoverGenerationRoomSource(destination.source,policy.expected,policy.session,backup,completed,guard,signal);
    file=generationRoomUploads(backup);
    limits=policy.limits;
   }else{
    const recovery=participantRecords.call(archive,destination.id).live;
    const {native,documentHistory,reviewHistory,review}=recovery.identity;
    const policy=policies.get(destination.id)!;
    source=completed=>recoverContinuedRoomSource({database:destination.source,native,documentHistory,reviewHistory,
     review:{...review,access:'read_only'},readOnly:true,restoreDocument:policy.restoreDocument},recovery,completed,guard,signal);
    file=participantUploads.call(archive,destination.id);
    limits=policy.limits;
   }
   await recover([destination.source],source);
   await recover([destination.uploads],completed=>recoverContinuedRoomUploads(destination.uploads,file,completed,context,limits?{limits}:{},signal));
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
