/** Private closed family and selection-policy contract; no root API promotion. */
import type {OperationalRestoredLocalParticipant} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import type {OperationalFlatLocalParticipant} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {handoffNativeInputParticipants,type NativeInputCohortParts} from '../../../packages/breditor-collaboration/dist/native_input_operation/cohort.js';
declare const snapshot:OperationalRestoredLocalParticipant<'document-v1'>;
declare const flat:OperationalFlatLocalParticipant<'document-v1'>;
async function exactPolicy(){const result=await handoffNativeInputParticipants([{id:'snapshot',family:'local-operation-snapshot',operation:snapshot},{id:'flat',family:'local-operation-flat',operation:flat}]);const exact:NativeInputCohortParts<'document-v1'>=result;return exact;}
void exactPolicy;
// @ts-expect-error Saved readiness cannot supply a genuine private parent.
void handoffNativeInputParticipants([{id:'fake',family:'local-operation-snapshot',operation:{ready:true}}]);
// @ts-expect-error A flat owner is not a snapshot owner.
void handoffNativeInputParticipants([{id:'wrong',family:'local-operation-snapshot',operation:flat}]);
// @ts-expect-error A local operation is not a delivery transport.
void handoffNativeInputParticipants([{id:'wrong',family:'independent-delivery',operation:flat}]);
