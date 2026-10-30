/** Retained native-parent liveness, separate from ordinary recovery handoff
 * and metadata editing permission. Original recovery entry points keep their
 * existing checkManagedRecoveryOwners behavior. */
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {managedSourceCore,checkManagedSource} from '../managed_custody.js';
import {checkRetainedVersionCatalog} from '../versions/retained_source.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RecoveryOwners} from './components.js';
import {recoveryFailure} from './errors.js';
const checkUploads=RichAssetStore.prototype.checkOpen;
export function checkRetainedRecoveryOwners<P extends SharedSelectionPolicy>(owners:RecoveryOwners<P>):void{
 if(!owners.session||!owners.uploads)throw recoveryFailure('recovery_missing');
 const core=managedSourceCore(owners.session);checkManagedSource(owners.session,core);
 for(const owner of [owners.suggestions,owners.revisions])if(owner)checkManagedSource(owner,core);
 if(owners.versions)checkRetainedVersionCatalog(owners.versions,core);
 checkUploads.call(owners.uploads);
}
