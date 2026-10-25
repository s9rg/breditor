/** SDK-private editable cold resume from complete independently pinned data and
 * genuinely reopened parents. This is not provider/registered-stream closure,
 * authenticated server activation or cross-device writer fencing. */
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {PhysicalRoomClientOperationV3,withPhysicalOperationV3FreshRetainedNative,transferPhysicalOperationV3RetainedRoot,checkUnconsumedPhysicalRoot} from '../physical_room_operation_v3/operation.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import type {RetainedNativeReadBorrow} from '../complete_operation_cohort/retained_native_read.js';
import type {SharedSelectionPolicy} from '../types.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {prepareSelectedAssetOwner,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fields,database,fail} from '../physical_room_asset_adoption/policy.js';
import {sameAdoptionBytes} from '../physical_room_asset_adoption/storage.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {coldSelectedRoomChoice} from './choice.js';
import {ColdSelectedResources} from './resources.js';
import {inspectColdSelectedRoom} from './inspect.js';
import {ColdSelectedIntentStore,coldSelectedIntentRecord} from './intent_store.js';
import type {ColdSelectedRoomPreview,ColdSelectedRoomPreviewOptions,ColdSelectedRoomResumeOptions} from './contract.js';
const selected=SelectedRoomCurrentArchive.prototype.selection,file=SelectedRoomCurrentArchive.prototype.file,approval=SelectedRoomCurrentArchive.prototype.approval;
const abandonResources=ColdSelectedResources.prototype.abandon,commitResources=ColdSelectedResources.prototype.commit,openIntent=ColdSelectedIntentStore.prototype.open,verifyIntent=ColdSelectedIntentStore.prototype.verifyFresh,closeIntent=ColdSelectedIntentStore.prototype.close;
const captureTarget=RichAssetStore.prototype.captureBackup;
function snapshot<P extends SharedSelectionPolicy>(root:PhysicalRoomClientOperationV3,archive:SelectedRoomCurrentArchive,input:ColdSelectedRoomPreviewOptions<P>|ColdSelectedRoomResumeOptions<P>,resume:boolean){
 checkUnconsumedPhysicalRoot(root);const raw=fields(input,['reads','checkAuthority',...(resume?['expected','approve','checkAssetAuthority']:['expectedBasis','intentDatabase'])],['signal']),reads=snapshotPhysicalHistoryReadOptions({reads:raw['reads'] as typeof input.reads,checkAuthority:raw['checkAuthority'] as ()=>void,...(raw['signal']!==undefined?{signal:raw['signal'] as AbortSignal}:{})}),expected=resume?coldSelectedRoomChoice(raw['expected']):undefined,basisSelection=selectedRoomCurrentSelection(resume?expected!.basis:raw['expectedBasis']);
 if(JSON.stringify(selected.call(archive))!==JSON.stringify(basisSelection))throw fail('asset_adoption_diverged');const basis:SelectedRoomCurrentFile=Object.freeze({selection:basisSelection,file:new Blob([file.call(archive)])}),initial=approval.call(archive),intentDatabase=resume?expected!.intentDatabase:database(raw['intentDatabase']),resources=new ColdSelectedResources(initial.choice.adoption,intentDatabase,reads.signal),observation=new PhysicalOperationV3Cancellation(reads.signal),check=()=>{resources.checkJob();observation.check();reads.checkAuthority();resources.checkJob();observation.check();},wrapped={...reads,checkAuthority:check};
 return{raw,reads,wrapped,basis,resources,expected,observation};
}
/** Full preview DATA only. All reopenings are existing-only; every actual lock
 * acknowledgement is observed before return and no source owner is consumed. */
export async function previewColdSelectedRoom<P extends SharedSelectionPolicy>(root:PhysicalRoomClientOperationV3,archive:SelectedRoomCurrentArchive,input:ColdSelectedRoomPreviewOptions<P>):Promise<ColdSelectedRoomPreview>{
 const chosen=snapshot(root,archive,input,false);let loan:RetainedNativeReadBorrow|undefined,complete=false;
 try{const result=await withPhysicalOperationV3FreshRetainedNative(root,chosen.wrapped,async(scope,borrow)=>{loan=borrow;return(await inspectColdSelectedRoom(chosen.basis,chosen.resources,scope,chosen.reads,borrow.clients)).preview;},scope=>chosen.resources.prepare(scope));await loan!.close();loan=undefined;await abandonResources.call(chosen.resources);chosen.observation.check();checkUnconsumedPhysicalRoot(root);complete=true;return result;
 }finally{try{if(!complete){try{await loan?.close();}finally{await abandonResources.call(chosen.resources);}}}finally{chosen.observation.close();}}
}
/** The host must select the preview independently and approve THIS attempt.
 * Both full files commit durably before actual parents become an editable
 * owner. Retry still invokes a new decision; stored intent is never permission. */
