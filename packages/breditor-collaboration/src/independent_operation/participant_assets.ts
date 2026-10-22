/** Genuine whole-upload ownership and original immutable-row conservation.
 * Legitimate retry counters may advance and new rows may be added; selected original bytes,
 * dimensions and acknowledged uploaded references may not disappear or change. */
import {RichAssetStore,RichAssetStoreCustody,readRichAssetBackup} from '@breditor/experimental-rich-content';
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {inspectUploads} from '../participant_recovery/inspect.js';
import {operationJournalFailure as fail} from './journal_failure.js';
const capture=RichAssetStore.prototype.captureBackup,open=RichAssetStore.openRetained,acquire=RichAssetStore.prototype.acquireRecoveryCustody,check=RichAssetStore.prototype.checkOpen;
export const operationUploadCustody=Object.freeze({check:RichAssetStoreCustody.prototype.check,release:RichAssetStoreCustody.prototype.release,close:RichAssetStoreCustody.prototype.close,closeStore:RichAssetStore.prototype.close});
export interface OperationUploadOwners {uploads?:RichAssetStore;uploadCustody?:RichAssetStoreCustody}
export function checkOperationUploads(owners:OperationUploadOwners):void{if(!owners.uploads||!owners.uploadCustody)throw fail('independent_operation_missing');check.call(owners.uploads);operationUploadCustody.check.call(owners.uploadCustody);}
export async function verifyOperationUploads(p:PreparedIndependentDeliveryRecovery,owners:OperationUploadOwners,current:()=>void):Promise<void>{
 const guard=()=>{current();checkOperationUploads(owners);};guard();const cut=await capture.call(owners.uploads!,()=>{guard();return undefined;},p.options.signal?{signal:p.options.signal}:{});guard();
 const file=await readRichAssetBackup(cut.backup,{limits:p.options.limits,...(p.options.signal?{signal:p.options.signal}:{})});
 try{guard();const rows=new Map(file.entries().map(row=>[row.asset,row]));for(const before of archive.uploadEntries.call(p.backup)){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw fail('independent_operation_uploads_diverged');}guard();}finally{file.dispose();}
}
export async function openOperationUploads(p:PreparedIndependentDeliveryRecovery,owners:OperationUploadOwners):Promise<void>{
 p.guard();if(await inspectUploads(p.options.destinations.uploads)==='missing')throw fail('independent_operation_missing');p.guard();owners.uploads=await open.call(RichAssetStore,p.options.destinations.uploads,{limits:p.options.limits});p.guard();owners.uploadCustody=await acquire.call(owners.uploads);p.guard();await verifyOperationUploads(p,owners,p.guard);
}
