import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{inspectRoomPreparation,prepareRoomReconstruction,readPreparedRoom}from'../../../packages/breditor-collaboration/dist/native_room_preparation/coordinator.js';
import{RoomPreparationArchive}from'../../../packages/breditor-collaboration/dist/native_room_preparation/archive.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'inspectRoomPreparation'|'prepareRoomReconstruction'|'readPreparedRoom'|'RoomPreparationArchive',keyof typeof Root> extends never?true:false>;
declare const owner:Parameters<typeof inspectRoomPreparation>[0],read:Parameters<typeof inspectRoomPreparation>[1],input:Parameters<typeof inspectRoomPreparation>[2],data:Awaited<ReturnType<typeof readPreparedRoom>>,integrity:Parameters<typeof readPreparedRoom>[1];
void inspectRoomPreparation(owner,read,input);void prepareRoomReconstruction(owner,read,{retained:input.retained,expected:data.choice});void readPreparedRoom(data.choice,integrity);
// @ts-expect-error All original inputs must be complete files, not selected counters.
void prepareRoomReconstruction(owner,read,{retained:input.retained.selection,expected:data.choice});
// @ts-expect-error An independently selected complete choice is mandatory.
void prepareRoomReconstruction(owner,read,{retained:input.retained});
// @ts-expect-error DATA never exposes an editor or native grant.
data.core.type('not authorized');
// @ts-expect-error DATA cannot activate the room.
data.activate();
// @ts-expect-error The archive constructor is private; object shape cannot admit bytes.
new RoomPreparationArchive(data.choice,data.file);
// @ts-expect-error A retained participant family cannot choose an arbitrary protocol.
input.participants=[{id:'client',sourceFamily:'crdt',family:'crdt',namespaces:[]}];
export type{Private};
