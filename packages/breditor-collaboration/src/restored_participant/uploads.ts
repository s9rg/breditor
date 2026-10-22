/** Actual complete upload owner. New imports acquire real custody before insertion;
 * resumes admit exact started bytes or conserved operational descendants, never merge. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetArchive,readRichAssetBackup} from '@breditor/experimental-rich-content';
import {inspectUploads} from '../participant_recovery/inspect.js';
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import type {RestoredOperationInput} from '../restored_operation/input.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
const restore=RichAssetStore.restoreBackupHeld,open=RichAssetStore.openRetained,acquire=RichAssetStore.prototype.acquireRecoveryCustody,capture=RichAssetStore.prototype.captureBackup,checkStore=RichAssetStore.prototype.checkOpen,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
export const restoredUploadCustody=Object.freeze({check:RichAssetStoreCustody.prototype.check,release:RichAssetStoreCustody.prototype.release,close:RichAssetStoreCustody.prototype.close,closeStore:RichAssetStore.prototype.close});
export interface RestoredUploadOwners {store?:RichAssetStore;custody?:RichAssetStoreCustody}
export function checkRestoredUploads(owners:RestoredUploadOwners):void{if(!owners.store||!owners.custody)throw fail('restored_participant_uploads');checkStore.call(owners.store);restoredUploadCustody.check.call(owners.custody);}
export async function verifyRestoredUploads(input:RestoredOperationInput,owners:RestoredUploadOwners,exact:boolean,current:()=>void):Promise<void>{
 const check=()=>{current();checkRestoredUploads(owners);};check();const saved=await capture.call(owners.store!,()=>{check();return undefined;},input.options.signal?{signal:input.options.signal}:{});check();
 if(exact){if(await digest(saved.backup,input.options.signal)!==await digest(input.uploads,input.options.signal))throw fail('restored_participant_uploads_diverged');check();return;}
 const archive=await readRichAssetBackup(saved.backup,{limits:input.options.limits,...(input.options.signal?{signal:input.options.signal}:{})});
 try{check();const rows=new Map(entries.call(archive).map(row=>[row.asset,row]));for(const before of input.uploadEntries){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw fail('restored_participant_uploads_diverged');}check();}finally{dispose.call(archive);}
}
export async function openRestoredUploads(input:RestoredOperationInput,owners:RestoredUploadOwners,name:string,complete:boolean,current:()=>void):Promise<void>{
 current();if(owners.store){checkStore.call(owners.store);if(!owners.custody)owners.custody=await acquire.call(owners.store);current();checkRestoredUploads(owners);await verifyRestoredUploads(input,owners,!complete,current);return;}
 const state=await inspectUploads(name);current();if(complete&&state==='missing')throw fail('restored_participant_uploads_missing');
 if(!complete&&(state==='missing'||state==='empty')){const held=await restore.call(RichAssetStore,name,input.uploads,{uploadState:'preserve',checkAuthority:current,limits:input.options.limits,...(input.options.signal?{signal:input.options.signal}:{})});owners.store=held.store;owners.custody=held.custody;}
 else{owners.store=await open.call(RichAssetStore,name,{limits:input.options.limits});current();owners.custody=await acquire.call(owners.store);}
 current();await verifyRestoredUploads(input,owners,!complete,current);
}
export async function closeRestoredUploads(owners:RestoredUploadOwners):Promise<void>{if(owners.custody)await restoredUploadCustody.close.call(owners.custody);if(owners.store)restoredUploadCustody.closeStore.call(owners.store);}
