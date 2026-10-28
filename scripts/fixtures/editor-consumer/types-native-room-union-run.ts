import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {NativeRoomUnionExecutionAttempt as Attempt} from '../../../packages/breditor-collaboration/dist/native_room_union_run/attempt.js';
import type {NativeRoomUnionRunOptions as Options,NativeRoomUnionRunReadOptions as Read} from '../../../packages/breditor-collaboration/dist/native_room_union_run/contract.js';
import type {RetainedSelectedAssetOwner as Owner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {RoomExecutionAttempt as Old} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {readNativeRoomUnionRunHandoff} from '../../../packages/breditor-collaboration/dist/native_room_union_run/handoff_data.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'NativeRoomUnionExecutionAttempt'|'NativeRoomUnionRunJournalStore'|'NativeRoomUnionRunTargets',keyof typeof Root> extends never?true:false>;
declare const owner:Owner,options:Options,read:Read;const attempt=Attempt.begin(owner,read,options);const ready=await attempt.run(()=>true);const expected=await attempt.previewPromotion();await attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}});await attempt.complete();const successor:Owner=attempt.takeOwner();void successor;await attempt.close();
// @ts-expect-error New manifest run identity is not an old exact run.
Old.begin(owner,read,options);
// @ts-expect-error Saved run data cannot acquire actual original ownership.
Attempt.resume(ready,read,options);
// @ts-expect-error Fresh original-role windows cannot come from the saved file.
Attempt.begin(owner,{wasm:read.wasm,reads:read.reads,checkAuthority(){}},options);
// @ts-expect-error No partial native handles are exposed.
attempt.clients;
// @ts-expect-error No serving authority is granted.
attempt.activate();
// @ts-expect-error Complete is cleanup only, never a second handoff decision.
attempt.complete(()=>true);
const saved=await readNativeRoomUnionRunHandoff(options.expected,read);void saved.basis;void saved.approval.selection;
// @ts-expect-error Saved handoff data grants no editor or actors.
saved.clients;
// @ts-expect-error Complete pin is immutable, not a writer permission.
saved.approval.selection.sha256='different';
export type {Private};
