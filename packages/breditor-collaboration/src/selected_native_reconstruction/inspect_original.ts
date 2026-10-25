/** Compare an actual held cohort with complete retained data before proposing
 * an original-source reconstruction. This performs no native import, store
 * creation, source retirement or activation. Nonlinear work needs a real merge.
 *
 * Native ancestry covers every selected member, not only the proposed original
 * participant. Independent original packet/progress records must currently be
 * equal: archiving a competing record is not a substitute for merging its work.
 */
import {withSelectedNativeRecovery,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {buildOriginalReconstructionRecipe} from './original_recipe.js';
import {fields,identifier,fail} from './policy.js';
type Options=Readonly<{id:string;retained:SelectedRoomCurrentFile;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>;
const file=Loaded.prototype.file,cut=Loaded.prototype.nativeCut,approval=Loaded.prototype.approval,records=Loaded.prototype.records,upload=Loaded.prototype.selectedUploads,dispose=Loaded.prototype.dispose,read=Loaded.read;
export function inspectOriginalNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:Options){
 // Detach callable leaves and bounded plain configuration before any await.
 // No permission callback, factory, I/O or native operation runs here.
 const chosen=snapshotPhysicalHistoryReadOptions(provided),raw=fields(options,['id','retained'],['assets','resolveAsset']),id=identifier(raw['id']),input=fields(raw['retained'],['selection','file']),retained={selection:selectedRoomCurrentSelection(input['selection']),file:archiveBlob(input['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)},assetOptions=raw['assets']===undefined?undefined:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,assets=assetOptions===undefined?undefined:{limits:checkRichAssetLimits(assetOptions.limits),...(assetOptions.signal?{signal:assetOptions.signal}:{})},resolveAsset=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 if(resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('native_reconstruction_policy');
 return withSelectedNativeRecovery(owner,chosen,async scope=>{
  let before:Loaded|undefined,after:Loaded|undefined;
  try{
   const actual=await scope.retainCurrent();scope.check();before=await read.call(Loaded,actual.current,actual.integrity);after=await read.call(Loaded,retained,actual.integrity);scope.check();
   const a=approval.call(before),b=approval.call(after);if(JSON.stringify(a.selection)!==JSON.stringify(b.selection)||JSON.stringify(a.choice)!==JSON.stringify(b.choice))throw fail();
   const entry=after.participant(id),member=scope.clients.find(row=>row.id===id),factory=chosen.reads.find(row=>row.id===id);if(entry.family!=='original'||member?.family!=='original'||!factory)throw fail('native_reconstruction_policy');
   await verifySelectedRoomNativeContinuation(cut.call(before),cut.call(after),chosen,scope.clients,scope.check);
   for(const row of a.choice.adoption.participants){await verifySelectedUploadContinuation(upload.call(before,row.id),upload.call(after,row.id),row.limits,scope.check,scope.signal);scope.check();}
   const left=recordLiveBasis('original',await records.call(before,id)) as readonly {kind:string;json:string}[],right=recordLiveBasis('original',await records.call(after,id)) as typeof left;
   const beforeSource=fields(await records.call(before,id),['parent','source'])['source'] as Record<string,unknown>,afterSource=fields(await records.call(after,id),['parent','source'])['source'] as Record<string,unknown>;
   for(const key of ['versions','suggestions','revisions'])if(JSON.stringify(beforeSource[key])!==JSON.stringify(afterSource[key]))throw fail('native_reconstruction_requires_merge');
   if(JSON.stringify(left.filter(row=>row.kind!=='document'&&row.kind!=='paired-session'))!==JSON.stringify(right.filter(row=>row.kind!=='document'&&row.kind!=='paired-session')))throw fail('native_reconstruction_requires_merge');
   const paired=(rows:typeof left)=>{const selected=rows.find(row=>row.kind==='paired-session');if(!selected)return null;const {documentCheckpointJson,reviewCheckpointJson,versions,...rest}=JSON.parse(selected.json);return rest;};
   if(JSON.stringify(paired(left))!==JSON.stringify(paired(right)))throw fail('native_reconstruction_requires_merge');
   const recipe=await buildOriginalReconstructionRecipe(after,{id,read:factory.read as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>,descriptor:JSON.stringify(sourceNativeRecoveryRead(member.core).descriptor()),...(assets===undefined?{}:{assets}),...(resolveAsset===undefined?{}:{resolveAsset})});scope.check();
   return Object.freeze({format:'breditor/original-native-reconstruction-inspection' as const,formatVersion:1 as const,scope:'held-current-versus-retained-data-only' as const,before:file.call(before),retained:file.call(after),recipe});
  }finally{if(after)dispose.call(after);if(before)dispose.call(before);}
 });
}
