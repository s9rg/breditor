/** Actual native/receipt admission and complete upload verification, not stored phase inference. */
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {deliveryRecoverySource as sourceRead} from './source.js';
import {inspectUploads} from '../participant_recovery/inspect.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentDeliveryRecovery} from './prepare.js';
import {deliveryRecoveryArchive as archive} from './archive.js';
import {inspectIndependentDeliveryDestination} from './destination.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';
const openSource=SharedIndependentDeliverySession.open,restoreSource=SharedIndependentDeliverySession.restoreRecovery,openUploads=RichAssetStore.openRetained,restoreUploads=RichAssetStore.restoreBackup,exportUploads=RichAssetStore.prototype.exportBackup,checkUploads=RichAssetStore.prototype.checkOpen,closeUploads=RichAssetStore.prototype.close,closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
const acquireUploads=RichAssetStore.prototype.acquireRecoveryCustody,custodyCheck=RichAssetStoreCustody.prototype.check,custodyRelease=RichAssetStoreCustody.prototype.release,custodyClose=RichAssetStoreCustody.prototype.close;
export interface IndependentDeliveryRecoveryOwners<P extends SharedSelectionPolicy>{session?:SharedIndependentDeliverySession<P>;uploads?:RichAssetStore;uploadCustody?:RichAssetStoreCustody}
export function checkIndependentDeliveryUploadCustody(owners:IndependentDeliveryRecoveryOwners<SharedSelectionPolicy>):void{if(!owners.uploadCustody)throw fail('independent_delivery_recovery_missing');custodyCheck.call(owners.uploadCustody);}
/** Final synchronous no-await barrier only, after all actual native/source/current-policy checks. */
export function releaseIndependentDeliveryUploadCustody(owners:IndependentDeliveryRecoveryOwners<SharedSelectionPolicy>):void{checkIndependentDeliveryUploadCustody(owners);custodyRelease.call(owners.uploadCustody!);}
export function checkIndependentDeliveryOwner<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:IndependentDeliveryRecoveryOwners<P>):void{
 p.guard();if(!owners.session)throw fail('independent_delivery_recovery_missing');const port=independentDeliverySessionPort(owners.session);if(native.view.call(port.core).readOnly!==true)throw fail('independent_delivery_recovery_policy');
 const source=sourceRead.capture({session:owners.session});try{archive.verifySource.call(p.backup,source);p.guard();sourceRead.check(source);port.check();}finally{sourceRead.dispose(source);}
}
export async function restoreIndependentDeliverySource<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:IndependentDeliveryRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const status=await inspectIndependentDeliveryDestination(p);p.guard();if(complete&&status!=='exact')throw fail('independent_delivery_recovery_missing');
 owners.session=(status==='exact'?await openSource.call(SharedIndependentDeliverySession,p.factory):await restoreSource.call(SharedIndependentDeliverySession,{...p.factory,recovery:p.recovery,writerRecovery:'host-reacquired'})) as SharedIndependentDeliverySession<P>;
 p.guard();checkIndependentDeliveryOwner(p,owners);if(await inspectIndependentDeliveryDestination(p)!=='exact')throw fail('independent_delivery_recovery_diverged');p.guard();
}
export async function restoreIndependentDeliveryUploads<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:IndependentDeliveryRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const name=p.options.destinations.uploads,status=await inspectUploads(name);p.guard();if(complete&&status==='missing')throw fail('independent_delivery_recovery_missing');const opts={limits:p.options.limits},file=archive.uploadBackup.call(p.backup);
 owners.uploads=status==='retained'||complete?await openUploads.call(RichAssetStore,name,opts):await restoreUploads.call(RichAssetStore,name,file,{...opts,uploadState:'preserve',...(p.options.signal?{signal:p.options.signal}:{})});p.guard();
 owners.uploadCustody=await acquireUploads.call(owners.uploads);p.guard();checkIndependentDeliveryUploadCustody(owners);
 const current=await exportUploads.call(owners.uploads,p.options.signal?{signal:p.options.signal}:{});p.guard();if(await independentDeliveryParticipantDigest(current,p.options.signal)!==await independentDeliveryParticipantDigest(file,p.options.signal))throw fail('independent_delivery_recovery_diverged');p.guard();checkUploads.call(owners.uploads);
}
export async function verifyIndependentDeliveryOwners<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:IndependentDeliveryRecoveryOwners<P>):Promise<void>{
 checkIndependentDeliveryOwner(p,owners);if(!owners.uploads||!owners.session)throw fail('independent_delivery_recovery_missing');checkIndependentDeliveryUploadCustody(owners);const source=sourceRead.capture({session:owners.session});
 try{await archive.verifyRecovered.call(p.backup,source,owners.uploads,p.options.signal?{signal:p.options.signal}:{});p.guard();sourceRead.check(source);independentDeliverySessionPort(owners.session).check();checkUploads.call(owners.uploads);checkIndependentDeliveryUploadCustody(owners);}finally{sourceRead.dispose(source);}
}
export async function closeIndependentDeliveryOwners<P extends SharedSelectionPolicy>(owners:IndependentDeliveryRecoveryOwners<P>,discard:boolean):Promise<void>{if(owners.session)await(discard?discardSource:closeSource).call(owners.session);if(owners.uploadCustody)await custodyClose.call(owners.uploadCustody);if(owners.uploads)closeUploads.call(owners.uploads);}
