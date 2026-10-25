/** Pure accepted-prefix inspection of genuine currently held client histories.
 * The inventory is cached catalog evidence, not a fresh server/auth/provider
 * proof. Local review lanes remain unbound even when their actor is registered. */
import type {CompleteNativeRead} from '../complete_operation_cohort/native_read.js';
import type {PhysicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import type {PhysicalOperationV3PreparedTarget} from './preflight.js';
import {prefixAt,transportVersion} from '../relay/validation.js';
import {sharedProtocolLanguage} from '../protocol.js';
import {frozen,SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
import type {SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
import type {PhysicalOperationV3NativeRead,PhysicalOperationV3NativeParticipant} from './native_read_contract.js';
import type {SharedRoomParticipantInventoryMetadata} from '../room_participant_inventory/types.js';
const invalid=()=>new SharedRoomParticipantInventoryError('inventory_source','The genuine operational native read differs from its admitted catalog source');
const fork=()=>new SharedRoomParticipantInventoryError('inventory_fork','The actual native history differs from the selected registered prefix');

export function inspectPhysicalOperationV3Native(source:PhysicalCatalogV3ArchiveState,selected:readonly PhysicalOperationV3PreparedTarget[],read:CompleteNativeRead):PhysicalOperationV3NativeRead{
 return inspectPhysicalOperationV3NativeAtInventory(source,selected,read,source.inventory.metadata().native);
}
/** Internal pure identity scan. The new complete-cut caller supplies canonical
 * genuine inventory metadata; the original entry point retains its old timing. */
export function inspectPhysicalOperationV3NativeAtInventory(source:PhysicalCatalogV3ArchiveState,selected:readonly PhysicalOperationV3PreparedTarget[],read:Pick<CompleteNativeRead,'participants'|'checkCurrent'>,metadata:SharedRoomParticipantInventoryMetadata):PhysicalOperationV3NativeRead{
 const wire=metadata.room.writerTransportVersion;
 const documents=new Set<string>(),reviews=new Set<string>(),behindDocuments=new Set<string>(),behindReviews=new Set<string>();
 const unbound:SharedRoomParticipantMissing[]=[],participants:PhysicalOperationV3NativeParticipant[]=[],chosen=new Set<string>();
 for(const row of read.participants){
  const expected=selected.find(value=>value.target.id===row.id);if(!expected||expected.target.family!==row.family||chosen.has(row.id))throw invalid();chosen.add(row.id);
  const id=expected.identity,native=row.native.document,review=row.native.review,descriptor=native.descriptor();
  const registration=metadata.writers.find(value=>value.clock.writer===id.writer);
  if(!registration||registration.principal!==id.principal||id.room!==metadata.room.document||id.richLanguage!==metadata.richLanguage||sharedProtocolLanguage(descriptor)!==id.richLanguage||descriptor.schemaFingerprint!==metadata.schemaFingerprint||native.kind!==id.documentHistory||documents.has(id.writer))throw invalid();
  documents.add(id.writer);const clock=wire===2?native.writerClockV2(id.writer):native.writerClock(id.writer);
  if(registration.observer&&clock.through!=='0')throw invalid();
  if(BigInt(clock.through)<BigInt(registration.clock.through))behindDocuments.add(id.writer);
  else if(prefixAt(native,id.writer,registration.clock.through,wire)!==registration.clock.prefixDigest)throw fork();
  let reviewResult:PhysicalOperationV3NativeParticipant['review']=null;
  if(id.actor!==undefined){
   if(review.kind==='absent'||review.kind==='unselected'||review.kind!==id.reviewHistory||id.reviewPrincipal!==id.principal||review.localReviewClock().actor!==id.actor)throw invalid();
   const head=review.reviewWriterClock(id.actor,id.principal),relay=id.reviewRelay;
   if(!relay){
    unbound.push({kind:'unbound_review',participant:id.participant,principal:id.principal,actor:id.actor});
    reviewResult={actor:id.actor,history:review.kind,localThrough:head.through,acceptedThrough:null,binding:null};
   }else{
    const registered=metadata.review?.writers.find(value=>value.clock.actor===id.actor);
    if(!registered||registered.principal!==id.principal||metadata.review?.binding!==relay.binding||relay.principal!==id.principal||relay.documentWriter!==id.writer||relay.room!==id.room||transportVersion(relay.writerTransport)!==wire||registered.observer!==(relay.reviewEditing==='read_only')||reviews.has(id.actor))throw invalid();
    reviews.add(id.actor);if(registered.observer&&head.through!=='0')throw invalid();
    if(BigInt(head.through)<BigInt(registered.clock.through))behindReviews.add(id.actor);
    else if(review.reviewWriterClock(id.actor,id.principal,registered.clock.through).prefixDigest!==registered.clock.prefixDigest)throw fork();
    reviewResult={actor:id.actor,history:review.kind,localThrough:head.through,acceptedThrough:registered.clock.through,binding:relay.binding};
   }
  // No selected review record is not proof that the native owner has no review
  // lane. An explicitly unselected lane is excluded and cannot cover a server
  // registration, just as in the existing captured-native-read contract.
  }else if(id.reviewHistory!==null||review.kind!=='absent'&&review.kind!=='unselected')throw invalid();
  participants.push({id:row.id,family:row.family,participant:id.participant,principal:id.principal,writer:id.writer,document:{history:native.kind,localThrough:clock.through,acceptedThrough:registration.clock.through},review:reviewResult});
 }
 if(chosen.size!==selected.length)throw invalid();
 const missing:SharedRoomParticipantMissing[]=[];
 for(const row of metadata.writers)if(!documents.has(row.clock.writer)||behindDocuments.has(row.clock.writer))missing.push({kind:'document',principal:row.principal,writer:row.clock.writer,reason:documents.has(row.clock.writer)?'server_ahead':'missing'});
 for(const row of metadata.review?.writers??[])if(!reviews.has(row.clock.actor)||behindReviews.has(row.clock.actor))missing.push({kind:'review',principal:row.principal,actor:row.clock.actor,reason:reviews.has(row.clock.actor)?'server_ahead':'missing'});
 const registeredStreamsCovered=missing.length===0;missing.push(...unbound);
 const unreconciledParticipants=source.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id);
 const result=frozen({format:'breditor/physical-room-operation-native-read' as const,formatVersion:1 as const,catalog:source.selection,scope:'held-current-native-lanes-against-cached-inventory' as const,kind:missing.length||unreconciledParticipants.length?'pending' as const:'covered' as const,registeredStreamsCovered,participants,missing,unreconciledParticipants});
 read.checkCurrent();return result;
}
