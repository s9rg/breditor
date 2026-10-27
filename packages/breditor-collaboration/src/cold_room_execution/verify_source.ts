/** A recovered original must fit inside the already-admitted immutable output.
 * Saved storage may be older than captured LIVE, but uncaptured native edits,
 * packet decisions, upload attempts and receipts may never be discarded. */
import {verifySelectedRoomNativeDataContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {executionNativeDescriptors} from '../native_room_execution/native_descriptors.js';
import {verifyColdCapturedPackets} from './packet_containment.js';
import type {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {coldSourceRequiresReconciliation} from './failure.js';
export async function verifyColdRoomExecutionSource(current:Loaded,before:Loaded,retained:Loaded,scope:RoomExecutionReadScope):Promise<void>{
 scope.check();if(JSON.stringify(current.approval())!==JSON.stringify(before.approval())||JSON.stringify(current.catalog())!==JSON.stringify(before.catalog()))throw coldSourceRequiresReconciliation();
 const descriptors=await executionNativeDescriptors(retained,scope);scope.check();await verifySelectedRoomNativeDataContinuation(current.nativeCut(),retained.nativeCut(),{reads:scope.reads,checkAuthority:scope.check,signal:scope.signal},descriptors,scope.check);
 for(const row of before.approval().choice.adoption.participants){await verifyColdCapturedPackets(row.id,current,before,retained,scope);await verifySelectedUploadContinuation(current.originalUploads(row.id),retained.originalUploads(row.id),row.limits,scope.check,scope.signal);await verifySelectedUploadContinuation(current.selectedUploads(row.id),retained.selectedUploads(row.id),row.limits,scope.check,scope.signal);scope.check();}
 scope.check();
}
