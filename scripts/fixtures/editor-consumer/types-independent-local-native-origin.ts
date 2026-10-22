import {SharedIndependentHistoryPersistentSession,type SharedIndependentHistorySessionOptions,type SharedIndependentHistoryRecovery} from '@breditor/collaboration';
// @ts-expect-error A local operation origin is a private real coordinator capability.
import {IndependentLocalNativeOperationOrigin} from '@breditor/collaboration';
// @ts-expect-error Public option data cannot select native ancestry policy.
import {withIndependentLocalNativeOrigin} from '@breditor/collaboration';
// @ts-expect-error This private native opener is not a completed operation owner API.
import {openLocalNativeOriginVerifiedHistory} from '@breditor/collaboration';
declare const options:SharedIndependentHistorySessionOptions,recovery:SharedIndependentHistoryRecovery;
SharedIndependentHistoryPersistentSession.open(options);
SharedIndependentHistoryPersistentSession.restoreRecovery(options,recovery,'host-reacquired');
// @ts-expect-error A serialized ready marker cannot enable private native verification.
SharedIndependentHistoryPersistentSession.open({...options,nativeOrigin:{ready:true}});
// @ts-expect-error A delivery companion is not part of the public local-only source contract.
SharedIndependentHistoryPersistentSession.open({...options,companion:{binding:'invented'}});
