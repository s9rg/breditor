/** Reopened original storage must be conserved by its captured source leg.
 * The foreign retained leg is independently replayed by the mixed archive; it
 * is never a license to overwrite new local work discovered after restart.
 * Unknown original edits/packets/receipts require a fresh reconciliation.
 * This uses exact native histories, all packet variants and both upload stores,
 * not AST equality, saved progress or a weaker branch-coverage fallback. */
import {verifyColdRoomExecutionSource} from '../cold_room_execution/verify_source.js';
import type {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {NativeRoomUnionReadScope} from '../native_room_union/read_scope.js';
export function verifyColdNativeRoomUnionExecutionSource(current:Loaded,before:Loaded,_retained:Loaded,scope:NativeRoomUnionReadScope):Promise<void>{return verifyColdRoomExecutionSource(current,before,before,scope.base);}
