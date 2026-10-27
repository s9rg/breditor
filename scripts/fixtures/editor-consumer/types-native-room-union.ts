import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{inspectNativeRoomUnion,prepareNativeRoomUnion,readPreparedNativeRoomUnion}from'../../../packages/breditor-collaboration/dist/native_room_union/coordinator.js';
import{NativeRoomUnionArchive}from'../../../packages/breditor-collaboration/dist/native_room_union/archive.js';
import type{NativeRoomUnionTarget,NativeRoomUnionReadOptions}from'../../../packages/breditor-collaboration/dist/native_room_union/contract.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'inspectNativeRoomUnion'|'prepareNativeRoomUnion'|'readPreparedNativeRoomUnion'|'NativeRoomUnionArchive',keyof typeof Root>extends never?true:false>;
declare const owner:Parameters<typeof inspectNativeRoomUnion>[0],read:Parameters<typeof inspectNativeRoomUnion>[1],input:Parameters<typeof inspectNativeRoomUnion>[2],options:NativeRoomUnionReadOptions,data:Awaited<ReturnType<typeof readPreparedNativeRoomUnion>>;
void inspectNativeRoomUnion(owner,read,input);void prepareNativeRoomUnion(owner,read,{expected:data.choice,retained:input.retained,authorizations:input.authorizations});void readPreparedNativeRoomUnion(data.choice,options);
// @ts-expect-error Mixed preparation requires fresh original-role windows, even when an empty set is deliberate.
void prepareNativeRoomUnion(owner,read,{expected:data.choice,retained:input.retained});
// @ts-expect-error Complete room bytes are mandatory, not a selected digest alone.
void inspectNativeRoomUnion(owner,read,{...input,retained:input.retained.selection});
// @ts-expect-error No implicit skip/merge mode exists.
const skip:NativeRoomUnionTarget={id:'x',sourceFamily:'original',family:'original',namespaces:[],mode:'skip'};
// @ts-expect-error Immutable DATA cannot edit a document.
data.core.type('not authority');
// @ts-expect-error A new explicit manifest identity is not an original whole-file SHA.
const sha:string=data.choice.selection.sha256;
// @ts-expect-error An archive cannot be constructed from shape without cold semantic admission.
new NativeRoomUnionArchive(data.choice,data.file);
declare const archive:NativeRoomUnionArchive;
// @ts-expect-error Archive accessors do not expose mutable internal slots.
archive.before().file=new Blob();
// @ts-expect-error Nested union tuples are immutable too.
archive.participantUnion('device').file=new Blob();
export type{Private};
