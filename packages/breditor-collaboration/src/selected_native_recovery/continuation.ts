/** Full retained input -> actual CURRENT source/native/upload ancestry while
 * the genuine owner, every facade and complete record readers remain held.
 * Equal ASTs never substitute for native lineage or complete packet records. */
import {SelectedRoomCurrentArchive,encodeSelectedRoomCurrent} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {fail,selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedNativeRetainedCurrent} from './contract.js';
import {fields,rows,MAX_ROOM_RECORD_CUT_BYTES} from '../physical_room_record_cut/policy.js';
const old={read:SelectedRoomCurrentArchive.read,approval:SelectedRoomCurrentArchive.prototype.approval,current:SelectedRoomCurrentArchive.prototype.current,manifest:SelectedRoomCurrentArchive.prototype.manifest,upload:SelectedRoomCurrentArchive.prototype.uploadFile,dispose:SelectedRoomCurrentArchive.prototype.dispose},cut={read:PhysicalRoomRecordCutArchive.read,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
async function verifyPrevious<P extends SharedSelectionPolicy>(provided:SelectedRoomCurrentFile,current:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,reads:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[],check:()=>void):Promise<void>{
 const previous=fields(provided,['file','selection']),options={wasm:scope.wasm,checkAuthority:check,...(scope.signal?{signal:scope.signal}:{})};let before:SelectedRoomCurrentArchive|undefined,left:PhysicalRoomRecordCutArchive|undefined,right:PhysicalRoomRecordCutArchive|undefined;
 try{check();before=await old.read.call(SelectedRoomCurrentArchive,previous['file'] as Blob,previous['selection'] as SelectedRoomCurrentFile['selection'],options);const approval=old.approval.call(before),manifest=old.manifest.call(before);if(JSON.stringify(approval.selection)!==JSON.stringify(current.approval.selection)||JSON.stringify(approval.choice)!==JSON.stringify(current.approval.choice))throw fail();const prior=old.current.call(before);
  if(JSON.stringify(prior.selection)!==JSON.stringify(current.root.selection)){left=await cut.read.call(PhysicalRoomRecordCutArchive,prior.file,prior.selection,options);right=await cut.read.call(PhysicalRoomRecordCutArchive,current.root.file,current.root.selection,options);await verifySelectedRoomNativeContinuation(left,right,reads,clients,check);}
  if(manifest.uploads.length!==current.uploads.length)throw fail();for(const row of current.uploads){const selected=manifest.uploads.find(value=>value.id===row.id),policy=current.approval.choice.adoption.participants.find(value=>value.id===row.id);if(!selected||!policy||selected.database!==row.database||policy.targetDatabase!==row.database)throw fail();await verifySelectedUploadContinuation(old.upload.call(before,row.id),row.file,policy.limits,check,scope.signal);check();}
 }finally{if(right)cut.dispose.call(right);if(left)cut.dispose.call(left);if(before)old.dispose.call(before);}
}
export function retainExtendingSelectedCurrent<P extends SharedSelectionPolicy>(previous:SelectedRoomCurrentFile,current:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,reads:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[],authorize:()=>void,held:()=>void):Promise<SelectedNativeRetainedCurrent>{return retainExtendingSelectedCurrents([previous],current,scope,reads,clients,authorize,held);}
/** All retained cuts compare against the SAME actual current source reservation.
 * This includes intermediate/resume cuts, not only a claimed final journal head. */
export async function retainExtendingSelectedCurrents<P extends SharedSelectionPolicy>(provided:readonly SelectedRoomCurrentFile[],current:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,reads:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[],authorize:()=>void,held:()=>void):Promise<SelectedNativeRetainedCurrent>{const files=rows(provided,4097).map(value=>{const row=fields(value,['file','selection']);return{file:archiveBlob(row['file'] as Blob,MAX_ROOM_RECORD_CUT_BYTES),selection:selectedRoomCurrentSelection(row['selection'])};});if(!files.length||files.reduce((sum,row)=>sum+row.file.size,0)>2*MAX_ROOM_RECORD_CUT_BYTES)throw fail('selected_current_budget');const check=()=>{authorize();held();scope.assets.check();};for(const file of files)await verifyPrevious(file,current,scope,reads,clients,check);const file=await encodeSelectedRoomCurrent(current,{wasm:scope.wasm,checkAuthority:check,...(scope.signal?{signal:scope.signal}:{})});check();return Object.freeze({current:file,integrity:Object.freeze({wasm:scope.wasm,checkAuthority:authorize,...(scope.signal?{signal:scope.signal}:{})})});}
