/** Restore DATA into absent namespaces, or accept byte-identical partial
 * copies after a fresh decision. This never creates/revives a delivery gate.
 * Normal resume separately authenticates and requires fresh current approval. */
import {checkSelectedNativeDeliveryScope,retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {localJson,localSnapshot,equal,fail} from '../selected_local_review_delivery/policy.js';
import {localReviewRestoreInput} from './input.js';
import {localReviewRestoreChoice} from './identity.js';
import {inspectLocalReviewRestoreBundle} from './inspection.js';
import {LocalReviewRestoreResources} from './resources.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {LocalReviewRestoreInput,LocalReviewRestoreInspectionInput,LocalReviewRestoreChoice,LocalReviewRestoreResult} from './contract.js';
const methods={reserve:LocalReviewRestoreResources.prototype.reserve,inspect:LocalReviewRestoreResources.prototype.inspect,restore:LocalReviewRestoreResources.prototype.restore,close:LocalReviewRestoreResources.prototype.close},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
async function operate(scope:SelectedNativeRecoveryScope,provided:LocalReviewRestoreInput|LocalReviewRestoreInspectionInput,restore:boolean):Promise<LocalReviewRestoreChoice>{
 const input=localReviewRestoreInput(scope,provided,restore);let resources:LocalReviewRestoreResources|undefined;const guard=()=>{checkSelectedNativeDeliveryScope(scope);input.authority();resources?.check();checkSelectedNativeDeliveryScope(scope);};
 try{guard();const actual=await scope.retainCurrent(),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:guard,signal:scope.signal});if(input.bundle.delivery.file.size!==input.bundle.delivery.bytes||await integrity.digest(input.bundle.delivery.file)!==input.bundle.delivery.sha256)throw fail();const text=await input.bundle.delivery.file.text(),snapshot=await localSnapshot(JSON.parse(text),input.choice);if(localJson(snapshot)!==text)throw fail();
  resources=new LocalReviewRestoreResources(input.bundle.prepared,input.choice,snapshot,{wasm:actual.integrity.wasm,checkAuthority:()=>{checkSelectedNativeDeliveryScope(scope);input.authority();checkSelectedNativeDeliveryScope(scope);},signal:scope.signal});const held=resources;retainSelectedNativeDeliveryResource(scope,Object.freeze({check:guard,close:()=>methods.close.call(held)}));await methods.reserve.call(resources);
  const inspect=async()=>{const read=await inspectLocalReviewRestoreBundle(scope,input,guard),destinations=await methods.inspect.call(resources!);guard();return localReviewRestoreChoice({format:'breditor/selected-local-review-data-restore',formatVersion:1,prepared:input.bundle.prepared.choice,delivery:input.choice,bundle:{current:input.bundle.current.selection,bytes:input.bundle.delivery.bytes,sha256:input.bundle.delivery.sha256},destinations,current:read.actual.current.selection,path:input.path.selection});};
  const before=await inspect();if(!restore)return before;if(!equal(before,input.expected))throw fail('local_review_restore_stale');
  await decideFreshAssetChoice(input.expected!,input.approve,{check:guard,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});
  if(!equal(await inspect(),input.expected))throw fail('local_review_restore_stale');await methods.restore.call(resources,input.expected!.destinations);
  input.native.check();await input.path.check(scope.signal);if(!equal((await scope.retainCurrent()).current.selection,before.current))throw fail();guard();return before;
 }finally{if(resources)await methods.close.call(resources);}
}
export function previewSelectedLocalReviewRestore(scope:SelectedNativeRecoveryScope,input:LocalReviewRestoreInspectionInput):Promise<LocalReviewRestoreChoice>{return operate(scope,input,false);}
export async function restoreSelectedLocalReviewData(scope:SelectedNativeRecoveryScope,input:LocalReviewRestoreInput):Promise<LocalReviewRestoreResult>{const choice=await operate(scope,input,true);return Object.freeze({format:'breditor/selected-local-review-data-restored',formatVersion:1,choice});}
