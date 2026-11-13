/** Compare archived native prefixes to the independently selected physical server cut. */
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
import {SharedRoomParticipantInventoryError,frozen} from '../room_participant_inventory/policy.js';
import type {SharedRichEditor} from '../core.js';
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

export interface ContinuedAcceptedPrefix {
 readonly author:string;
 readonly principal:string|null;
 readonly localThrough:string;
 readonly acceptedThrough:string;
 readonly relation:'equal'|'local_ahead'|'server_ahead';
}
export interface ContinuedParticipantPrefix {
 readonly document:SharedRoomParticipantCoverage['checkedParticipants'][number];
 readonly documentStatus:'matches'|'server_ahead';
 readonly acceptedDocuments:readonly ContinuedAcceptedPrefix[];
 readonly acceptedReviews:readonly ContinuedAcceptedPrefix[];
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
 const live=participantRecords.call(backup).live;
 return withContinuedPairReplay(source,restoreDocument,check,signal,async replay=>{
  const core=await replay(live,check);
  try{return inspectLocalNativePrefix(core,inventory,participant,principal,source,check);}
  finally{disposeOwnedCore(core);}
 });
}

/** The exact native checkpoint has already been admitted by the family reader. */
export function inspectLocalNativePrefix<P extends SharedSelectionPolicy>(
 core:SharedRichEditor<P>,inventory:SharedServerLogGenerationParticipantInventory,participant:string,principal:string,
 source:Readonly<{native:{room:string;writer:string;richLanguage:number};review:{actor:string}}>,check:()=>void,
):ContinuedParticipantPrefix{
 check();
 const metadata=inventoryMetadata.call(inventory).native;
 const writer=source.native.writer,actor=source.review.actor,wire=metadata.room.writerTransportVersion;
 const registered=metadata.writers.find(row=>row.clock.writer===writer);
 const registeredReview=metadata.review?.writers.find(row=>row.clock.actor===actor);
 if(!registered||registered.principal!==principal||source.native.room!==metadata.room.document||
    source.native.richLanguage!==metadata.richLanguage||registeredReview&&registeredReview.principal!==principal)throw refuse();
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
 const relation=(local:string,accepted:string)=>local===accepted?'equal' as const:
  BigInt(local)<BigInt(accepted)?'server_ahead' as const:'local_ahead' as const;
 const acceptedDocuments=[
  ...metadata.writers.map(row=>({principal:row.principal,clock:row.clock})),
  ...metadata.serverAuthors.map(row=>({principal:null,clock:row.clock})),
 ];
 const documents=acceptedDocuments.map(({principal,clock})=>{
  const local=wire===2?transport.writerClockV2(clock.writer):transport.writerClock(clock.writer);
  const status=relation(local.through,clock.through);
  if(status!=='server_ahead'&&prefixAt(transport,clock.writer,clock.through,wire)!==clock.prefixDigest)throw fork();
  return {author:clock.writer,principal,localThrough:local.through,acceptedThrough:clock.through,relation:status};
 });
 const reviews=(metadata.review?.writers??[]).map(({principal,clock})=>{
  const local=native.reviewWriterClock.call(core,clock.actor,principal),status=relation(local.through,clock.through);
  if(status!=='server_ahead'){
   const at=native.reviewWriterClock.call(core,clock.actor,principal,clock.through);
   if(at.through!==clock.through||at.prefixDigest!==clock.prefixDigest)throw fork();
  }
  return {author:clock.actor,principal,localThrough:local.through,acceptedThrough:clock.through,relation:status};
 });
 const document=documents.find(row=>row.author===writer)!;
 const reviewThrough=reviews.find(row=>row.author===actor)?.localThrough??native.reviewWriterClock.call(core,actor,principal).through;
 if(registered.observer&&document.localThrough!=='0'||registeredReview?.observer&&reviewThrough!=='0')throw refuse();
 const documentBehind=document.relation==='server_ahead';
 const reviewBehind=registeredReview&&BigInt(reviewThrough)<BigInt(registeredReview.clock.through);
 const result=frozen({
  document:{participant,principal,writer,observer:registered.observer,localThrough:document.localThrough,acceptedThrough:registered.clock.through},
  documentStatus:documentBehind?'server_ahead' as const:'matches' as const,
  acceptedDocuments:documents,acceptedReviews:reviews,
  review:{actor,localThrough:reviewThrough,acceptedThrough:registeredReview?.clock.through??null,
   status:registeredReview?reviewBehind?'server_ahead' as const:'matches' as const:'unregistered' as const},
 });
 check();
 return result;
}

/** Overlay document prefix observations. The local review stream remains pending delivery. */
export function continuedParticipantCoverage(
 inventory:SharedServerLogGenerationParticipantInventory,observations:readonly ContinuedParticipantPrefix[],boundActors:ReadonlySet<string>=new Set(),
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
  if(boundActors.has(row.clock.actor)&&observed?.review.status==='matches')continue;
  missing.push({kind:'review',principal:row.principal,actor:row.clock.actor,reason:observed?.review.status==='server_ahead'?'server_ahead':'missing'});
 }
 const registeredStreamsCovered=missing.length===0;
 for(const row of observations)if(!boundActors.has(row.review.actor))missing.push({kind:'unbound_review',participant:row.document.participant,principal:row.document.principal,actor:row.review.actor});
 return frozen({kind:missing.length?'pending':'covered',registeredStreamsCovered,checkedParticipants:observations.map(row=>row.document),missing});
}

export function continuedInventorySelection(inventory:SharedServerLogGenerationParticipantInventory){
 inventoryFile.call(inventory);
 return inventoryIdentity.call(inventory);
}
