/** Cold whole-room semantic admission, not merely valid native output bytes.
 * Both literal cuts must continue; every concrete recipe must reproduce the
 * pinned output. No actor/source, provider or destination store is acquired. */
import {verifySelectedRoomNativeDataContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {buildComparedReconstructionParticipant} from '../selected_native_reconstruction/participant_recipe.js';
import {preparedMemberBytes} from '../native_room_retirement/catalog.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import type {PhysicalRoomCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import type {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {RoomExecutionReadScope} from './read_scope.js';
import {executionNativeDescriptors} from './native_descriptors.js';
import {fail} from './policy.js';
const choice=RoomPreparationArchive.prototype.choice;
export async function verifyExecutionPrepared(before:Loaded,retained:Loaded,catalog:PhysicalRoomCatalogV3Archive,prepared:RoomPreparationArchive,scope:RoomExecutionReadScope):Promise<void>{
 const a=before.approval(),b=retained.approval(),selected=choice.call(prepared);if(JSON.stringify(a.selection)!==JSON.stringify(b.selection)||JSON.stringify(a.choice)!==JSON.stringify(b.choice))throw fail();
 const descriptors=await executionNativeDescriptors(retained,scope);scope.check();await verifySelectedRoomNativeDataContinuation(before.nativeCut(),retained.nativeCut(),{reads:scope.reads,checkAuthority:scope.check,signal:scope.signal},descriptors,scope.check);
 for(const row of a.choice.adoption.participants){await verifySelectedUploadContinuation(before.selectedUploads(row.id),retained.selectedUploads(row.id),row.limits,scope.check,scope.signal);scope.check();}
 for(const row of selected.plan.participants){scope.check();const read=scope.reads.find(value=>value.id===row.id),descriptor=descriptors.get(row.id);if(!read||!descriptor)throw fail();const recipe=await buildComparedReconstructionParticipant({id:row.id,before,retained,read:read.read,descriptor,assets:scope.assets,resolveAsset:preparedMemberBytes(catalog,row.id,scope.check),check:scope.check},row.family);scope.check();if(recipe.kind!=='ready'||recipe.family!==row.family||recipe.sourceFamily!==row.sourceFamily||JSON.stringify(recipe.participant.selection)!==JSON.stringify(row.selection)||recipe.participant.file.size!==row.bytes||recipe.participant.file.type!==row.mime||await scope.integrity.digest(recipe.participant.file)!==row.sha256)throw fail();scope.check();}
 scope.check();
}
