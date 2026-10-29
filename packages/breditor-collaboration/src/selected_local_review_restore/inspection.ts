/** Complete original/current native and asset ancestry, exact three local
 * source pairs/versions/receipts and genuine authenticated full server path.
 * No destination presence, shared ancestor or equal text substitutes for this. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {localJson,localSnapshot,equal,fail} from '../selected_local_review_delivery/policy.js';
import {admitLocalReviewRoomSource} from '../selected_local_review_delivery/bundle_native.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {localReviewRestoreInput} from './input.js';
export async function inspectLocalReviewRestoreBundle(scope:SelectedNativeRecoveryScope,input:ReturnType<typeof localReviewRestoreInput>,guard:()=>void){
 guard();input.native.check();const base=input.baseline.selection.continuation,path=input.path.selection;
 if(!equal(path.current,input.baseline.selection)||!equal(base.previous,input.bundle.prepared.choice.server.source.server)||!equal(base.current.origin,input.bundle.prepared.choice.server.source.origin)||!equal(input.native.source,base.current.server)||!equal(input.native.participants,base.current.participants)||!path.path.ancestors.some(row=>equal(row,base.previous)))throw fail();
 await input.path.check(scope.signal);const actual=await scope.retainExtendingAll([{file:input.bundle.prepared.file,selection:input.choice.before},input.bundle.current]),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:guard,signal:scope.signal});
 if(input.bundle.delivery.file.size!==input.bundle.delivery.bytes||await integrity.digest(input.bundle.delivery.file)!==input.bundle.delivery.sha256)throw fail();const text=await input.bundle.delivery.file.text(),snapshot=await localSnapshot(JSON.parse(text),input.choice);if(localJson(snapshot)!==text)throw fail();
 await admitLocalReviewRoomSource(scope,input.bundle.prepared.file,input.choice.before,snapshot.before,guard);await admitLocalReviewRoomSource(scope,input.bundle.current.file,input.bundle.current.selection,snapshot.current,guard);
 await scope.readDeliveryReconciliation(input.host,input.native.reader);input.native.check();await input.path.check(scope.signal);if(!equal((await scope.retainCurrent()).current.selection,actual.current.selection))throw fail();guard();return{actual,snapshot};
}
