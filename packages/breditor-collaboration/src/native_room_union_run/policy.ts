/** Separate run errors and admission, without changing any old protocol. */
export {fields,rows,integer,hash,database,immutable} from '../native_room_execution/policy.js';
export class NativeRoomUnionRunError extends Error {constructor(readonly code='room_union_run_integrity'){super('Resume the exact mixed room execution with actual author custody and a fresh host decision');this.name='NativeRoomUnionRunError';}}
export const fail=(code?:string)=>new NativeRoomUnionRunError(code);
