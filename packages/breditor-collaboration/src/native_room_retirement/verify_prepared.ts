/** Admit the complete immutable preparation, all native recipes and a fresh
 * approval against one actual held source cut. The caller owns retirement;
 * this function returns inspection data and never grants writers or serving. */
import type {NativeReconstructionInputs} from '../selected_native_reconstruction/input_scope.js';
import type {RoomPreparationChoice} from '../native_room_preparation/contract.js';
import {readPreparedRoom} from '../native_room_preparation/coordinator.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import {PhysicalRoomCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import {readPreparedReconstructionCatalog,preparedMemberBytes} from './catalog.js';
import {buildComparedReconstructionParticipant} from '../selected_native_reconstruction/participant_recipe.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fail} from '../native_room_preparation/policy.js';
const archive={read:RoomPreparationArchive.read,dispose:RoomPreparationArchive.prototype.dispose},disposeCatalog=PhysicalRoomCatalogV3Archive.prototype.dispose,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
export async function verifyPreparedRetirement(context:NativeReconstructionInputs,expected:RoomPreparationChoice,approve:(choice:RoomPreparationChoice)=>boolean|Promise<boolean>):Promise<void>{
  if(JSON.stringify(context.before.file().selection)!==JSON.stringify(expected.plan.before)||JSON.stringify(context.retained.file().selection)!==JSON.stringify(expected.plan.retained))throw fail();const saved=await readPreparedRoom(expected,context.integrity);context.check();let prepared:RoomPreparationArchive|undefined,catalog:PhysicalRoomCatalogV3Archive|undefined;
  try{prepared=await archive.read.call(RoomPreparationArchive,saved.file,expected,context.integrity);catalog=(await readPreparedReconstructionCatalog(context,prepared)).catalog;const digest=prepareArchiveIntegrity(context.integrity);
   for(const row of expected.plan.participants){context.check();const client=context.clients.find(member=>member.id===row.id)!,read=context.reads.find(member=>member.id===row.id)!,recipe=await buildComparedReconstructionParticipant({id:row.id,before:context.before,retained:context.retained,read:read.read,descriptor:JSON.stringify(sourceNativeRecoveryRead(client.core).descriptor()),assets:context.assets,resolveAsset:preparedMemberBytes(catalog,row.id,context.check),check:context.check},row.family);context.check();if(recipe.kind!=='ready'||recipe.family!==row.family||recipe.sourceFamily!==row.sourceFamily||JSON.stringify(recipe.participant.selection)!==JSON.stringify(row.selection)||recipe.participant.file.size!==row.bytes||recipe.participant.file.type!==row.mime||await digest.digest(recipe.participant.file)!==row.sha256)throw fail();}
  }finally{try{if(catalog)disposeCatalog.call(catalog);}finally{if(prepared)archive.dispose.call(prepared);}}
  context.check();const signal=context.integrity.signal;if(!signal)throw fail('room_preparation_policy');await decideFreshAssetChoice(expected,approve,{check:context.check,signal,watchClosing:notify=>{add.call(signal,'abort',notify,{once:true});return()=>remove.call(signal,'abort',notify);}});context.check();const actual=await context.captureCurrent();context.check();if(JSON.stringify(actual.current.selection)!==JSON.stringify(expected.plan.before))throw fail();
}
