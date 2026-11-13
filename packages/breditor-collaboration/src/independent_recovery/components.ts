/** Genuine local native source plus held whole uploads. Original archive bytes
 * stay with the coordinator; pixels outside uploads never disappear at handoff. */
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {withIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {inspectUploads} from '../participant_recovery/inspect.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {independentRecoveryArchive as archive} from './archive.js';
import {independentRecoverySource as sourceRead} from './source.js';
import {inspectIndependentDestination} from './destination.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentRecovery} from './prepare.js';
import {independentRecoveryFailure as fail} from './policy.js';
const openSource=Session.open,restoreSource=Session.restoreRecovery,closeSource=Session.prototype.close,discardSource=Session.prototype.discardAndClose;
const openUploads=RichAssetStore.openRetained,restoreUploads=RichAssetStore.restoreBackupHeld,exportUploads=RichAssetStore.prototype.exportBackup,checkUploads=RichAssetStore.prototype.checkOpen,closeUploads=RichAssetStore.prototype.close,acquireUploads=RichAssetStore.prototype.acquireRecoveryCustody,custodyCheck=RichAssetStoreCustody.prototype.check,custodyRelease=RichAssetStoreCustody.prototype.release,custodyClose=RichAssetStoreCustody.prototype.close;
export interface IndependentRecoveryOwners<P extends SharedSelectionPolicy>{session?:Session<P>;uploads?:RichAssetStore;uploadCustody?:RichAssetStoreCustody}
export function checkIndependentUploadCustody(owners:IndependentRecoveryOwners<SharedSelectionPolicy>):void{if(!owners.uploadCustody)throw fail('independent_recovery_missing');custodyCheck.call(owners.uploadCustody);}
/** Callback-free final release after all actual native/policy/source checks. */
export function releaseIndependentUploadCustody(owners:IndependentRecoveryOwners<SharedSelectionPolicy>):void{checkIndependentUploadCustody(owners);custodyRelease.call(owners.uploadCustody!);}
export function checkIndependentOwner<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>,owners:IndependentRecoveryOwners<P>):void{
 p.guard();if(!owners.session)throw fail('independent_recovery_missing');
 checkRecoveredIndependentSource(owners.session,p.backup,p.guard);
}
export function checkRecoveredIndependentSource<P extends SharedSelectionPolicy>(
 session:Session<P>,backup:PreparedIndependentRecovery['backup'],guard:()=>void,
):void{
 const port=independentHistoryNative(session);
 port.checkManaged();
 if(port.companion||native.view.call(port.core).readOnly!==true)throw fail('independent_recovery_policy');
 const source=sourceRead.capture({session});
 try{archive.verifySource.call(backup,source);guard();sourceRead.check(source);port.checkManaged();}
 finally{sourceRead.dispose(source);}
}
export async function restoreIndependentSource<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>,owners:IndependentRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const status=await inspectIndependentDestination(p);p.guard();if(complete&&status!=='exact')throw fail('independent_recovery_missing');const selected=withIndependentBootstrapPolicy(p.factory,p.guard,p.options.signal);
 owners.session=(status==='exact'?await openSource.call(Session,selected):await restoreSource.call(Session,selected,p.recovery,'host-reacquired')) as Session<P>;
 p.guard();checkIndependentOwner(p,owners);if(await inspectIndependentDestination(p)!=='exact')throw fail('independent_recovery_diverged');p.guard();
}
export async function restoreIndependentUploads<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>,owners:IndependentRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const name=p.options.destinations.uploads,status=await inspectUploads(name);p.guard();if(complete&&status==='missing')throw fail('independent_recovery_missing');const options={limits:p.options.limits},file=archive.uploadBackup.call(p.backup);
 if(status==='retained'||complete){owners.uploads=await openUploads.call(RichAssetStore,name,options);p.guard();owners.uploadCustody=await acquireUploads.call(owners.uploads);}
 else{const held=await restoreUploads.call(RichAssetStore,name,file,{...options,uploadState:'preserve',checkAuthority:p.guard,...(p.options.signal?{signal:p.options.signal}:{})});owners.uploads=held.store;owners.uploadCustody=held.custody;}
 p.guard();checkIndependentUploadCustody(owners);const current=await exportUploads.call(owners.uploads,p.options.signal?{signal:p.options.signal}:{});p.guard();if(await independentParticipantDigest(current,p.options.signal)!==await independentParticipantDigest(file,p.options.signal))throw fail('independent_recovery_diverged');p.guard();checkUploads.call(owners.uploads);
}
export async function verifyIndependentOwners<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>,owners:IndependentRecoveryOwners<P>):Promise<void>{
 checkIndependentOwner(p,owners);if(!owners.session||!owners.uploads)throw fail('independent_recovery_missing');checkIndependentUploadCustody(owners);const source=sourceRead.capture({session:owners.session});
 try{await archive.verifyRecovered.call(p.backup,source,owners.uploads,p.options.signal?{signal:p.options.signal}:{});p.guard();sourceRead.check(source);independentHistoryNative(owners.session).checkManaged();checkUploads.call(owners.uploads);checkIndependentUploadCustody(owners);}finally{sourceRead.dispose(source);}
}
export async function closeIndependentOwners<P extends SharedSelectionPolicy>(owners:IndependentRecoveryOwners<P>,discard:boolean):Promise<void>{if(owners.session)await(discard?discardSource:closeSource).call(owners.session);if(owners.uploadCustody)await custodyClose.call(owners.uploadCustody);if(owners.uploads)closeUploads.call(owners.uploads);}
