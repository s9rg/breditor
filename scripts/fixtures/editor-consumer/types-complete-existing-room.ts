import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {beginCompletedRoomRecovery,ColdRoomRecoveryAttempt} from '../../../packages/breditor-collaboration/dist/cold_room_recovery/attempt.js';
import type {ColdRoomRecoveryOptions} from '../../../packages/breditor-collaboration/dist/cold_room_recovery/contract.js';
import {reopenCompletedPhysicalRoot,PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {reopenCompletedRestoredParticipant} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'beginCompletedRoomRecovery'|'reopenCompletedPhysicalRoot'|'reopenCompletedRestoredParticipant'|'RestoredSourceOpening'|'completedSourceOpen'|'withCompletedOperationalComponent',keyof typeof Root> extends never?true:false>;
declare const input:ColdRoomRecoveryOptions;const strict:ColdRoomRecoveryAttempt=beginCompletedRoomRecovery(input);await strict.open();await strict.close();
// @ts-expect-error Completion is not a caller flag in the original schema.
ColdRoomRecoveryAttempt.begin({...input,completeOnly:true});
// @ts-expect-error A complete-looking report cannot replace the actual root.
await reopenCompletedPhysicalRoot({phase:'operational'});
declare const root:PhysicalRoomClientOperationV3;await reopenCompletedPhysicalRoot(root);
// @ts-expect-error The real graph parent is required; stage flags are DATA.
await reopenCompletedRestoredParticipant({source:'complete',uploads:'complete'});
export type {Private};
