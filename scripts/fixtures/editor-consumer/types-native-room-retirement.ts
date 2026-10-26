import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{retirePreparedRoom}from'../../../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import{inspectRoomPreparation,readPreparedRoom}from'../../../packages/breditor-collaboration/dist/native_room_preparation/coordinator.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'retirePreparedRoom'|'PreparedRoomRetirementResult'|'withSelectedNativeRetirement'|'withNativeReconstructionRetirement',keyof typeof Root> extends never?true:false>;
declare const owner:Parameters<typeof retirePreparedRoom>[0],read:Parameters<typeof retirePreparedRoom>[1],input:Parameters<typeof inspectRoomPreparation>[2],data:Awaited<ReturnType<typeof readPreparedRoom>>,result:Awaited<ReturnType<typeof retirePreparedRoom>>;
void retirePreparedRoom(owner,read,{retained:input.retained,expected:data.choice,approve:async choice=>choice.formatVersion===1});
// @ts-expect-error A durable choice never replaces the complete retained input.
void retirePreparedRoom(owner,read,{expected:data.choice,approve:()=>true});
// @ts-expect-error The exact independently selected preparation is mandatory.
void retirePreparedRoom(owner,read,{retained:input.retained,approve:()=>true});
// @ts-expect-error Explicit fresh approval is mandatory; a stored choice is DATA.
void retirePreparedRoom(owner,read,{retained:input.retained,expected:data.choice});
// @ts-expect-error Caller-supplied drivers cannot substitute for actual native ownership.
void retirePreparedRoom(owner,read,{retained:input.retained,expected:data.choice,approve:()=>true,driver:async()=>{}});
// @ts-expect-error Retirement resolves member-local retained bytes, not host receipts.
void retirePreparedRoom(owner,read,{retained:input.retained,expected:data.choice,approve:()=>true,resolveAsset:async()=>undefined});
// @ts-expect-error A DATA file cannot stand in for the selected actual owner.
void retirePreparedRoom(data,read,{retained:input.retained,expected:data.choice,approve:()=>true});
// @ts-expect-error A local retirement result cannot publish native document work.
result.core.type('not authorized');
// @ts-expect-error Retirement is not server activation or a remote writer grant.
result.activate();
// @ts-expect-error Cold DATA read does not retire any actual owner.
data.retire();
// @ts-expect-error A detached caller check cannot replace the actual final source witness.
void retirePreparedRoom(owner,read,{retained:input.retained,expected:data.choice,approve:()=>true,finalCut:{check(){},dispose(){}}});
export type{Private};
