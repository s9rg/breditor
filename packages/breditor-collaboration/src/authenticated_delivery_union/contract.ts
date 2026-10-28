/** SDK-private fresh authentication plus actual native/packet union preparation. */
import type {SharedIndependentDeliveryUnionOptions,SharedIndependentDeliveryUnionPreparation} from '../independent_delivery_union/contract.js';
import type {OriginalReviewQuery,OriginalReviewRead} from '../original_review_authorizations/contract.js';
export type AuthenticatedDeliveryUnionOptions=Omit<SharedIndependentDeliveryUnionOptions,'authorizations'>&{readonly originalReview:OriginalReviewQuery};
export type AuthenticatedDeliveryUnionResult=
 |Readonly<{kind:'pending';originalReview:OriginalReviewRead}>
 |Readonly<{kind:'prepared';originalReview:OriginalReviewRead;preparation:SharedIndependentDeliveryUnionPreparation}>;
