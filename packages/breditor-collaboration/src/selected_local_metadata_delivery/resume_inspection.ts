/** Read/admit complete multipart data plus the genuine current stored head.
 * No transport starts and no existing record is rewritten by inspection. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {LocalReviewMetadataParent} from '../selected_local_review_delivery/metadata_parent.js';
import type {LocalMetadataDeliveryChoice,LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from './contract.js';
import {localSnapshot} from '../selected_local_review_delivery/policy.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {metadataSnapshot,metadataJson,equal,fail} from './policy.js';
import {metadataResumeChoice,selectMetadataStored} from './resume_policy.js';
import {admitMetadataContinuation} from './native_continuation.js';
export async function readMetadataBundle(parent:LocalReviewMetadataParent,bundle:LocalMetadataRoomBundle,choice:LocalMetadataDeliveryChoice,check:()=>void):Promise<LocalMetadataDeliverySnapshot>{
 check();if(!equal(parent.choice,choice.parent)||bundle.metadata.file.size!==bundle.metadata.bytes)throw fail();const actual=await parent.scope.retainCurrent(),integrity=prepareArchiveIntegrity({wasm:actual.integrity.wasm,checkAuthority:check,signal:parent.scope.signal});if(await integrity.digest(bundle.metadata.file)!==bundle.metadata.sha256)throw fail();const text=await Blob.prototype.text.call(bundle.metadata.file);check();if(await segmentedDigest(text)!==bundle.metadata.sha256)throw fail();check();const portable=await metadataSnapshot(JSON.parse(text),choice);if(metadataJson(portable)!==text)throw fail();
 const review=bundle.parent.delivery;if(review.file.size!==review.bytes||await integrity.digest(review.file)!==review.sha256)throw fail();const rtext=await Blob.prototype.text.call(review.file);check();if(await segmentedDigest(rtext)!==review.sha256)throw fail();const parsed=await localSnapshot(JSON.parse(rtext),choice.parent);check();
 if(!equal(parsed.current.lanes,portable.current.lanes.map(({id,source,relay})=>({id,source,relay}))))throw fail('local_metadata_delivery_parent_mismatch');
 await parent.admit(bundle.parent);check();return portable;
}
export async function inspectMetadataResume(parent:LocalReviewMetadataParent,bundle:LocalMetadataRoomBundle,portable:LocalMetadataDeliverySnapshot,stored:LocalMetadataDeliverySnapshot,check:()=>void){
 check();await admitMetadataContinuation(parent,bundle,portable,stored,check);check();const selection=await selectMetadataStored(stored);check();return metadataResumeChoice({format:'breditor/selected-local-metadata-resume',formatVersion:1,delivery:portable.current.choice,bundle:{prepared:bundle.parent.prepared.choice,current:bundle.parent.current.selection,review:{bytes:bundle.parent.delivery.bytes,sha256:bundle.parent.delivery.sha256},metadata:{bytes:bundle.metadata.bytes,sha256:bundle.metadata.sha256}},stored:selection});
}
