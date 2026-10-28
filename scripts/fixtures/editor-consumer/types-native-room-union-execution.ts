import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{NativeRoomUnionExecutionArchive}from'../../../packages/breditor-collaboration/dist/native_room_union_execution/archive.js';
import{inspectNativeRoomUnionExecution,prepareNativeRoomUnionExecution,readPreparedNativeRoomUnionExecution}from'../../../packages/breditor-collaboration/dist/native_room_union_execution/coordinator.js';
import{previewNativeRoomUnionExecutionUnion,previewNativeRoomUnionExecutionAdoption}from'../../../packages/breditor-collaboration/dist/native_room_union_execution/preview.js';
import{RoomExecutionArchive}from'../../../packages/breditor-collaboration/dist/native_room_execution/archive.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'NativeRoomUnionExecutionArchive'|'inspectNativeRoomUnionExecution'|'prepareNativeRoomUnionExecution'|'readPreparedNativeRoomUnionExecution',keyof typeof Root>extends never?true:false>;
declare const owner:Parameters<typeof inspectNativeRoomUnionExecution>[0],read:Parameters<typeof inspectNativeRoomUnionExecution>[1],input:Parameters<typeof inspectNativeRoomUnionExecution>[2],options:Parameters<typeof NativeRoomUnionExecutionArchive.read>[2],data:Awaited<ReturnType<typeof readPreparedNativeRoomUnionExecution>>;
inspectNativeRoomUnionExecution(owner,read,input);prepareNativeRoomUnionExecution(owner,read,{expected:data.choice,retained:input.retained,authorizations:input.authorizations});readPreparedNativeRoomUnionExecution(data.choice,options);
// @ts-expect-error This explicit manifest identity is not the old exact-execution protocol.
RoomExecutionArchive.read(data.file,data.choice,options);
// @ts-expect-error The outer manifest digest cannot be mistaken for whole-file SHA.
data.choice.selection.sha256;
// @ts-expect-error No saved actor or provider authority is returned.
data.activate();
// @ts-expect-error Fresh original-role windows are required on reopen.
readPreparedNativeRoomUnionExecution(data.choice,{wasm:options.wasm,reads:options.reads,checkAuthority(){}});
// @ts-expect-error Scope admission cannot be replaced with public constructor shape.
new NativeRoomUnionExecutionArchive(data.choice,data.file);
void previewNativeRoomUnionExecutionUnion;void previewNativeRoomUnionExecutionAdoption;
export type{Private};
