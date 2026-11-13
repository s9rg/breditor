import type {AssetLimits} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {continuedRoomRecoveryCatalog} from '../continued_room_catalog/storage.js';
import {continuedCatalogOriginalBackup,continuedCatalogDeliveryBackup,continuedCatalogGenerationBackup,continuedCatalogIndependentBackup,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
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
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {prepareOriginalRoomDestination,snapshotContinuedRoomOriginalPolicies} from './original_destination.js';
import {operationDestinationNames,recoverOperationRoomDestination} from './operation_destination.js';
import {matchContinuedRoomPolicies,snapshotContinuedRoomDeliveryPolicies,snapshotContinuedRoomGenerationPolicies,snapshotContinuedRoomIndependentPolicies} from './policy.js';
import {accessRecoveryJournal,openRecoveryJournal} from './journal.js';
import type {ContinuedRoomRecoveryDestination,ContinuedRoomRecoveryOptions,ContinuedRoomRecoveryResult} from './contract.js';

const {metadata,participantRecords,participantUploads,dispose}=SharedContinuedRoomCatalog.prototype;
const {close:release}=RecoveryLease.prototype;
const originalRecords=SharedParticipantBackup.prototype.records;
const destinationNames=(row:ContinuedRoomRecoveryDestination)=>[...operationDestinationNames(row),...Object.values(row.original??{})];

async function restore(input:ContinuedRoomRecoveryOptions,begin:boolean):Promise<ContinuedRoomRecoveryResult>{
 physicalCatalogV2Options(input,['database','catalog','expected','destinations','checkAuthority','writerRecovery'],['signal','independentPolicies','deliveryPolicies','generationPolicies','originalPolicies']);
 const {database:provided,catalog,checkAuthority,writerRecovery}=input;
 const policyFailure=()=>fail('policy');
 const originals=snapshotContinuedRoomOriginalPolicies(input.originalPolicies);
 const independent=snapshotContinuedRoomIndependentPolicies(input.independentPolicies,policyFailure);
 const generation=snapshotContinuedRoomGenerationPolicies(input.generationPolicies,policyFailure);
 const delivery=snapshotContinuedRoomDeliveryPolicies(input.deliveryPolicies,policyFailure);
 if(writerRecovery!=='host-reacquired')throw fail('policy');
 const database=physicalCatalogDatabase(provided),expected=physicalCatalogSelection(input.expected);
 const destinations=physicalCatalogV2Rows(input.destinations,(value):ContinuedRoomRecoveryDestination=>{
  physicalCatalogV2Options(value,['id','source','uploads'],['operation','original']);
  const {id,source,uploads,operation,original}={...value};
  const extended=Object.hasOwn(value,'operation'),legacy=Object.hasOwn(value,'original');
  if(extended&&legacy)throw fail('policy');
  const base={id:physicalCatalogName(id),source:physicalCatalogDatabase(source),uploads:physicalCatalogDatabase(uploads)};
  if(legacy){
   physicalCatalogV2Options(original!,[],['suggestions','revisions','versions']);
   const metadata={...original};
   const names={
    ...(Object.hasOwn(metadata,'suggestions')?{suggestions:physicalCatalogDatabase(metadata.suggestions)}:{}),
    ...(Object.hasOwn(metadata,'revisions')?{revisions:physicalCatalogDatabase(metadata.revisions)}:{}),
    ...(Object.hasOwn(metadata,'versions')?{versions:physicalCatalogDatabase(metadata.versions)}:{}),
   };
   return {...base,original:names};
  }
  if(!extended)return base;
  const {parent,journal}=archiveFields(operation,'parent,journal');
  const names={parent:physicalCatalogDatabase(parent),journal:physicalCatalogDatabase(journal)};
  if([base.source,base.uploads,names.parent,names.journal].some(name=>!name.trim()))throw fail('policy');
  return {...base,operation:names};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const signal=independentRecoverySignal(input.signal),authority=participantAuthority(checkAuthority);
 const held=continuedRoomRecoveryCatalog(catalog);
 if(JSON.stringify(held.selection)!==JSON.stringify(expected))throw fail('policy');
 const namespaces=[database,...destinations.flatMap(destinationNames)];
 if(namespaces.includes(held.database)||new Set(namespaces).size!==namespaces.length||
    new Set(destinations.map(row=>row.id)).size!==destinations.length||!destinations.length)throw fail('policy');
 const factory=recoveryOpeningContext(),locks=navigator.locks;
 const leases:RecoveryLease[]=[],destinationsHeld:ContinuedDestinationHold[]=[];
 const failedParticipants=new RecoveryCleanupScope(()=>fail('storage'));
 let db:IDBDatabase|undefined,archive:SharedContinuedRoomCatalog|undefined,changed=false;
 const stable=()=>{
  if(changed||globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('diverged');
  if(signal?.aborted)throw fail('aborted');
  checkRecoveryLeasesHeld(leases);
 };
 const cleanup=async()=>{
  const closed=await Promise.allSettled([failedParticipants.drain(),...destinationsHeld.map(destination=>Promise.resolve().then(()=>destination.close()))]);
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
  const outerNames=[database,...destinations.filter(row=>!row.operation).flatMap(destinationNames)];
  for(const name of outerNames.sort()){
   guard();
   leases.push(await RecoveryLease.acquire(JSON.stringify(name)));
  }
  guard();
  archive=await held.read(checkAuthorityCurrent,signal);
  guard();
  const selected=metadata.call(archive);
  const entries=selected.participants;
  if(entries.length!==destinations.length||entries.some((row,index)=>row.id!==destinations[index]!.id))throw fail('policy');
  const writers=new Set<string>(),actors=new Set<string>();
  if(!matchContinuedRoomPolicies(entries,'original',originals,policyFailure)||
     !matchContinuedRoomPolicies(entries,'independent-local',independent,policyFailure)||
     !matchContinuedRoomPolicies(entries,'independent-delivery',delivery,policyFailure)||
     !matchContinuedRoomPolicies(entries,'generation',generation,policyFailure))throw policyFailure();
  const originalDestinations=new Map<string,Awaited<ReturnType<typeof prepareOriginalRoomDestination>>>();
  const room=selected.current.server.identity.native.source.document;
  const admitWriter=(native:{room:string;writer:string},actor:string|undefined)=>{
   if(native.room!==room||writers.has(native.writer)||actor!==undefined&&actors.has(actor))throw fail('policy');
   writers.add(native.writer);if(actor!==undefined)actors.add(actor);
  };
  for(const [index,entry] of entries.entries()){
   const destination=destinations[index]!;
   const operation=entry.family==='restored-graph'||entry.family==='local-operation-snapshot'||entry.family==='local-operation-flat';
   if(operation!==!!destination.operation||(entry.family==='original')!==!!destination.original)throw policyFailure();
   if(entry.family==='original'){
    const source=entry.selection.identity.source;
    const paired=originalRecords.call(continuedCatalogOriginalBackup(archive,entry.id)).find(row=>row.kind==='paired-session');
    admitWriter(source,paired?readPairedBackupRecord(paired.json,source).reviewActor:undefined);
    originalDestinations.set(entry.id,await prepareOriginalRoomDestination(archive,destination,originals.get(entry.id)!,database,guard,signal));
    continue;
   }
   const selection=entry.selection;
   const identity='original'in selection?selection.original.identity:selection.identity;
   const {native,review}='history'in identity.source?identity.source.history:identity.source;
   admitWriter(native,review?.actor);
  }
  const policies=new Map(held.options.policies.map(row=>[row.id,row]));
  const plan={text:JSON.stringify({catalog:expected,destinations}),steps:destinations.reduce((count,row)=>
   count+(row.operation?1:(originalDestinations.get(row.id)?.steps.length??1)+1),0)};
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
  const recover=async(names:readonly string[],work:(completed:boolean)=>Promise<ContinuedDestinationHold|void>)=>{
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
   const destination=await work(completed);
   if(destination)destinationsHeld.push(destination);
   step++;
   if(!completed)cursor=await accessRecoveryJournal(journal,plan,guard,signal,{before:cursor,next:{completed:step,started:false}});
  };
  for(const [index,destination] of destinations.entries()){
   const entry=entries[index]!;
   if(entry.family==='restored-graph'||entry.family==='local-operation-snapshot'||entry.family==='local-operation-flat'){
    await recover(operationDestinationNames(destination),completed=>
     recoverOperationRoomDestination(archive!,destination,held.options,completed,context,signal,
      close=>failedParticipants.retain(close).complete));
    continue;
   }
   if(entry.family==='original'){
    const original=originalDestinations.get(destination.id)!;
    const cleanupTicket=failedParticipants.retain(original.close);
    // Keep all retained owners through final verification of the entire room.
    for(const step of original.steps)await recover([original.name(step)],completed=>original.restore(step,completed));
    destinationsHeld.push(await original.hold());
    cleanupTicket.complete();
    await recover([destination.uploads],completed=>
     recoverContinuedRoomUploads(destination.uploads,original.uploads,completed,context,{limits:original.limits},signal));
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
