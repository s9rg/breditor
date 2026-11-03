/** Cold target custody comes from the genuine promoted executor, never DATA. */
import * as publicApi from '@breditor/collaboration';
import {ColdRoomExecutionAttempt,withColdRoomExecutionTarget} from '../../../packages/breditor-collaboration/dist/cold_room_execution/attempt.js';
import {RoomExecutionAttempt,withColdRoomExecutionMetadataTarget,roomMetadataTargetIdentity,roomMetadataTargetApprovedCut} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import type {RoomRunIdentity} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/contract.js';
declare const cold:ColdRoomExecutionAttempt,warm:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,scope:SelectedNativeRecoveryScope,saved:RoomRunIdentity;
const result:Promise<number>=withColdRoomExecutionMetadataTarget(cold,reads,async(actual,witness)=>{actual.check();const identity:RoomRunIdentity=roomMetadataTargetIdentity(witness,actual);void roomMetadataTargetApprovedCut(witness,actual);return identity.execution.plan.assets.length;});
void withColdRoomExecutionTarget(cold,reads,async work=>{work.check();work.scope.check();return work.identity.database;});
// @ts-expect-error A saved run does not hold fresh actors or a promoted target.
void withColdRoomExecutionMetadataTarget(saved,reads,async()=>0);
// @ts-expect-error A different private execution class cannot impersonate cold custody.
void withColdRoomExecutionMetadataTarget(warm,reads,async()=>0);
// @ts-expect-error A source-shaped object supplies no private Cold fields.
void withColdRoomExecutionTarget({state:'targets-ready'},reads,async()=>{});
// @ts-expect-error A stored cut cannot manufacture the real scoped witness.
void roomMetadataTargetIdentity({},scope);
// @ts-expect-error Cold recipient/witness composition stays private to the SDK.
void publicApi.withColdRoomExecutionMetadataTarget;
// @ts-expect-error Private construction cannot be replaced by a receipt label.
new ColdRoomExecutionAttempt({},{});
void result;
