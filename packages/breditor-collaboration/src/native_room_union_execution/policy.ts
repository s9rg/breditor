/** This separate aggregate does not widen any ordinary native/file protocol. */
export{fields,rows,integer,hash,database,identifier}from'../native_room_union/policy.js';
export const MAX_UNION_EXECUTION_BYTES=32*1024*1024*1024,MAX_UNION_EXECUTION_HEADER_BYTES=32*1024*1024,MAX_UNION_EXECUTION_MEMBERS=1024;
export const UNION_EXECUTION_MAGIC='BREDITOR-NATIVE-ROOM-UNION-EXECUTION-1\n',UNION_EXECUTION_MIME='application/vnd.breditor.native-room-union-execution';
export class NativeRoomUnionExecutionError extends Error{constructor(readonly code='room_union_execution_integrity'){super('Retain the complete mixed proof and both whole-queue decision edges before retiring writers');this.name='NativeRoomUnionExecutionError';}}
export const fail=(code?:string)=>new NativeRoomUnionExecutionError(code);
