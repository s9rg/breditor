/** One genuine recipient imports ORIGINAL accepted document/review input.
 * No own offline packet is acknowledged, no current role changes, and unbound
 * local comments stay unbound. Pending native dependencies never count as ACK. */
import {SelectedNativeImportArchive} from '../selected_native_import/archive.js';
import {reviewSource,sameReceipt} from '../relay/review_validation.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import type {SelectedNativeCutParticipant} from '../selected_room_reconciliation/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {fail} from './policy.js';
const manifest=SelectedNativeImportArchive.prototype.manifest,read=SelectedNativeImportArchive.prototype.readPage;
export async function importExecutionClient(scope:SelectedNativeRecoveryScope,client:RetainedNativeClient,binding:SelectedNativeCutParticipant['review'],archive:SelectedNativeImportArchive,integrity:SharedArchiveIntegrityOptions):Promise<void>{for(const[index]of manifest.call(archive).pages.entries()){integrity.checkAuthority();const page=await read.call(archive,index,integrity);scope.check();if(page.documentFrame!==null)scope.native.receiveDocument(client.core,page.documentFrame);if(binding.kind==='bound'&&page.review){if(binding.binding!==page.review.descriptor.binding)throw fail();for(const batch of page.review.batches){const source=reviewSource(batch.source),outcome=scope.native.receiveReview(client.core,batch.frame,source);if(outcome.kind!=='applied'&&outcome.kind!=='unchanged'||!sameReceipt(client.core.retainedReviewReceipt(batch.frame,source),batch.receipt))throw fail();}}integrity.checkAuthority();}}
