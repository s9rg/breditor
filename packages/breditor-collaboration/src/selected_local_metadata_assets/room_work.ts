/** Source-owned finite replay/reference work. Exact older cuts use readonly
 * aliases; the freshly saved current point uses the actual held native core.
 * Late unclaimed restore results follow the existing native factory lifetime. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataReferenceBundle,LocalMetadataReferencePoint,LocalMetadataReferenceCut} from './room_contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {selectedNativeDeliverySources,selectedNativeDeliveryReads} from '../relay/native_delivery.js';
import {NativeReconstructionFactoryScope} from '../selected_native_reconstruction/factory_scope.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {verifyLocalReviewProgress} from '../selected_local_review_delivery/native_review.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import {detachLocalReviewBundle} from '../selected_local_review_delivery/bundle.js';
import {metadataSnapshot,metadataJson,equal} from '../selected_local_metadata_delivery/policy.js';
import {requireMetadataSnapshotForward} from '../selected_local_metadata_delivery/native_continuation.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import {readLocalMetadataRecordAssetReferences} from './record_references.js';
import {localMetadataReferencePoint,composeLocalMetadataReferenceCut} from './room_policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {coreReadStamp,type CoreReadStamp} from '../core_read_stamp.js';
import {localMetadataAvailabilityHost,type LocalMetadataAssetAvailabilityHost} from './availability_host.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {LocalMetadataAssetAvailabilityBundle} from './availability_contract.js';
import {readLocalMetadataUploadInventory,localMetadataAssetInfo} from './upload_inventory.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {checkRichAssetLimits,inspectRichRaster} from '@breditor/experimental-rich-content';
import {sharedRelayAssetReadPort,type SharedRelayAssets} from '../relay/assets.js';
import type {LocalMetadataMaterializationOptions,LocalMetadataMaterializationOutcome,LocalMetadataRasterInfo} from './materialization_contract.js';
import {encodeLocalMetadataRasters} from './raster_archive.js';
import {inspectLocalMetadataMaterializedRasters,inspectLocalMetadataRecoverableRasters} from './materialized_inspection.js';
import type {LocalMetadataMaterializedBundle,LocalMetadataMaterializedInspection} from './materialization_contract.js';
import {fail} from './error.js';
import {localMetadataRecoverableRequirements} from './recoverable_requirements.js';
import {encodeLocalMetadataRecoverableRasters} from './recoverable_raster_archive.js';
import type {LocalMetadataRecoverableOutcome,LocalMetadataRecoverableBundle,LocalMetadataRecoverableInspection} from './recoverable_contract.js';
const room={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,approval:SelectedRoomCurrentArchive.prototype.approval,dispose:SelectedRoomCurrentArchive.prototype.dispose};
const cut={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,selection:PhysicalRoomRecordCutArchive.prototype.selection,history:PhysicalRoomRecordCutArchive.prototype.history,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
const verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
export class LocalMetadataReferenceWork {
 readonly #sources;readonly #allSources;readonly #waits;readonly #factories:NativeReconstructionFactoryScope<SharedSelectionPolicy>|undefined;readonly #options;readonly #aliases=new Set<LocalPortableReplay>();readonly #liveStamps=new Map<object,CoreReadStamp>();readonly #availabilityStamps=new Map<object,CoreReadStamp>();
 #room:SelectedRoomCurrentArchive|undefined;#cut:PhysicalRoomRecordCutArchive|undefined;#parent:LocalReviewRoomBundle|undefined;#stored:LocalMetadataDeliverySnapshot|undefined;#points:LocalMetadataReferencePoint[]=[];#finished:{bundle:LocalMetadataReferenceBundle;body:LocalMetadataReferenceCut}|undefined;#closed=false;#started=false;#ready=false;
 constructor(scope:SelectedNativeRecoveryScope,options:SharedArchiveIntegrityOptions,check:()=>void){
  // These original readers admit the genuine scope before callback/IO work.
  this.#allSources=selectedNativeDeliverySources(scope);this.#sources=this.#allSources.filter(row=>row.source.parent.kind==='independent-local');const reads=selectedNativeDeliveryReads(scope);
  this.#waits=new NativeReconstructionWaits(check,[scope.signal]);
  try{this.#factories=new NativeReconstructionFactoryScope(reads);this.#factories.bind(scope,this.#waits.signal);this.#options={wasm:options.wasm,checkAuthority:this.#check,signal:this.#waits.signal};this.#check();for(const row of this.#allSources)this.#availabilityStamps.set(row.source.core,coreReadStamp(row.source.core));Object.freeze(this);}catch(error){this.close();throw error;}
 }
 #check=()=>{if(this.#closed)throw fail('local_metadata_assets_closed');this.#waits.check();if(this.#closed)throw fail('local_metadata_assets_closed');};
 async begin(providedParent:LocalReviewRoomBundle,providedStored:LocalMetadataDeliverySnapshot):Promise<void>{
  this.#check();if(this.#started)throw fail('local_metadata_assets_busy');this.#started=true;const parent=detachLocalReviewBundle(providedParent),data=metadataData(providedStored) as LocalMetadataDeliverySnapshot,choice=data.current.choice,stored=await metadataSnapshot(data,choice);this.#check();
  if(this.#sources.length!==stored.current.lanes.length||!equal(parent.prepared.choice.before,choice.parent.before))throw fail('local_metadata_assets_state');
  const integrity=prepareArchiveIntegrity(this.#options);if(parent.prepared.file.size!==choice.parent.before.bytes||await integrity.digest(parent.prepared.file)!==choice.parent.before.sha256)throw fail('local_metadata_assets_state');this.#check();
  this.#room=await room.read.call(SelectedRoomCurrentArchive,parent.current.file,parent.current.selection,this.#options);this.#check();const record=room.current.call(this.#room);this.#cut=await cut.read.call(PhysicalRoomRecordCutArchive,record.file,record.selection,this.#options);this.#check();
  const catalog=parsePhysicalCatalogV3Manifest(cut.root.call(this.#cut).source.manifest),before=[],current=[];
  for(const [index,lane]of stored.current.lanes.entries()){
   this.#check();const original=stored.before.lanes[index]!,actual=this.#sources.find(row=>row.id===lane.id),entry=catalog.participants.find(row=>row.id===lane.id),factory=this.#factories?.reads.find(row=>row.id===lane.id)?.read as {session:SharedIndependentRecoveryFactory<SharedSelectionPolicy>}|undefined;
   if(!actual||actual.source.parent.kind!=='independent-local'||!entry||entry.family!==actual.family||!factory||!['independent-local','local-operation-snapshot','local-operation-flat'].includes(entry.family)||choice.parent.lanes[index]!.family!==actual.family)throw fail('local_metadata_assets_state');
   const selected=(entry.family==='independent-local'?entry.selection:(entry as {selection:{original:SharedIndependentParticipantSelection}}).selection.original) as SharedIndependentParticipantSelection;
   let older:LocalPortableReplay|undefined,newer:LocalPortableReplay|undefined;
   try{
    older=await replayLocalOperationRecovery(selected,factory.session,original.source,this.#check);this.#aliases.add(older);this.#check();verifyLocalReviewProgress(older.core,original.relay);before.push(await readLocalMetadataRecordAssetReferences(older.core,stored.before,lane.id,this.#check));this.#check();
    if(equal(original.source,lane.source))newer=older;else{newer=await replayLocalOperationRecovery(selected,factory.session,lane.source,this.#check);this.#aliases.add(newer);this.#check();verifyLocalOperationContinuation(newer,older);}
    forwardProgress(original.relay,lane.relay);verifyLocalReviewProgress(newer.core,lane.relay);current.push(await readLocalMetadataRecordAssetReferences(newer.core,stored.current,lane.id,this.#check));this.#check();
    const port=independentHistoryNative(actual.source.parent.session),live=port.persisted();if(port.companion||port.core!==actual.source.core||live.versions.length<lane.source.versions.length||lane.source.versions.some((packet,i)=>live.versions[i]!==packet))throw fail('local_metadata_assets_state');(lane.source.identity.documentHistory==='original'?verifyOriginal:verifySegmented).call(actual.source.core,newer.core);this.#check();this.#liveStamps.set(actual.source.core,coreReadStamp(actual.source.core));
   }finally{if(newer){newer.dispose();this.#aliases.delete(newer);}if(older){older.dispose();this.#aliases.delete(older);}}
  }
  this.#points=[await localMetadataReferencePoint('before',stored.before,before),await localMetadataReferencePoint('stored',stored.current,current)];this.#check();this.#parent=parent;this.#stored=stored;this.#ready=true;
 }
 async finish(bundle:LocalMetadataRoomBundle,provided:LocalMetadataDeliverySnapshot):Promise<LocalMetadataReferenceBundle>{
  this.#check();if(!this.#ready||!this.#stored||!this.#parent||!this.#cut)throw fail('local_metadata_assets_closed');const snapshot=await metadataSnapshot(metadataData(provided),this.#stored.current.choice);this.#check();requireMetadataSnapshotForward(this.#stored,snapshot);
  if(!equal(bundle.parent.prepared.choice,this.#parent.prepared.choice)||!equal(bundle.parent.current.selection,this.#parent.current.selection)||bundle.parent.delivery.bytes!==this.#parent.delivery.bytes||bundle.parent.delivery.sha256!==this.#parent.delivery.sha256)throw fail('local_metadata_assets_state');
  const review=JSON.parse(await Blob.prototype.text.call(bundle.parent.delivery.file));this.#check();if(!equal(review.current.lanes,snapshot.current.lanes.map(({id,source,relay})=>({id,source,relay}))))throw fail('local_metadata_assets_state');
  const rows=[];for(const lane of snapshot.current.lanes){const actual=this.#sources.find(row=>row.id===lane.id);if(!actual||actual.source.parent.kind!=='independent-local')throw fail('local_metadata_assets_state');const stamp=coreReadStamp(actual.source.core),before=this.#liveStamps.get(actual.source.core);if(!before||stamp.document!==before.document||stamp.review!==before.review)throw fail('local_metadata_assets_changed');const port=independentHistoryNative(actual.source.parent.session);if(port.companion||port.core!==actual.source.core||!equal(port.persisted(),lane.source))throw fail('local_metadata_assets_state');rows.push(await readLocalMetadataRecordAssetReferences(actual.source.core,snapshot.current,lane.id,this.#check));this.#check();if(!equal(port.persisted(),lane.source))throw fail('local_metadata_assets_changed');}
  const point=await localMetadataReferencePoint('current',snapshot.current,rows);this.#check();const body=await composeLocalMetadataReferenceCut(bundle,snapshot,this.#stored.current,cut.history.call(this.#cut),[...this.#points,point]);this.#check();const text=metadataJson(body),file=new Blob([text],{type:'application/vnd.breditor.local-metadata-reference-cut+json'}),sha256=await segmentedDigest(text);this.#check();
  const result=Object.freeze({format:'breditor/selected-local-metadata-reference-bundle' as const,formatVersion:1 as const,parent:bundle,references:Object.freeze({file,bytes:file.size,sha256})});this.#finished={bundle:result,body};return result;
 }
 /** Only a freshly captured native/current cut can request this union. A
  * portable old cut cannot stand in for newer live metadata requirements. */
 async availability(host:LocalMetadataAssetAvailabilityHost):Promise<LocalMetadataAssetAvailabilityBundle>{
  const port=localMetadataAvailabilityHost(host);this.#check();if(!this.#finished||!this.#room||!this.#cut)throw fail('local_metadata_assets_closed');
  const finished=this.#finished,root=cut.root.call(this.#cut),catalog=parsePhysicalCatalogV3Manifest(root.source.manifest);port.admit(catalog);
  const check=()=>{this.#check();for(const actual of this.#allSources){const before=this.#availabilityStamps.get(actual.source.core),now=coreReadStamp(actual.source.core);if(!before||before.document!==now.document||before.review!==now.review)throw fail('local_metadata_assets_changed');}};check();
  const uploads=await readLocalMetadataUploadInventory(this.#room,this.#cut,this.#options,check);check();
  let provider:SharedServerLogGenerationRecoveryAssetRead|null=null;
  if(finished.body.outcome.kind==='pending'){await port.check(this.#waits.signal);check();}
  else{provider=await port.checkAssets({references:finished.body.outcome.references,uploads:[...uploads.assets.keys()].sort()},this.#waits.signal);check();for(const actual of provider.assets){const local=uploads.assets.get(actual.asset);if(local&&localMetadataAssetInfo(local)!==localMetadataAssetInfo(actual))throw fail('local_metadata_assets_state');}}
  const selected={format:'breditor/local-metadata-asset-availability-read' as const,formatVersion:1 as const,scope:'complete-base-and-metadata-references-and-origin-selected-upload-bytes' as const,references:{bytes:finished.bundle.references.bytes,sha256:finished.bundle.references.sha256},control:port.control,approval:room.approval.call(this.#room).selection,current:cut.selection.call(this.#cut),uploads:uploads.pins};
  const availability=provider!==null&&!provider.missing.length?frozen({...selected,kind:'checked' as const,provider}):frozen({...selected,kind:'pending' as const,provider});check();
  return Object.freeze({format:'breditor/selected-local-metadata-asset-availability-bundle',formatVersion:1,references:finished.bundle,availability});
 }
 /** Preserve actual immutable content for every provider requirement and
  * whole-upload ID. Read from admitted local archives first; missing content
  * uses a genuine account transport without mutating held cache state. */
 async materialize(host:LocalMetadataAssetAvailabilityHost,transport:SharedRelayAssets,options:LocalMetadataMaterializationOptions):Promise<LocalMetadataMaterializationOutcome>{
  const network=sharedRelayAssetReadPort(transport),limits=checkRichAssetLimits(options.limits),available=await this.availability(host);this.#check();
  if(available.availability.kind==='pending')return frozen({kind:'pending',availability:available,missing:[{kind:'source-or-provider'}]});
  if(!this.#room||!this.#cut||!this.#finished||this.#finished.body.outcome.kind!=='ready')throw fail('local_metadata_assets_closed');
  const check=()=>{this.#check();for(const row of this.#allSources){const before=this.#availabilityStamps.get(row.source.core),now=coreReadStamp(row.source.core);if(!before||before.document!==now.document||before.review!==now.review)throw fail('local_metadata_assets_changed');}};
  const uploads=await readLocalMetadataUploadInventory(this.#room,this.#cut,this.#options,check,true);check();
  const payloads:{info:LocalMetadataRasterInfo;blob:Blob}[]=[],missing:{kind:'download';asset:string}[]=[];let total=0;
  for(const expected of available.availability.provider.assets){check();let blob=uploads.payloads.get(expected.asset);
   if(!blob){const downloaded=await network.read(expected.asset,this.#waits.signal);check();if(!downloaded){missing.push({kind:'download',asset:expected.asset});continue;}if(downloaded.asset!==expected.asset||downloaded.mime!==expected.mime||downloaded.bytes!==expected.bytes)throw fail('local_metadata_assets_state');blob=downloaded.blob;}
   const raster=await inspectRichRaster(blob,{limits,signal:this.#waits.signal});check();if(raster.asset!==expected.asset||raster.mime!==expected.mime||raster.bytes!==expected.bytes||raster.width!==expected.width||raster.height!==expected.height)throw fail('local_metadata_assets_state');total+=raster.bytes;if(total>limits.maxStoredBytes)throw fail('local_metadata_assets_raster_budget');payloads.push({info:expected,blob:raster.blob});
  }
  if(missing.length)return frozen({kind:'pending',availability:available,missing});
  const rasters=await encodeLocalMetadataRasters({bytes:available.references.references.bytes,sha256:available.references.references.sha256},available.availability,payloads,this.#options,limits);check();
  // A client-only opaque mapping is not protected merely by the selected
  // server's older mapping set. Compare the entire requested union again.
  const port=localMetadataAvailabilityHost(host),fresh=await port.checkAssets({references:this.#finished.body.outcome.references,uploads:[...uploads.assets.keys()].sort()},this.#waits.signal);check();if(!equal(fresh,available.availability.provider))throw fail('local_metadata_assets_changed');
  return Object.freeze({kind:'ready',bundle:Object.freeze({format:'breditor/selected-local-metadata-materialized-bundle',formatVersion:1,references:available.references,rasters})});
 }
 /** V2 recovery bytes may include durable local uploads still absent from the
  * server. Preserve original provider Pending and queue state verbatim; only
  * a complete Native/mapping/payload union can return this distinct bundle. */
 async recoverAssets(host:LocalMetadataAssetAvailabilityHost,transport:SharedRelayAssets,options:LocalMetadataMaterializationOptions):Promise<LocalMetadataRecoverableOutcome>{
  const network=sharedRelayAssetReadPort(transport),limits=checkRichAssetLimits(options.limits),available=await this.availability(host);this.#check();
  if(!this.#room||!this.#cut||!this.#finished)throw fail('local_metadata_assets_closed');
  const body=this.#finished.body,provider=available.availability.provider;
  if(body.outcome.kind!=='ready'||provider===null)return frozen({kind:'pending',availability:available,missing:[{kind:'source-or-provider'}]});
  const check=()=>{this.#check();for(const row of this.#allSources){const before=this.#availabilityStamps.get(row.source.core),now=coreReadStamp(row.source.core);if(!before||before.document!==now.document||before.review!==now.review)throw fail('local_metadata_assets_changed');}};
  const uploads=await readLocalMetadataUploadInventory(this.#room,this.#cut,this.#options,check,true);check();
  const union=localMetadataRecoverableRequirements(body.outcome.references,uploads.assets,provider);
  if(union.unresolved.length)return frozen({kind:'pending',availability:available,missing:[{kind:'source-or-provider'}]});
  if(union.unavailable.length)return frozen({kind:'pending',availability:available,missing:union.unavailable.map(asset=>({kind:'download' as const,asset}))});
  const payloads:{info:LocalMetadataRasterInfo;blob:Blob}[]=[],missing:{kind:'download';asset:string}[]=[];let total=0;
  for(const expected of union.payloads){check();let blob=uploads.payloads.get(expected.asset);
   if(!blob){const downloaded=await network.read(expected.asset,this.#waits.signal);check();if(!downloaded){missing.push({kind:'download',asset:expected.asset});continue;}if(downloaded.asset!==expected.asset||downloaded.mime!==expected.mime||downloaded.bytes!==expected.bytes)throw fail('local_metadata_assets_state');blob=downloaded.blob;}
   const raster=await inspectRichRaster(blob,{limits,signal:this.#waits.signal});check();if(raster.asset!==expected.asset||raster.mime!==expected.mime||raster.bytes!==expected.bytes||raster.width!==expected.width||raster.height!==expected.height)throw fail('local_metadata_assets_state');total+=raster.bytes;if(total>limits.maxStoredBytes)throw fail('local_metadata_assets_raster_budget');payloads.push({info:expected,blob:raster.blob});
  }
  if(missing.length)return frozen({kind:'pending',availability:available,missing});
  const rasters=await encodeLocalMetadataRecoverableRasters({bytes:available.references.references.bytes,sha256:available.references.references.sha256},available.availability,payloads,this.#options,limits);check();
  const fresh=await localMetadataAvailabilityHost(host).checkAssets({references:body.outcome.references,uploads:[...uploads.assets.keys()].sort()},this.#waits.signal);check();if(!equal(fresh,provider))throw fail('local_metadata_assets_changed');
  return Object.freeze({kind:'ready',bundle:Object.freeze({format:'breditor/selected-local-metadata-recoverable-bundle',formatVersion:1,references:available.references,rasters})});
 }
 /** Recompute an older portable current point on readonly native aliases.
  * Unlike finish(), no live core is substituted for an archived point. All
  * three exact cuts precede the actual source; no journal is written here. */
 async readPortable(bundle:LocalMetadataRoomBundle,provided:LocalMetadataDeliverySnapshot):Promise<LocalMetadataReferenceCut>{
  this.#check();if(!this.#ready||!this.#stored||!this.#parent||!this.#cut)throw fail('local_metadata_assets_closed');
  const snapshot=await metadataSnapshot(metadataData(provided),this.#stored.current.choice);this.#check();requireMetadataSnapshotForward(this.#stored,snapshot);
  if(!equal(bundle.parent.prepared.choice,this.#parent.prepared.choice)||!equal(bundle.parent.current.selection,this.#parent.current.selection)||bundle.parent.delivery.bytes!==this.#parent.delivery.bytes||bundle.parent.delivery.sha256!==this.#parent.delivery.sha256)throw fail('local_metadata_assets_state');
  const catalog=parsePhysicalCatalogV3Manifest(cut.root.call(this.#cut).source.manifest),rows=[];
  for(const [index,lane]of snapshot.current.lanes.entries()){
   this.#check();const stored=this.#stored.current.lanes[index]!,actual=this.#sources.find(row=>row.id===lane.id),entry=catalog.participants.find(row=>row.id===lane.id),factory=this.#factories?.reads.find(row=>row.id===lane.id)?.read as {session:SharedIndependentRecoveryFactory<SharedSelectionPolicy>}|undefined;
   if(!actual||actual.source.parent.kind!=='independent-local'||!entry||entry.family!==actual.family||!factory||!['independent-local','local-operation-snapshot','local-operation-flat'].includes(entry.family))throw fail('local_metadata_assets_state');
   const selected=(entry.family==='independent-local'?entry.selection:(entry as {selection:{original:SharedIndependentParticipantSelection}}).selection.original) as SharedIndependentParticipantSelection;
   let older:LocalPortableReplay|undefined,newer:LocalPortableReplay|undefined;
   try{
    older=await replayLocalOperationRecovery(selected,factory.session,stored.source,this.#check);this.#aliases.add(older);this.#check();verifyLocalReviewProgress(older.core,stored.relay);
    if(equal(stored.source,lane.source))newer=older;else{newer=await replayLocalOperationRecovery(selected,factory.session,lane.source,this.#check);this.#aliases.add(newer);this.#check();verifyLocalOperationContinuation(newer,older);}
    forwardProgress(stored.relay,lane.relay);verifyLocalReviewProgress(newer.core,lane.relay);
    const port=independentHistoryNative(actual.source.parent.session),live=port.persisted();if(port.companion||port.core!==actual.source.core||live.versions.length<lane.source.versions.length||lane.source.versions.some((packet,i)=>live.versions[i]!==packet))throw fail('local_metadata_assets_state');
    (lane.source.identity.documentHistory==='original'?verifyOriginal:verifySegmented).call(actual.source.core,newer.core);this.#check();
    rows.push(await readLocalMetadataRecordAssetReferences(newer.core,snapshot.current,lane.id,this.#check));this.#check();
   }finally{if(newer){newer.dispose();this.#aliases.delete(newer);}if(older){older.dispose();this.#aliases.delete(older);}}
  }
  const point=await localMetadataReferencePoint('current',snapshot.current,rows);this.#check();
  const body=await composeLocalMetadataReferenceCut(bundle,snapshot,this.#stored.current,cut.history.call(this.#cut),[...this.#points,point]);this.#check();
  for(const actual of this.#sources){const before=this.#liveStamps.get(actual.source.core),now=coreReadStamp(actual.source.core);if(!before||before.document!==now.document||before.review!==now.review)throw fail('local_metadata_assets_changed');}
  return body;
 }
 /** Read complete archived bytes while the actual owner's Native inspection
  * slot is held. All seven document/comment sources remain pinned; the
  * returned historical provider JSON is never a current authority. */
 async inspectMaterialized(bundle:LocalMetadataMaterializedBundle,body:LocalMetadataReferenceCut,options:LocalMetadataMaterializationOptions):Promise<LocalMetadataMaterializedInspection>{
  this.#check();if(!this.#ready||!this.#room||!this.#cut)throw fail('local_metadata_assets_closed');
  const check=()=>{this.#check();for(const row of this.#allSources){const before=this.#availabilityStamps.get(row.source.core),now=coreReadStamp(row.source.core);if(!before||before.document!==now.document||before.review!==now.review)throw fail('local_metadata_assets_changed');}};
  check();const result=await inspectLocalMetadataMaterializedRasters(bundle,body,this.#room,this.#cut,this.#options,checkRichAssetLimits(options.limits),check);check();return result;
 }
 /** Exact Native inspection plus the complete V2 local/provider payload set.
  * Recorded server-missing entries remain missing and confer no upload ACK. */
 async inspectRecoverable(bundle:LocalMetadataRecoverableBundle,body:LocalMetadataReferenceCut,options:LocalMetadataMaterializationOptions):Promise<LocalMetadataRecoverableInspection>{
  this.#check();if(!this.#ready||!this.#room||!this.#cut)throw fail('local_metadata_assets_closed');
  const check=()=>{this.#check();for(const row of this.#allSources){const before=this.#availabilityStamps.get(row.source.core),now=coreReadStamp(row.source.core);if(!before||before.document!==now.document||before.review!==now.review)throw fail('local_metadata_assets_changed');}};
  check();const result=await inspectLocalMetadataRecoverableRasters(bundle,body,this.#room,this.#cut,this.#options,checkRichAssetLimits(options.limits),check);check();return result;
 }
 /** Cancels finite reads, disposes claimed aliases and observes/frees late
  * unclaimed raw restores through the original factory wait implementation. */
 close():void{if(this.#closed)return;this.#closed=true;try{this.#factories?.close();}finally{this.#waits.close();for(const alias of this.#aliases)alias.dispose();this.#aliases.clear();this.#liveStamps.clear();this.#availabilityStamps.clear();if(this.#cut)cut.dispose.call(this.#cut);if(this.#room)room.dispose.call(this.#room);this.#cut=undefined;this.#room=undefined;this.#stored=undefined;this.#parent=undefined;this.#points=[];this.#finished=undefined;}}
}
