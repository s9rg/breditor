/** Internal actual-source delivery operations. A storage-family codec or account grant is not inferred. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewPolicy} from '../review_types.js';
import type {SharedReviewRelayProgress} from './review_types.js';
import type {SharedSegmentedRelayBinding,SharedSegmentedRelayProgress,SharedSegmentedDocumentProgress,SharedSegmentedReviewReceipt} from '../segmented_relay/contract.js';
export interface DurableRelaySourcePort {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;readonly binding:SharedSegmentedRelayBinding;
 check():void;save():void;flush():Promise<void>;durable():SharedSegmentedRelayProgress;
 /** A current host may limit native comment access below the authenticated role. */
 reviewAccess?(granted:SharedReviewPolicy['access']):SharedReviewPolicy['access'];
 persistDocument(progress:SharedSegmentedDocumentProgress):Promise<void>;
 persistReview(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>;
 track(adapter:{dispose():void}):void;
}
