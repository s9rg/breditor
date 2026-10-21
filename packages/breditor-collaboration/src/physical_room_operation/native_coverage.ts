/** Current operational descendants, after genuine reserved-owner origin verification.
 * Snapshot inventory readers keep exact-record equality. No persisted family is widened. */
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {SharedAssetReferenceCapture,capturedRecoveryRead,type SharedAssetCaptureRecord} from '../asset_references_capture.js';
import {SharedGenerationSourceCapture,capturedGenerationRecoveryRead} from '../generation_source/capture.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {checkInventoryStores} from '../room_participant_inventory/stores.js';
import {SharedRoomParticipantInventoryError,frozen} from '../room_participant_inventory/policy.js';
import {prefixAt,transportVersion} from '../relay/validation.js';
import {sharedProtocolLanguage} from '../protocol.js';
import type {PhysicalCatalogArchiveState} from '../physical_room_catalog/archive.js';
import type {SharedPhysicalRoomRecoveryCatalogSource,SharedPhysicalRoomRecoveryCatalogCheck} from '../physical_room_catalog/contract.js';
import type {SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
const sourceError=()=>new SharedRoomParticipantInventoryError('inventory_source','The reserved operational native source does not match this physical selection');
const fork=()=>new SharedRoomParticipantInventoryError('inventory_fork','The accepted physical native prefix differs from this operational history');
const duplicate=()=>new SharedRoomParticipantInventoryError('inventory_duplicate','Reconcile multiple operational copies explicitly; no source was selected or discarded');
const originalSelection=SharedParticipantBackup.prototype.selection,generationSelection=SharedGenerationParticipantBackup.prototype.selection,inventoryMetadata=SharedServerLogGenerationParticipantInventory.prototype.metadata,inventoryIdentity=SharedServerLogGenerationParticipantInventory.prototype.identity;
const originalRecords=SharedAssetReferenceCapture.prototype.records,generationRecords=SharedGenerationSourceCapture.prototype.records,generationMetadata=SharedGenerationSourceCapture.prototype.metadata,originalCheck=SharedAssetReferenceCapture.prototype.check,generationCheck=SharedGenerationSourceCapture.prototype.check;
const checkSource=(row:SharedPhysicalRoomRecoveryCatalogSource)=>row.family==='original'?originalCheck.call(row.source):generationCheck.call(row.source);
export function physicalOperationalCoverage(state:PhysicalCatalogArchiveState,sources:readonly SharedPhysicalRoomRecoveryCatalogSource[]):SharedPhysicalRoomRecoveryCatalogCheck {
 const metadata=inventoryMetadata.call(state.inventory).native,documents=new Set<string>(),reviews=new Set<string>(),behindDocuments=new Set<string>(),behindReviews=new Set<string>(),unbound:SharedRoomParticipantMissing[]=[],checked:SharedRoomParticipantCoverage['checkedParticipants'][number][]=[],chosen=new Set<string>();
 for(const row of sources){
  checkSource(row);const client=state.clients.get(row.id);if(!client||client.family!==row.family||chosen.has(row.id))throw sourceError();chosen.add(row.id);
  let principal:string,participant:string,writer:string,room:string,language:number,review:{actor:string;principal:string}|null=null,relay:{binding:string;principal:string;documentWriter:string;room:string;writerTransport?:'atomic-v2';reviewEditing?:string}|null=null;
  let records:readonly SharedAssetCaptureRecord[],native:ReturnType<typeof capturedRecoveryRead>;
  if(row.family==='original'&&client.family==='original'){
   const identity=originalSelection.call(client.backup).identity,source=identity.source;
   native=capturedRecoveryRead(row.source);records=originalRecords.call(row.source);principal=identity.principal;participant=identity.participant;writer=source.writer;room=source.room;language=source.richLanguage;if(native.checkpointJson()!==records[0]?.json)throw sourceError();
   const paired=records.find(record=>record.kind==='paired-session');if(paired){const record=readPairedBackupRecord(paired.json,source);review={actor:record.reviewActor,principal:record.principal};relay='relay'in record?record.relay:null;if(native.reviewCheckpoint()!==record.reviewCheckpointJson)throw sourceError();}
  }else if(row.family==='generation'&&client.family==='generation'){
   const identity=generationSelection.call(client.backup).identity,id=identity.source;
   native=capturedGenerationRecoveryRead(row.source);const captured=generationRecords.call(row.source);principal=identity.principal;participant=identity.participant;writer=id.native.writer;room=id.native.room;language=id.native.richLanguage;review=id.review;relay=id.relay?.review??null;
   if(JSON.stringify(generationMetadata.call(row.source).identity)!==JSON.stringify(id)||native.checkpointJson()!==captured[0]?.json||review&&native.reviewCheckpoint()!==captured.find(record=>record.kind==='review')?.json)throw sourceError();
   const document=id.relay?.document;if(document&&(document.writer!==writer||document.principal!==principal||document.room!==metadata.room.document||transportVersion(document.writerTransport)!==metadata.room.writerTransportVersion))throw sourceError();
   records=captured.flatMap<SharedAssetCaptureRecord>(record=>record.kind==='suggestions'?[{kind:'suggestions',json:record.json}]:record.kind==='revisions'?[{kind:'suggestion-revisions',json:record.json}]:record.kind==='versions'?[{kind:'version-catalog',json:record.json}]:[]);
  }else throw sourceError();
  const registration=metadata.writers.find(value=>value.clock.writer===writer),descriptor=native.descriptor();
  if(!registration||registration.principal!==principal||room!==metadata.room.document||language!==metadata.richLanguage||sharedProtocolLanguage(descriptor)!==metadata.richLanguage||descriptor.schemaFingerprint!==metadata.schemaFingerprint)throw sourceError();
  checkInventoryStores(metadata,records,principal,writer);if(documents.has(writer))throw duplicate();documents.add(writer);
  const version=metadata.room.writerTransportVersion,local=version===2?native.writerClockV2(writer):native.writerClock(writer);
  if(registration.observer&&local.through!=='0')throw sourceError();
  if(BigInt(local.through)<BigInt(registration.clock.through))behindDocuments.add(writer);else if(prefixAt(native,writer,registration.clock.through,version)!==registration.clock.prefixDigest)throw fork();
  checked.push({participant,principal,writer,observer:registration.observer,localThrough:local.through,acceptedThrough:registration.clock.through});
  if(review){
   if(review.principal!==principal||native.localReviewClock().actor!==review.actor)throw sourceError();
   if(!relay)unbound.push({kind:'unbound_review',participant,principal,actor:review.actor});
   else{
    const registered=metadata.review?.writers.find(value=>value.clock.actor===review.actor);
    if(!registered||registered.principal!==principal||metadata.review?.binding!==relay.binding||relay.principal!==principal||relay.documentWriter!==writer||relay.room!==room||transportVersion(relay.writerTransport)!==version||registered.observer!==(relay.reviewEditing==='read_only'))throw sourceError();
    if(reviews.has(review.actor))throw duplicate();reviews.add(review.actor);const head=native.reviewWriterClock(review.actor,principal);
    if(registered.observer&&head.through!=='0')throw sourceError();if(BigInt(head.through)<BigInt(registered.clock.through))behindReviews.add(review.actor);else if(native.reviewWriterClock(review.actor,principal,registered.clock.through).prefixDigest!==registered.clock.prefixDigest)throw fork();
   }
  }
  checkSource(row);
 }
 const missing:SharedRoomParticipantMissing[]=[];
 for(const row of metadata.writers)if(!documents.has(row.clock.writer)||behindDocuments.has(row.clock.writer))missing.push({kind:'document',principal:row.principal,writer:row.clock.writer,reason:documents.has(row.clock.writer)?'server_ahead':'missing'});
 for(const row of metadata.review?.writers??[])if(!reviews.has(row.clock.actor)||behindReviews.has(row.clock.actor))missing.push({kind:'review',principal:row.principal,actor:row.clock.actor,reason:reviews.has(row.clock.actor)?'server_ahead':'missing'});
 const registeredStreamsCovered=missing.length===0;missing.push(...unbound);for(const row of sources)checkSource(row);
 const coverage:SharedRoomParticipantCoverage={kind:missing.length?'pending':'covered',registeredStreamsCovered,checkedParticipants:checked,missing},selectedParticipants=[...chosen].sort(),unreconciledParticipants=state.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id);
 return frozen({source:inventoryIdentity.call(state.inventory).source,coverage,kind:coverage.kind==='covered'&&!unreconciledParticipants.length?'checked':'pending',selectedParticipants,unreconciledParticipants});
}
