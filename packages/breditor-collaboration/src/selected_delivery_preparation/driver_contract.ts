/** SDK-private genuine preparation ownership, not callback-shaped custody. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import type {NativeRelayDelivery} from '../relay/native_delivery.js';
import type {SharedReviewAccess} from '../review_types.js';
import type {DeliveryPreparationFile} from './contract.js';
export interface PreparedDeliveryDriver{
 readonly scope:SelectedNativeRecoveryScope;readonly prepared:DeliveryPreparationFile;
 check():void;create(source:RetainedDeliverySource,ceiling:SharedReviewAccess,restrict:()=>void):NativeRelayDelivery;
 /** Refuse new contexts synchronously, then drain all ACTUAL old contexts
  * before the callback. Existing work tickets remain real until they finish. */
 quiesce<T>(visit:()=>Promise<T>):Promise<T>;
 close():Promise<void>;
}
