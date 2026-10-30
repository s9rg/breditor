/** Source-owned finite replay/reference work. Exact older cuts use readonly
 * aliases; the freshly saved current point uses the actual held native core.
 * Late unclaimed restore results follow the existing native factory lifetime. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataReferenceBundle,LocalMetadataReferencePoint} from './room_contract.js';
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
import {fail} from './error.js';
const room={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,dispose:SelectedRoomCurrentArchive.prototype.dispose};
const cut={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,history:PhysicalRoomRecordCutArchive.prototype.history,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
const verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
export class LocalMetadataReferenceWork {
 readonly #sources;readonly #waits;readonly #factories:NativeReconstructionFactoryScope<SharedSelectionPolicy>|undefined;readonly #options;readonly #aliases=new Set<LocalPortableReplay>();readonly #liveStamps=new Map<object,CoreReadStamp>();
 #room:SelectedRoomCurrentArchive|undefined;#cut:PhysicalRoomRecordCutArchive|undefined;#parent:LocalReviewRoomBundle|undefined;#stored:LocalMetadataDeliverySnapshot|undefined;#points:LocalMetadataReferencePoint[]=[];#closed=false;#started=false;#ready=false;
 constructor(scope:SelectedNativeRecoveryScope,options:SharedArchiveIntegrityOptions,check:()=>void){
  // These original readers admit the genuine scope before callback/IO work.
  this.#sources=selectedNativeDeliverySources(scope).filter(row=>row.source.parent.kind==='independent-local');const reads=selectedNativeDeliveryReads(scope);
  this.#waits=new NativeReconstructionWaits(check,[scope.signal]);
  try{this.#factories=new NativeReconstructionFactoryScope(reads);this.#factories.bind(scope,this.#waits.signal);this.#options={wasm:options.wasm,checkAuthority:this.#check,signal:this.#waits.signal};this.#check();Object.freeze(this);}catch(error){this.close();throw error;}
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
  return Object.freeze({format:'breditor/selected-local-metadata-reference-bundle',formatVersion:1,parent:bundle,references:Object.freeze({file,bytes:file.size,sha256})});
 }
 /** Cancels finite reads, disposes claimed aliases and observes/frees late
  * unclaimed raw restores through the original factory wait implementation. */
 close():void{if(this.#closed)return;this.#closed=true;try{this.#factories?.close();}finally{this.#waits.close();for(const alias of this.#aliases)alias.dispose();this.#aliases.clear();this.#liveStamps.clear();if(this.#cut)cut.dispose.call(this.#cut);if(this.#room)room.dispose.call(this.#room);this.#cut=undefined;this.#room=undefined;this.#stored=undefined;this.#parent=undefined;this.#points=[];}}
}
