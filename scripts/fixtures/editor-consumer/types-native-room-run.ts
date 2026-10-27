import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {RoomExecutionAttempt} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {RoomRunOptions,RoomRunReadOptions,RoomRunResult} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/contract.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'RoomExecutionAttempt'|'RoomRunJournalStore'|'RoomRunTargets',keyof typeof Root> extends never?true:false>;
declare const owner:RetainedSelectedAssetOwner,options:RoomRunOptions,reads:RoomRunReadOptions;
const attempt:RoomExecutionAttempt=RoomExecutionAttempt.begin(owner,reads,options);
const report:RoomRunResult=await attempt.run(choice=>choice.identity===options.expected);
void RoomExecutionAttempt.resume(owner,reads,options);await attempt.close();
// @ts-expect-error Journal/result data cannot supply actual original ownership.
RoomExecutionAttempt.resume(report,reads,options);
// @ts-expect-error All executable target policies are fresh and explicit.
RoomExecutionAttempt.begin(owner,reads,{expected:options.expected});
// @ts-expect-error Local target readiness grants no activation.
attempt.activate();
// @ts-expect-error No partial mutable native root is exposed.
attempt.clients;
// @ts-expect-error The attempt retains the actual stopped actor cohort.
attempt.takeActors();
// @ts-expect-error A saved decision never bypasses fresh approval.
attempt.run(true);
// @ts-expect-error The identity and complete target selection are immutable.
report.identity.execution.plan.layout.operationDatabase='different';
export type {Private};