export async function resumeColdSelectedRoom<P extends SharedSelectionPolicy>(root:PhysicalRoomClientOperationV3,archive:SelectedRoomCurrentArchive,input:ColdSelectedRoomResumeOptions<P>):Promise<RetainedSelectedAssetOwner>{
 const chosen=snapshot(root,archive,input,true);let complete=false;
 try{if(typeof chosen.raw['approve']!=='function')throw fail('asset_adoption_policy');const approve=chosen.raw['approve'] as typeof input.approve,assetAuthority=participantAuthority(chosen.raw['checkAssetAuthority'] as ()=>void);
  const owner=await transferPhysicalOperationV3RetainedRoot(root,chosen.wrapped,async(scope,native,clients)=>{
   const before=await inspectColdSelectedRoom(chosen.basis,chosen.resources,scope,chosen.reads,clients);if(JSON.stringify(before.preview.choice)!==JSON.stringify(chosen.expected))throw fail('asset_adoption_diverged');
   await decideFreshAssetChoice(before.preview.choice,approve,{check:()=>{chosen.resources.checkJob();scope.assets.check();},signal:scope.signal,watchClosing:scope.watchClosing});
   const after=await inspectColdSelectedRoom(chosen.basis,chosen.resources,scope,chosen.reads,clients);if(JSON.stringify(after.preview.choice)!==JSON.stringify(chosen.expected))throw fail('asset_adoption_diverged');
   const record=coldSelectedIntentRecord({format:'breditor/cold-selected-owner-intent',formatVersion:1,database:chosen.resources.intentDatabase,choice:after.preview.choice,basis:chosen.basis.file,current:after.preview.current.file}),intent=new ColdSelectedIntentStore(globalThis.indexedDB,chosen.resources.intentDatabase,record,chosen.resources.checkJob,scope.wasm,scope.signal);chosen.resources.owned.intent=Object.freeze({checkReadCurrent:intent.checkReadCurrent,verifyFresh:(check:()=>void,signal?:AbortSignal)=>verifyIntent.call(intent,check,signal),close:()=>closeIntent.call(intent)});const check=()=>{chosen.resources.checkJob();scope.assets.check();};await openIntent.call(intent,check);await verifyIntent.call(intent,check,scope.signal);await scope.verify();check();
   const basis={files:chosen.resources.files,resources:chosen.resources.owned,current:()=>{chosen.resources.checkLocal();intent.checkReadCurrent();},currentUploads:new Map(after.data.uploads.map(row=>[row.id,row.file]))},prepared=prepareSelectedAssetOwner(native,chosen.resources.record,basis,after.data.approval,assetAuthority);
   return{value:prepared.value,async verifyAfterRead(){
    const current=()=>{chosen.resources.checkJob();chosen.observation.check();chosen.reads.checkAuthority();chosen.resources.checkJob();chosen.observation.check();},context=prepareArchiveIntegrity({wasm:scope.wasm,checkAuthority:current}),saved=await chosen.resources.owned.store!.readFresh(current,chosen.reads.signal);current();
    if(JSON.stringify(saved.record)!==JSON.stringify(chosen.resources.record)||saved.files.size!==chosen.resources.files.size||[...saved.files].some(([id,bytes])=>!sameAdoptionBytes(chosen.resources.files.get(id),bytes)))throw fail('asset_adoption_diverged');await verifyIntent.call(intent,current,chosen.reads.signal);
    for(const row of after.data.uploads){const target=chosen.resources.owned.targets.get(row.id)!,captured=await captureTarget.call(target.store,()=>{current();return undefined;},chosen.reads.signal?{signal:chosen.reads.signal}:{});current();if(captured.backup.size!==row.file.size||await context.digest(captured.backup)!==row.sha256)throw fail('asset_adoption_diverged');}current();
   },checkCurrent(){chosen.resources.checkJob();chosen.observation.check();intent.checkReadCurrent();prepared.check();},consume(){commitResources.call(chosen.resources);prepared.activate();},abandon:()=>prepared.abandon()};
  },scope=>chosen.resources.prepare(scope));complete=true;return owner;
 }finally{try{if(!complete)await abandonResources.call(chosen.resources);}finally{chosen.observation.close();}}
}
