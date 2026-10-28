import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import type {AuthenticatedNativeRoomUnionReadOptions as AuthRead,AuthenticatedNativeRoomUnionPreviewOptions as Preview,AuthenticatedColdNativeRoomUnionExecutionOptions as ColdOptions} from '../../../packages/breditor-collaboration/dist/native_room_union_authentication/contract.js';
import {inspectAuthenticatedNativeRoomUnion,inspectNativeRoomUnion} from '../../../packages/breditor-collaboration/dist/native_room_union/coordinator.js';
import {NativeRoomUnionArchive as Archive} from '../../../packages/breditor-collaboration/dist/native_room_union/archive.js';
import {NativeRoomUnionExecutionAttempt as Warm} from '../../../packages/breditor-collaboration/dist/native_room_union_run/attempt.js';
import {ColdNativeRoomUnionExecutionAttempt as Cold} from '../../../packages/breditor-collaboration/dist/cold_native_room_union_execution/attempt.js';
import {readAuthenticatedNativeRoomUnionRunHandoff} from '../../../packages/breditor-collaboration/dist/native_room_union_run/handoff_data.js';
import type {NativeRoomUnionRunOptions} from '../../../packages/breditor-collaboration/dist/native_room_union_run/contract.js';
import type {RetainedSelectedAssetOwner as Owner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions as Reads} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {NativeRoomUnionFile as File} from '../../../packages/breditor-collaboration/dist/native_room_union/contract.js';
import type {OriginalReviewRead} from '../../../packages/breditor-collaboration/dist/original_review_authorizations/contract.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'NativeRoomUnionAuthentication'|'NativeRoomUnionOriginalRightsPending'|'inspectAuthenticatedNativeRoomUnion'|'readAuthenticatedNativeRoomUnionRunHandoff',keyof typeof Root> extends never?true:false>;
declare const owner:Owner,reads:Reads,options:Preview,read:AuthRead,run:NativeRoomUnionRunOptions,cold:ColdOptions,file:File,saved:OriginalReviewRead;
await inspectAuthenticatedNativeRoomUnion(owner,reads,options);await Archive.readAuthenticated(file.file,file.choice,read);const warm=Warm.beginAuthenticated(owner,read,run);Warm.resumeAuthenticated(owner,read,run);Cold.resumeAuthenticated(cold);const handoff=await readAuthenticatedNativeRoomUnionRunHandoff(run.expected,read);void handoff.basis;
// @ts-expect-error The original caller-window entry point is still closed to authenticated choices.
inspectNativeRoomUnion(owner,reads,options);
// @ts-expect-error The original archive read is not widened implicitly.
Archive.read(file.file,file.choice,read);
// @ts-expect-error Original warm constructors still require explicit caller windows.
Warm.begin(owner,read,run);
// @ts-expect-error Original cold constructors are not silently widened.
Cold.resume(cold);
// @ts-expect-error A saved response cannot stand in for the genuine executable host.
Warm.beginAuthenticated(owner,{...read,authentication:{...read.authentication,host:saved}},run);
// @ts-expect-error Supplied role windows cannot bypass fresh authentication.
inspectAuthenticatedNativeRoomUnion(owner,reads,{...options,authorizations:[]});
// @ts-expect-error No actor or editor is manufactured by a saved handoff record.
Warm.beginAuthenticated(handoff,read,run);
// @ts-expect-error This remains local recovery, never a serving activation API.
warm.activate();
export type {Private};
