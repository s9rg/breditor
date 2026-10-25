/** Re-admit complete data in the genuine root's runtime. All actual selected
 * stores and native parents remain held across native ancestry, raster/queue
 * continuity and current-file encoding. No writer is restored from this data. */
import {RichAssetStore,RichAssetReconciledBase} from '@breditor/experimental-rich-content';
import {SelectedRoomCurrentArchive,encodeSelectedRoomCurrent} from '../selected_room_current/archive.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {RoomAssetApprovalArchive} from '../physical_room_asset_approval/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {sameAdoptionBytes} from '../physical_room_asset_adoption/storage.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import type {SharedSelectionPolicy} from '../types.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
import {coldSelectedRoomChoice} from './choice.js';
import type {ColdSelectedRoomPreview} from './contract.js';
import type {ColdSelectedResources} from './resources.js';
const source={read:SelectedRoomCurrentArchive.read,approval:SelectedRoomCurrentArchive.prototype.approval,current:SelectedRoomCurrentArchive.prototype.current,file:SelectedRoomCurrentArchive.prototype.file,upload:SelectedRoomCurrentArchive.prototype.uploadFile,dispose:SelectedRoomCurrentArchive.prototype.dispose};
const approval={read:RoomAssetApprovalArchive.read,cut:RoomAssetApprovalArchive.prototype.recordCut,base:RoomAssetApprovalArchive.prototype.baseFile,dispose:RoomAssetApprovalArchive.prototype.dispose};
const cutRead=PhysicalRoomRecordCutArchive.read,cutDispose=PhysicalRoomRecordCutArchive.prototype.dispose,capture=RichAssetStore.prototype.captureBackup,baseRead=RichAssetReconciledBase.read,baseVerify=RichAssetReconciledBase.prototype.verifySuccessor,baseDispose=RichAssetReconciledBase.prototype.dispose;
export async function inspectColdSelectedRoom<P extends SharedSelectionPolicy>(basis:SelectedRoomCurrentFile,resources:ColdSelectedResources,scope:PhysicalRecordCutVisit,reads:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[]):Promise<Readonly<{preview:ColdSelectedRoomPreview;data:SelectedAssetCurrentCut}>>{
 const check=()=>{resources.checkJob();scope.assets.check();},options={wasm:scope.wasm,checkAuthority:check,...(scope.signal?{signal:scope.signal}:{})};let admitted:SelectedRoomCurrentArchive|undefined,approved:RoomAssetApprovalArchive|undefined,first:PhysicalRoomRecordCutArchive|undefined,previous:PhysicalRoomRecordCutArchive|undefined,now:PhysicalRoomRecordCutArchive|undefined;
 try{check();const names=new Set(scope.assets.namespaces);if(names.has(resources.record.database)||names.has(resources.intentDatabase)||resources.record.participants.some(row=>names.has(row.targetDatabase)))throw fail('asset_adoption_policy');
  admitted=await source.read.call(SelectedRoomCurrentArchive,basis.file,basis.selection,options);const approvedFile=source.approval.call(admitted);if(JSON.stringify(approvedFile.choice.adoption)!==JSON.stringify(resources.record))throw fail('asset_adoption_diverged');approved=await approval.read.call(RoomAssetApprovalArchive,approvedFile.file,approvedFile.selection,options);const original=approval.cut.call(approved),prior=source.current.call(admitted);
  first=await cutRead.call(PhysicalRoomRecordCutArchive,original.file,original.selection,options);previous=await cutRead.call(PhysicalRoomRecordCutArchive,prior.file,prior.selection,options);now=await cutRead.call(PhysicalRoomRecordCutArchive,scope.cut.file,scope.cut.selection,options);
  // Whole-cut identity is exact bytes/pins, never only current AST equality.
  if(JSON.stringify(original.selection)!==JSON.stringify(prior.selection))await verifySelectedRoomNativeContinuation(first,previous,reads,clients,check);
  if(JSON.stringify(prior.selection)!==JSON.stringify(scope.cut.selection))await verifySelectedRoomNativeContinuation(previous,now,reads,clients,check);
  const saved=await resources.owned.store!.readFresh(check,scope.signal);check();if(JSON.stringify(saved.record)!==JSON.stringify(resources.record)||saved.files.size!==resources.files.size||[...saved.files].some(([id,bytes])=>!sameAdoptionBytes(resources.files.get(id),bytes)))throw fail('asset_adoption_diverged');const uploads=[];
  for(const row of resources.record.participants){const bytes=resources.files.get(row.id),baseFile=approval.base.call(approved,row.id);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.base.bytes||await scope.assets.digest(new Blob([bytes]))!==row.base.sha256||await scope.assets.digest(baseFile)!==row.base.sha256)throw fail('asset_adoption_diverged');const target=resources.owned.targets.get(row.id);if(!target)throw fail('asset_adoption_missing');const current=await capture.call(target.store,()=>{check();return undefined;},scope.signal?{signal:scope.signal}:{});check();const base=await baseRead.call(RichAssetReconciledBase,baseFile,{limits:row.limits,...(scope.signal?{signal:scope.signal}:{})});
   try{await baseVerify.call(base,current.backup,{limits:row.limits,...(scope.signal?{signal:scope.signal}:{})});await verifySelectedUploadContinuation(source.upload.call(admitted,row.id),current.backup,row.limits,check,scope.signal);check();uploads.push(Object.freeze({id:row.id,database:row.targetDatabase,file:current.backup,sha256:await scope.assets.digest(current.backup)}));}finally{baseDispose.call(base);}
  }
  const data:SelectedAssetCurrentCut=Object.freeze({approval:approvedFile,root:scope.cut,uploads:Object.freeze(uploads)}),current=await encodeSelectedRoomCurrent(data,options);await scope.verify();check();return Object.freeze({data,preview:Object.freeze({choice:coldSelectedRoomChoice({format:'breditor/cold-selected-room-choice',formatVersion:1,basis:basis.selection,current:current.selection,intentDatabase:resources.intentDatabase}),current})});
 }finally{if(now)cutDispose.call(now);if(previous)cutDispose.call(previous);if(first)cutDispose.call(first);if(approved)approval.dispose.call(approved);if(admitted)source.dispose.call(admitted);}
}
