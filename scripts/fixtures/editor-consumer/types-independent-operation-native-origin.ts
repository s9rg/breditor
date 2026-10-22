import {SharedIndependentDeliverySession,type SharedIndependentDeliveryOptions,type SharedIndependentDeliveryRecoveryOptions} from '@breditor/collaboration';
// @ts-expect-error Native operation origins are an internal coordinator capability.
import {IndependentNativeOperationOrigin} from '@breditor/collaboration';
// @ts-expect-error A public marker cannot select private before-autosave admission.
import {withIndependentNativeOrigin} from '@breditor/collaboration';
// @ts-expect-error The private source opener is not a completed public operation API.
import {openNativeOriginVerifiedIndependentDelivery} from '@breditor/collaboration';
declare const options:SharedIndependentDeliveryOptions,restore:SharedIndependentDeliveryRecoveryOptions;
SharedIndependentDeliverySession.open(options);
SharedIndependentDeliverySession.restoreRecovery(restore);
// @ts-expect-error Untrusted public option data cannot issue a native-origin guard.
SharedIndependentDeliverySession.open({...options,nativeCaptureGuard:{check(){},capture(){}}});
// @ts-expect-error Restored data cannot choose private operational admission either.
SharedIndependentDeliverySession.restoreRecovery({...restore,nativeOrigin:{ready:true}});
