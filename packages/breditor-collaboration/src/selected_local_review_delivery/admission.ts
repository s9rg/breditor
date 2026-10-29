/** SDK-private genuine owner ports. Neither a saved binding nor callbacks supplied
 * by an application are admitted as local persistence or a native delivery owner. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import type {SessionReviewIO} from '../delivery_source/io.js';
import type {SharedSegmentedReviewReceipt} from '../segmented_relay/contract.js';
import type {SharedReviewRelayProgress} from '../relay/review_types.js';
import {fail} from './error.js';
export interface LocalReviewIO extends SessionReviewIO {receipt():SharedSegmentedReviewReceipt|null;persist(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>}
const owners=new WeakMap<object,Readonly<{scope:SelectedNativeRecoveryScope;select(source:RetainedDeliverySource):LocalReviewIO}>>();
export function registerLocalReviewDelivery(owner:object,scope:SelectedNativeRecoveryScope,select:(source:RetainedDeliverySource)=>LocalReviewIO):void{if(owners.has(owner))throw fail('local_review_delivery_policy');owners.set(owner,Object.freeze({scope,select}));}
export function localReviewDeliveryIO(owner:object,scope:SelectedNativeRecoveryScope,source:RetainedDeliverySource):LocalReviewIO{const held=owners.get(owner);if(!held||held.scope!==scope)throw fail('local_review_delivery_policy');return held.select(source);}
