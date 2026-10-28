/** Fresh executable host policy for mixed recovery. Never a serialized grant or activation claim. */
import type {SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {OriginalReviewQuery,OriginalReviewRead} from '../original_review_authorizations/contract.js';
import type {NativeRoomUnionPreviewOptions,NativeRoomUnionPrepareOptions,NativeRoomUnionReadOptions} from '../native_room_union/contract.js';
export interface NativeRoomUnionAuthenticationOptions {
 readonly host:SharedPhysicalRoomRecoveryHost;
 readonly originalReview:readonly Readonly<{id:string;query:OriginalReviewQuery}>[];
}
export type AuthenticatedNativeRoomUnionReadOptions=Omit<NativeRoomUnionReadOptions,'authorizations'>&Readonly<{authentication:NativeRoomUnionAuthenticationOptions}>;
export type AuthenticatedNativeRoomUnionPreviewOptions=Omit<NativeRoomUnionPreviewOptions,'authorizations'>&Readonly<{authentication:NativeRoomUnionAuthenticationOptions}>;
export type AuthenticatedNativeRoomUnionPrepareOptions=Omit<NativeRoomUnionPrepareOptions,'authorizations'>&Readonly<{authentication:NativeRoomUnionAuthenticationOptions}>;
export interface NativeRoomUnionPendingOriginalRights {readonly id:string;readonly read:OriginalReviewRead}

export type AuthenticatedNativeRoomUnionExecutionPreviewOptions=Omit<import('../native_room_union_execution/contract.js').NativeRoomUnionExecutionPreviewOptions,'authorizations'>&Readonly<{authentication:NativeRoomUnionAuthenticationOptions}>;
export type AuthenticatedNativeRoomUnionExecutionPrepareOptions=Omit<import('../native_room_union_execution/contract.js').NativeRoomUnionExecutionPrepareOptions,'authorizations'>&Readonly<{authentication:NativeRoomUnionAuthenticationOptions}>;

export type AuthenticatedNativeRoomUnionRetirementOptions=Omit<import('../native_room_union/retirement.js').NativeRoomUnionRetirementOptions,'authorizations'>&Readonly<{authentication:NativeRoomUnionAuthenticationOptions}>;

export type AuthenticatedColdNativeRoomUnionExecutionOptions=Omit<import('../cold_native_room_union_execution/contract.js').ColdNativeRoomUnionExecutionOptions,'reads'>&Readonly<{reads:AuthenticatedNativeRoomUnionReadOptions}>;
