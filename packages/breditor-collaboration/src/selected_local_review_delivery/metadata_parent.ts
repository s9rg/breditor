/** Private child of a genuinely opened local-review delivery owner. It shares
 * that owner's one prepared gate and the exact original local source objects.
 * No saved choice, structural copy, callback or second gate supplies this port. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {SharedReviewAccess} from '../review_types.js';
import type {NativeRelayDelivery} from '../relay/native_delivery.js';
import type {LocalReviewDeliveryChoice,LocalReviewDeliveryState,LocalReviewRoomBundle} from './contract.js';
export interface LocalReviewMetadataParent {
 readonly scope:SelectedNativeRecoveryScope;
 readonly choice:LocalReviewDeliveryChoice;
 readonly sources:readonly RetainedDeliveryClient[];
 check():void;
 /** Pin one explicit metadata choice before any new namespace can be written.
  * Later captures must include it; closing a child never removes that fact. */
 bind(choiceSha256:string):void;
 /** Admit a literal parent bundle against this owner's actual stored review
  * head and full native continuation. This grants no new gate or actor. */
 admit(bundle:LocalReviewRoomBundle):Promise<void>;
 /** Activation-only exact current root and receipt file, without advancing journals. */
 assertExact(bundle:LocalReviewRoomBundle):Promise<void>;
 /** Actual serial source saves plus the parent's genuine review receipts. */
 saved():Promise<LocalReviewDeliveryState['lanes']>;
 createDelivery(source:RetainedDeliverySource,ceiling:SharedReviewAccess):NativeRelayDelivery;
 /** Drain actual adapters and retain the parent's complete room/binding data.
  * Only the coupled child may call this while metadata is enlisted. */
 capture(visit:(bundle:LocalReviewRoomBundle,integrity:SharedArchiveIntegrityOptions)=>Promise<void>):Promise<LocalReviewRoomBundle>;
 /** Quiesce the genuine adapters for a finite read without advancing review
  * or metadata journals. A refused portable claim does not retire the parent. */
 inspect(visit:(integrity:SharedArchiveIntegrityOptions)=>Promise<void>):Promise<void>;
 install(stop:()=>void,wait:()=>Promise<void>):void;
 release():void;
}
