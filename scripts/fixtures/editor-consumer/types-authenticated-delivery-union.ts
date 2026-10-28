import type {SharedPhysicalRoomRecoveryHost} from '@breditor/collaboration';
import type {AuthenticatedDeliveryUnionOptions,AuthenticatedDeliveryUnionResult} from '../../../packages/breditor-collaboration/dist/authenticated_delivery_union/contract.js';
import {prepareAuthenticatedIndependentDeliveryUnion} from '../../../packages/breditor-collaboration/dist/authenticated_delivery_union/prepare.js';
import type {OriginalReviewQuery,OriginalReviewRead} from '../../../packages/breditor-collaboration/dist/original_review_authorizations/contract.js';
declare const host:SharedPhysicalRoomRecoveryHost, options:AuthenticatedDeliveryUnionOptions, read:OriginalReviewRead;
const result:Promise<AuthenticatedDeliveryUnionResult>=prepareAuthenticatedIndependentDeliveryUnion(host,options);
void result;
// @ts-expect-error Saved authentication DATA is not a genuine independently configured live host.
prepareAuthenticatedIndependentDeliveryUnion(read,options);
// @ts-expect-error Existing caller-supplied role windows cannot bypass fresh authentication.
prepareAuthenticatedIndependentDeliveryUnion(host,{...options,authorizations:[]});
// @ts-expect-error Canonical counters are strings, never coerced numbers.
const bad:OriginalReviewQuery={binding:'b',ranges:[{actor:'a',principal:'p',from:1,through:'2'}]};
void bad;
function consume(value:AuthenticatedDeliveryUnionResult){if(value.kind==='pending'){
 // @ts-expect-error No partial preparation is available from unresolved original rights.
 value.preparation;
}else {value.preparation.recovery;}}
void consume;
// @ts-expect-error No root export or implicit public API promotion.
import {prepareAuthenticatedIndependentDeliveryUnion as publicPrepare} from '@breditor/collaboration';
void publicPrepare;
