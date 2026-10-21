/** Reconcile genuine generation participants with an independently selected native
 * registration cut. This is pure prefix coverage, not current authority, provider
 * closure, reconciliation of unselected copies or whole-room activation. */
import {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {SharedGenerationSourceCapture} from "../generation_source/capture.js";
import {capturedNativeHistoryRead} from '../native_history_read/registry.js';
import {sharedProtocolLanguage} from "../protocol.js";
import {prefixAt,transportVersion} from "../relay/validation.js";
import {checkInventoryStores} from "./stores.js";
import {frozen,SharedRoomParticipantInventoryError} from "./policy.js";
import type {SharedAssetCaptureRecord} from "../asset_references_capture.js";
import type {SharedRoomParticipantInventoryMetadata,SharedRoomGenerationParticipantSource,SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from "./types.js";

const sourceError=()=>new SharedRoomParticipantInventoryError("inventory_source","The genuine generation participant differs from this native registration inventory");
const fork=()=>new SharedRoomParticipantInventoryError("inventory_fork","The accepted native prefix differs from this retained generation history");
const duplicate=()=>new SharedRoomParticipantInventoryError("inventory_duplicate","Reconcile copies of a registered stream explicitly; no source was selected or discarded");
const {verifySource,selection,records}=SharedGenerationParticipantBackup.prototype,check=SharedGenerationSourceCapture.prototype.check;

export function checkInventoryGenerationSources(metadata:SharedRoomParticipantInventoryMetadata,input:readonly SharedRoomGenerationParticipantSource[]):SharedRoomParticipantCoverage {
 if(!Array.isArray(input)||input.length>1024)throw sourceError();
 const sources=input.map(s=>({backup:s.backup,source:s.source})),documents=new Set<string>(),reviews=new Set<string>(),behindDocuments=new Set<string>(),behindReviews=new Set<string>(),unbound:SharedRoomParticipantMissing[]=[],checked:SharedRoomParticipantCoverage["checkedParticipants"][number][]=[];
 const writers=new Map(metadata.writers.map(row=>[row.clock.writer,row])),actors=new Map(metadata.review?.writers.map(row=>[row.clock.actor,row])??[]);
 for(const {backup,source}of sources){
  verifySource.call(backup,source);const identity=selection.call(backup).identity,id=identity.source,lanes=capturedNativeHistoryRead(source),native=lanes.document,reviewNative=lanes.review,captured=records.call(backup),writer=id.native.writer,row=writers.get(writer),descriptor=native.descriptor();
  if(!row||native.kind!=='segmented-v1'||row.principal!==identity.principal||id.native.room!==metadata.room.document||id.native.richLanguage!==metadata.richLanguage||sharedProtocolLanguage(descriptor)!==metadata.richLanguage||descriptor.schemaFingerprint!==metadata.schemaFingerprint||native.checkpointJson()!==captured[0]?.json)throw sourceError();
  const version=metadata.room.writerTransportVersion,document=id.relay?.document;
  if(document&&(document.writer!==writer||document.principal!==identity.principal||document.room!==metadata.room.document||transportVersion(document.writerTransport)!==version))throw sourceError();
  // Only unchanged original retained-store records use their original closed readers.
  // Native generation checkpoints are never translated into old document journals.
  const retained=captured.flatMap<SharedAssetCaptureRecord>(record=>record.kind==="suggestions"?[{kind:"suggestions",json:record.json}]:record.kind==="revisions"?[{kind:"suggestion-revisions",json:record.json}]:record.kind==="versions"?[{kind:"version-catalog",json:record.json}]:[]);
  checkInventoryStores(metadata,retained,identity.principal,writer);
  if(documents.has(writer))throw duplicate();documents.add(writer);const local=version===2?native.writerClockV2(writer):native.writerClock(writer);
  if(row.observer&&local.through!=="0")throw sourceError();
  if(BigInt(local.through)<BigInt(row.clock.through))behindDocuments.add(writer);
  else if(prefixAt(native,writer,row.clock.through,version)!==row.clock.prefixDigest)throw fork();
  checked.push({participant:identity.participant,principal:identity.principal,writer,observer:row.observer,localThrough:local.through,acceptedThrough:row.clock.through});
  if(id.review){
   if(id.review.principal!==identity.principal||reviewNative.kind!=='original'||reviewNative.checkpointJson()!==captured.find(record=>record.kind==="review")?.json||reviewNative.localReviewClock().actor!==id.review.actor)throw sourceError();
   const relay=id.relay?.review;
   if(!relay)unbound.push({kind:"unbound_review",participant:identity.participant,principal:id.review.principal,actor:id.review.actor});
   else{
    const registered=actors.get(id.review.actor);
    if(!registered||metadata.review?.binding!==relay.binding||relay.principal!==identity.principal||registered.principal!==identity.principal||relay.documentWriter!==writer||relay.room!==metadata.room.document||transportVersion(relay.writerTransport)!==version||registered.observer!==(relay.reviewEditing==="read_only"))throw sourceError();
    if(reviews.has(id.review.actor))throw duplicate();reviews.add(id.review.actor);const head=reviewNative.reviewWriterClock(id.review.actor,id.review.principal);
    if(registered.observer&&head.through!=="0")throw sourceError();
    if(BigInt(head.through)<BigInt(registered.clock.through))behindReviews.add(id.review.actor);
    else if(reviewNative.reviewWriterClock(id.review.actor,id.review.principal,registered.clock.through).prefixDigest!==registered.clock.prefixDigest)throw fork();
   }
  }
  verifySource.call(backup,source);check.call(source);lanes.check();
 }
 const missing:SharedRoomParticipantMissing[]=[];
 for(const row of metadata.writers)if(!documents.has(row.clock.writer)||behindDocuments.has(row.clock.writer))missing.push({kind:"document",principal:row.principal,writer:row.clock.writer,reason:documents.has(row.clock.writer)?"server_ahead":"missing"});
 for(const row of metadata.review?.writers??[])if(!reviews.has(row.clock.actor)||behindReviews.has(row.clock.actor))missing.push({kind:"review",principal:row.principal,actor:row.clock.actor,reason:reviews.has(row.clock.actor)?"server_ahead":"missing"});
 const registeredStreamsCovered=missing.length===0;missing.push(...unbound);
 for(const {backup,source}of sources){verifySource.call(backup,source);check.call(source);capturedNativeHistoryRead(source);}
 return frozen({kind:missing.length?"pending":"covered",registeredStreamsCovered,checkedParticipants:checked,missing});
}
