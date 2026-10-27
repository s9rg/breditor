import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {RoomExecutionArchive} from '../../../packages/breditor-collaboration/dist/native_room_execution/archive.js';
import {previewRoomExecutionUnion,previewRoomExecutionAdoption} from '../../../packages/breditor-collaboration/dist/native_room_execution/preview.js';
import {inspectRoomExecution,prepareRoomExecution,readRoomExecution} from '../../../packages/breditor-collaboration/dist/native_room_execution/coordinator.js';
import type {RoomExecutionCaptureInput,RoomExecutionReadOptions,RoomExecutionChoice} from '../../../packages/breditor-collaboration/dist/native_room_execution/contract.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {SelectedRoomCurrentFile} from '../../../packages/breditor-collaboration/dist/selected_room_current/contract.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'RoomExecutionArchive'|'prepareRoomExecution'|'inspectRoomExecution'|'readRoomExecution',keyof typeof Root> extends never?true:false>;
declare const input:RoomExecutionCaptureInput,options:RoomExecutionReadOptions,owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions,retained:SelectedRoomCurrentFile,expected:RoomExecutionChoice;
const first=await previewRoomExecutionUnion(input.preparation,options);const union=first.map(row=>({id:row.id,union:row.preview.conflicts.map(({asset})=>({asset,keep:'current' as const}))}));await previewRoomExecutionAdoption(input.preparation,union,options);
const archive=await RoomExecutionArchive.capture(input,options);await RoomExecutionArchive.read(archive.file(),archive.choice(),options);archive.base('member','adoption');archive.dispose();
void inspectRoomExecution(owner,reads,{retained,preparation:input.preparation.choice,layout:input.layout,decisions:input.decisions});void prepareRoomExecution(owner,reads,{retained,expected});void readRoomExecution(expected,options);
// @ts-expect-error Both conflict edges are explicit, not a single default winner.
RoomExecutionArchive.capture({...input,decisions:[{id:'member',keep:'newest'}]},options);
// @ts-expect-error Cold DATA admission requires independently selected native readers.
RoomExecutionArchive.read(input.preparation.file,expected,{wasm:options.wasm,checkAuthority(){}});
// @ts-expect-error An immutable saved intent is not a genuine current source owner.
prepareRoomExecution({state:'prepared'},reads,{retained,expected});
// @ts-expect-error Complete files and selections are required, not only metadata.
RoomExecutionArchive.capture({...input,preparation:input.preparation.choice},options);
// @ts-expect-error A DATA handle grants no remote or local activation.
archive.activate();
// @ts-expect-error Saved decisions remain immutable DATA.
expected.plan.assets[0]!.union[0]!.keep='original';
export type {Private};
