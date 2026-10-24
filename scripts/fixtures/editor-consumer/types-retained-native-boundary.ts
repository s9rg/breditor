/** Native continuation is SDK-private custody, not new public writer APIs. */
import * as api from '@breditor/collaboration';
// @ts-expect-error A retained data archive cannot provide this internal bridge.
api.withPhysicalOperationV3FreshRetainedNative;
// @ts-expect-error Genuine origin-custody donation is not a package-root API.
api.takeRetainedNativeOriginCustody;
// @ts-expect-error Callers cannot construct private retained native custody.
api.retainedNativeReadBorrow;
// @ts-expect-error Fresh capture uses the actual SDK owner, not an incoming token.
api.capturePhysicalOperationV3WithOriginCustody;
// @ts-expect-error Actual-store identity checks remain internal implementation.
api.checkOperationalAssetStores;
