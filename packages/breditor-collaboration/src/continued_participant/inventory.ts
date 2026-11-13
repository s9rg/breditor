/** Compare archived native prefixes to the independently selected physical server cut. */
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
import {SharedRoomParticipantInventoryError,frozen} from '../room_participant_inventory/policy.js';
import {nativeHistoryIntrinsics as native} from '../native_history_read/intrinsics.js';
import {sharedProtocolLanguage} from '../protocol.js';
import {prefixAt} from '../relay/validation.js';
import {disposeOwnedCore} from '../owned_core_lifetime.js';
import {withContinuedPairReplay} from '../continued_pair/replay.js';
import {participantAuthority} from '../participant_backup/policy.js';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedContinuedParticipantBackup} from './archive.js';
import type {ContinuedParticipantReadOptions} from './contract.js';

const {file:inventoryFile,identity:inventoryIdentity,metadata:inventoryMetadata}=SharedServerLogGenerationParticipantInventory.prototype;
const {file:participantFile,selection:participantSelection,records:participantRecords}=SharedContinuedParticipantBackup.prototype;
const refuse=()=>new SharedRoomParticipantInventoryError('inventory_source','The selected continued participant differs from the physical room inventory');
const fork=()=>new SharedRoomParticipantInventoryError('inventory_fork','The accepted prefix differs from this native continued history');

export interface ContinuedParticipantPrefix {
 readonly document:SharedRoomParticipantCoverage['checkedParticipants'][number];
 readonly documentStatus:'matches'|'server_ahead';
 readonly review:Readonly<{
  actor:string;localThrough:string;acceptedThrough:string|null;
  status:'matches'|'server_ahead'|'unregistered';
 }>;
}
/** A persisted local review prefix is evidence about history, with delivery still unbound. */
export async function inspectContinuedParticipantPrefix<P extends SharedSelectionPolicy>(
 backup:SharedContinuedParticipantBackup,inventory:SharedServerLogGenerationParticipantInventory,
 options:Pick<ContinuedParticipantReadOptions<P>,'restoreDocument'|'checkAuthority'|'signal'>,
):Promise<ContinuedParticipantPrefix>{
 const selectedFile=participantFile.call(backup),heldInventory=inventoryFile.call(inventory);
 const {restoreDocument,signal}=options,authority=participantAuthority(options.checkAuthority);
 const check=()=>{
  if(signal?.aborted)throw new SharedRoomParticipantInventoryError('inventory_aborted','Continued participant inventory inspection was cancelled');
  authority();
  if(participantFile.call(backup)!==selectedFile||inventoryFile.call(inventory)!==heldInventory)throw refuse();
 };
 check();
 const {participant,principal,source}=participantSelection.call(backup).identity;
 const metadata=inventoryMetadata.call(inventory).native;
 const writer=source.native.writer,actor=source.review.actor,wire=metadata.room.writerTransportVersion;
 const registered=metadata.writers.find(row=>row.clock.writer===writer);
 const registeredReview=metadata.review?.writers.find(row=>row.clock.actor===actor);
 if(!registered||registered.principal!==principal||source.native.room!==metadata.room.document||
    source.native.richLanguage!==metadata.richLanguage||registeredReview&&registeredReview.principal!==principal)throw refuse();
 const live=participantRecords.call(backup).live;
 return withContinuedPairReplay(source,restoreDocument,check,signal,async replay=>{
  const core=await replay(live,check);
  try{
   const descriptor=native.descriptor.call(core);
   if(sharedProtocolLanguage(descriptor)!==metadata.richLanguage||descriptor.schemaFingerprint!==metadata.schemaFingerprint)throw refuse();
   const transport={
    descriptor:()=>descriptor,
    writerClock:(id:string)=>native.writerClock.call(core,id),
    writerClockV2:(id:string)=>native.writerClockV2.call(core,id),
    supportsWriterPrefixRead:()=>native.supportsWriterPrefixRead.call(core),
    writerClockAt:(id:string,through:string,version:1|2=1)=>native.writerClockAt.call(core,id,through,version),
    writerGroups:(after:string)=>native.writerGroups.call(core,after),
    writerGroupsV2:(after:string)=>native.writerGroupsV2.call(core,after),
   };
   const document=wire===2?transport.writerClockV2(writer):transport.writerClock(writer);
   const review=native.reviewWriterClock.call(core,actor,principal);
   if(registered.observer&&document.through!=='0'||registeredReview?.observer&&review.through!=='0')throw refuse();
   const documentBehind=BigInt(document.through)<BigInt(registered.clock.through);
   if(!documentBehind&&prefixAt(transport,writer,registered.clock.through,wire)!==registered.clock.prefixDigest)throw fork();
   const reviewBehind=registeredReview&&BigInt(review.through)<BigInt(registeredReview.clock.through);
   if(registeredReview&&!reviewBehind&&native.reviewWriterClock.call(core,actor,principal,registeredReview.clock.through).prefixDigest!==registeredReview.clock.prefixDigest)throw fork();
   const result=frozen({
    document:{participant,principal,writer,observer:registered.observer,localThrough:document.through,acceptedThrough:registered.clock.through},
    documentStatus:documentBehind?'server_ahead' as const:'matches' as const,
    review:{actor,localThrough:review.through,acceptedThrough:registeredReview?.clock.through??null,
     status:registeredReview?reviewBehind?'server_ahead' as const:'matches' as const:'unregistered' as const},
   });
   check();
   return result;
  }finally{disposeOwnedCore(core);}
 });
}

/** Overlay document prefix observations. The local review stream remains pending delivery. */
export function continuedParticipantCoverage(
 inventory:SharedServerLogGenerationParticipantInventory,observations:readonly ContinuedParticipantPrefix[],
):SharedRoomParticipantCoverage{
 const metadata=inventoryMetadata.call(inventory).native;
 inventoryFile.call(inventory);
 const writers=new Map<string,ContinuedParticipantPrefix>(),actors=new Map<string,ContinuedParticipantPrefix>();
 for(const row of observations){
  if(writers.has(row.document.writer)||actors.has(row.review.actor))throw new SharedRoomParticipantInventoryError('inventory_duplicate','Reconcile duplicate continued writer and review actor copies explicitly');
  writers.set(row.document.writer,row);actors.set(row.review.actor,row);
 }
 const missing:SharedRoomParticipantMissing[]=[];
 for(const row of metadata.writers){
  const observed=writers.get(row.clock.writer);
  if(observed?.documentStatus==='matches')continue;
  missing.push({kind:'document',principal:row.principal,writer:row.clock.writer,reason:observed?'server_ahead':'missing'});
 }
 for(const row of metadata.review?.writers??[]){
  const observed=actors.get(row.clock.actor);
  missing.push({kind:'review',principal:row.principal,actor:row.clock.actor,reason:observed?.review.status==='server_ahead'?'server_ahead':'missing'});
 }
 const registeredStreamsCovered=missing.length===0;
 for(const row of observations)missing.push({kind:'unbound_review',participant:row.document.participant,principal:row.document.principal,actor:row.review.actor});
 return frozen({kind:missing.length?'pending':'covered',registeredStreamsCovered,checkedParticipants:observations.map(row=>row.document),missing});
}

export function continuedInventorySelection(inventory:SharedServerLogGenerationParticipantInventory){
 inventoryFile.call(inventory);
 return inventoryIdentity.call(inventory);
}
