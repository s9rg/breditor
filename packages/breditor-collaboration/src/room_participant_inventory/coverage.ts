import {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {capturedNativeHistoryRead} from '../native_history_read/registry.js';
import type {CapturedDocumentHistoryRead,CapturedReviewHistorySelection} from '../native_history_read/contract.js';
import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {readPairedBackupRecord} from "../backups/paired.js";
import {prefixAt,transportVersion} from "../relay/validation.js";
import {sharedProtocolLanguage} from "../protocol.js";
import {checkInventoryStores} from "./stores.js";
import {frozen,SharedRoomParticipantInventoryError} from "./policy.js";
import type {SharedRoomParticipantCoverage,SharedRoomParticipantInventoryMetadata,SharedRoomParticipantMissing,SharedRoomParticipantSource} from "./types.js";
const sourceError=()=>new SharedRoomParticipantInventoryError("inventory_source","The genuine selected participant source does not match this native registration inventory");
const fork=()=>new SharedRoomParticipantInventoryError("inventory_fork","The original accepted native prefix does not match this participant history");
const duplicate=()=>new SharedRoomParticipantInventoryError("inventory_duplicate","Reconcile multiple copies of the same registered stream explicitly; no source was selected or discarded");
const verifySource=SharedParticipantBackup.prototype.verifySource,selection=SharedParticipantBackup.prototype.selection,records=SharedParticipantBackup.prototype.records,check=SharedAssetReferenceCapture.prototype.check;
/** Synchronous pure prefix reconciliation. Current credentials and upload/provider closure are separate. */
export function checkInventorySources(metadata:SharedRoomParticipantInventoryMetadata,input:readonly SharedRoomParticipantSource[]):SharedRoomParticipantCoverage {
 if(!Array.isArray(input)||input.length>1024)throw sourceError();const sources=input.map(s=>({backup:s.backup,source:s.source})),documents=new Set<string>(),reviews=new Set<string>(),behindDocuments=new Set<string>(),behindReviews=new Set<string>(),unbound:SharedRoomParticipantMissing[]=[],checked:SharedRoomParticipantCoverage["checkedParticipants"][number][]=[];
 for(const {backup,source}of sources){
  let identity:ReturnType<SharedParticipantBackup["selection"]>["identity"],native:CapturedDocumentHistoryRead,reviewNative:CapturedReviewHistorySelection,captured:ReturnType<SharedParticipantBackup["records"]>;
  try{verifySource.call(backup,source);identity=selection.call(backup).identity;captured=records.call(backup);const lanes=capturedNativeHistoryRead(source);native=lanes.document;reviewNative=lanes.review;if(native.kind!=='original'||native.checkpointJson()!==captured[0]?.json)throw sourceError();}catch{throw sourceError();}
  const writer=identity.source.writer,row=metadata.writers.find(w=>w.clock.writer===writer),descriptor=native.descriptor();
  if(!row||row.principal!==identity.principal||identity.source.room!==metadata.room.document||identity.source.richLanguage!==metadata.richLanguage||sharedProtocolLanguage(descriptor)!==metadata.richLanguage||descriptor.schemaFingerprint!==metadata.schemaFingerprint)throw sourceError();
  checkInventoryStores(metadata,captured,identity.principal,writer);
  if(documents.has(writer))throw duplicate();documents.add(writer);
  const version=metadata.room.writerTransportVersion,local=version===2?native.writerClockV2(writer):native.writerClock(writer);
  if(row.observer&&local.through!=="0")throw sourceError();
  if(BigInt(local.through)<BigInt(row.clock.through))behindDocuments.add(writer);
  else if(prefixAt(native,writer,row.clock.through,version)!==row.clock.prefixDigest)throw fork();
  checked.push({participant:identity.participant,principal:identity.principal,writer,observer:row.observer,localThrough:local.through,acceptedThrough:row.clock.through});
  const paired=captured.find(r=>r.kind==="paired-session");
  if(paired){
   const record=readPairedBackupRecord(paired.json,identity.source);
   if(record.principal!==identity.principal||reviewNative.kind!=='original'||reviewNative.checkpointJson()!==record.reviewCheckpointJson||reviewNative.localReviewClock().actor!==record.reviewActor)throw sourceError();
   const relay="relay"in record?record.relay:null;
   if(!relay)unbound.push({kind:"unbound_review",participant:identity.participant,principal:record.principal,actor:record.reviewActor});
   else{
    const registered=metadata.review?.writers.find(w=>w.clock.actor===record.reviewActor);
    if(!registered||metadata.review?.binding!==relay.binding||relay.principal!==identity.principal||registered.principal!==identity.principal||relay.documentWriter!==writer||relay.room!==metadata.room.document||transportVersion(relay.writerTransport)!==version||registered.observer!==(relay.reviewEditing==="read_only"))throw sourceError();
    if(reviews.has(record.reviewActor))throw duplicate();reviews.add(record.reviewActor);
    const head=reviewNative.reviewWriterClock(record.reviewActor,record.principal);
    if(registered.observer&&head.through!=="0")throw sourceError();
    if(BigInt(head.through)<BigInt(registered.clock.through))behindReviews.add(record.reviewActor);
    else if(reviewNative.reviewWriterClock(record.reviewActor,record.principal,registered.clock.through).prefixDigest!==registered.clock.prefixDigest)throw fork();
   }
  }
  try{verifySource.call(backup,source);check.call(source);capturedNativeHistoryRead(source);}catch{throw sourceError();}
 }
 const missing:SharedRoomParticipantMissing[]=[];
 for(const row of metadata.writers)if(!documents.has(row.clock.writer)||behindDocuments.has(row.clock.writer))missing.push({kind:"document",principal:row.principal,writer:row.clock.writer,reason:documents.has(row.clock.writer)?"server_ahead":"missing"});
 for(const row of metadata.review?.writers??[])if(!reviews.has(row.clock.actor)||behindReviews.has(row.clock.actor))missing.push({kind:"review",principal:row.principal,actor:row.clock.actor,reason:reviews.has(row.clock.actor)?"server_ahead":"missing"});
 const registeredStreamsCovered=missing.length===0;missing.push(...unbound);
 for(const {backup,source}of sources)try{verifySource.call(backup,source);check.call(source);capturedNativeHistoryRead(source);}catch{throw sourceError();}
 return frozen({kind:missing.length?"pending":"covered",registeredStreamsCovered,checkedParticipants:checked,missing});
}
