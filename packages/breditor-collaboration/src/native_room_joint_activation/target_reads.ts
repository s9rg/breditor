/** A target visit accepts history policy only. Execution/archive Wasm and
 * asset settings stay with their existing owners and must not enter this
 * separately closed contract. This DATA projection grants no target custody. */
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
export function jointTargetHistoryReads(scope:RoomExecutionReadScope,signal:AbortSignal,check:()=>void):PhysicalOperationV3HistoryReadOptions{
 const authority=()=>{check();scope.check();check();};authority();
 return snapshotPhysicalHistoryReadOptions({reads:scope.reads,signal,checkAuthority:authority});
}
