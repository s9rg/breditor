/** A promoted Warm recipient and finite witness require actual private custody. */
import * as publicApi from '@breditor/collaboration';
import {RoomExecutionAttempt,withRoomExecutionMetadataTarget,roomMetadataTargetIdentity,roomMetadataTargetApprovedCut} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {ColdRoomExecutionAttempt} from '../../../packages/breditor-collaboration/dist/cold_room_execution/attempt.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import type {RoomRunIdentity} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/contract.js';
declare const warm:RoomExecutionAttempt,cold:ColdRoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,scope:SelectedNativeRecoveryScope,saved:RoomRunIdentity;
const actual:Promise<RoomRunIdentity>=withRoomExecutionMetadataTarget(warm,reads,async(target,witness)=>{target.check();void roomMetadataTargetApprovedCut(witness,target);return roomMetadataTargetIdentity(witness,target);});
// @ts-expect-error Persisted run DATA supplies no actual Warm private fields.
void withRoomExecutionMetadataTarget(saved,reads,async()=>0);
// @ts-expect-error Cold has its own distinct genuine-recipient admission.
void withRoomExecutionMetadataTarget(cold,reads,async()=>0);
// @ts-expect-error A stored cut cannot issue an actual target witness.
void roomMetadataTargetIdentity({approved:saved},scope);
// @ts-expect-error A copied prototype description grants no private recipient.
void withRoomExecutionMetadataTarget({takeOwner(){}},reads,async()=>0);
// @ts-expect-error Target visit composition remains SDK-private.
void publicApi.withRoomExecutionMetadataTarget;
// @ts-expect-error Application code cannot construct the private executor.
new RoomExecutionAttempt({},{});
void actual;
