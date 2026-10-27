import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {RoomExecutionAttempt} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {RoomRunOptions,RoomRunReadOptions,RoomRunResult,RoomRunPromotionChoice,RoomRunPromotionResult} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/contract.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'RoomRunSuccessorRecipient'|'transferRoomAssetAdoptionWithActors'|'roomRunPromotionChoice',keyof typeof Root> extends never?true:false>;
declare const old:RetainedSelectedAssetOwner,reads:RoomRunReadOptions,options:RoomRunOptions,stage:RoomRunResult;
const attempt=RoomExecutionAttempt.begin(old,reads,options);await attempt.run(()=>true);
const expected:RoomRunPromotionChoice=await attempt.previewPromotion();
const result:RoomRunPromotionResult=await attempt.promote({expected,approve:choice=>choice.identity===expected.identity,checkAssetAuthority(){}});
const owner:RetainedSelectedAssetOwner=attempt.takeOwner();await attempt.close();void owner.clients;void result.approval;
// @ts-expect-error A staging report does not pin a final complete cut/decision.
attempt.promote({expected:stage,approve:()=>true,checkAssetAuthority(){}});
// @ts-expect-error A stored choice never replaces a fresh affirmative decision.
attempt.promote({expected,checkAssetAuthority(){}});
// @ts-expect-error Asset access has a separately selected current lifetime.
attempt.promote({expected,approve:()=>true});
// @ts-expect-error The async report is DATA, not a live editor or room grant.
result.clients;
// @ts-expect-error Local succession does not activate an authenticated server.
result.activate();
// @ts-expect-error Exact target choices remain immutable.
expected.identity.execution.plan.layout.operationDatabase='other';
export type {Private};
