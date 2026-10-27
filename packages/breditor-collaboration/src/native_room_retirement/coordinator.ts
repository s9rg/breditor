/** Explicit closure of old writers from a genuine durable preparation. This
 * is an execution prerequisite, not replacement target creation, native union,
 * a save ACK, a remote writer grant or authenticated room activation. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RoomPreparationChoice} from '../native_room_preparation/contract.js';
import type {NativeReconstructionInputOptions} from '../selected_native_reconstruction/input_scope.js';
import {withNativeReconstructionRetirement,withNativeReconstructionActorRetirement} from '../selected_native_reconstruction/input_scope.js';
import {roomPreparationChoice} from '../native_room_preparation/plan.js';
import {fields,fail} from '../native_room_preparation/policy.js';
import {readPreparedRoom} from '../native_room_preparation/coordinator.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import {PhysicalRoomCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import {readPreparedReconstructionCatalog,preparedMemberBytes} from './catalog.js';
import {buildComparedReconstructionParticipant} from '../selected_native_reconstruction/participant_recipe.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
const archive={read:RoomPreparationArchive.read,dispose:RoomPreparationArchive.prototype.dispose},disposeCatalog=PhysicalRoomCatalogV3Archive.prototype.dispose,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
export interface PreparedRoomRetirementResult{readonly format:'breditor/prepared-room-retirement';readonly formatVersion:1;readonly preparation:RoomPreparationChoice;readonly state:'old-writers-closed';readonly scope:'local-native-and-selected-asset-custody-only'}
export type PreparedRoomRetirementOptions=Omit<NativeReconstructionInputOptions,'resolveAsset'>&Readonly<{expected:RoomPreparationChoice;approve:(choice:RoomPreparationChoice)=>boolean|Promise<boolean>}>;
/** Every attempt reads the EXISTING immutable intent and rebuilds every output
 * through its concrete native adapter. A selected file/phase never substitutes
 * for that work or for this call's affirmative decision. */
function runPreparedRetirement<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:PreparedRoomRetirementOptions,keepActors:boolean):Promise<PreparedRoomRetirementResult>{
 const raw=fields(options,['expected','retained','approve'],['assets']),expected=roomPreparationChoice(raw['expected']),approve=raw['approve'] as PreparedRoomRetirementOptions['approve'];if(typeof approve!=='function')throw fail('room_preparation_policy');const input={retained:raw['retained'],...(raw['assets']===undefined?{}:{assets:raw['assets']})} as NativeReconstructionInputOptions;
 const borrow=keepActors?withNativeReconstructionActorRetirement:withNativeReconstructionRetirement;
 return borrow(owner,provided,input,expected.plan.participants.map(row=>({id:row.id,families:[row.sourceFamily]})),true,async context=>{
  if(JSON.stringify(context.before.file().selection)!==JSON.stringify(expected.plan.before)||JSON.stringify(context.retained.file().selection)!==JSON.stringify(expected.plan.retained))throw fail();const saved=await readPreparedRoom(expected,context.integrity);context.check();let prepared:RoomPreparationArchive|undefined,catalog:PhysicalRoomCatalogV3Archive|undefined;
  try{prepared=await archive.read.call(RoomPreparationArchive,saved.file,expected,context.integrity);catalog=(await readPreparedReconstructionCatalog(context,prepared)).catalog;const digest=prepareArchiveIntegrity(context.integrity);
   for(const row of expected.plan.participants){context.check();const client=context.clients.find(member=>member.id===row.id)!,read=context.reads.find(member=>member.id===row.id)!,recipe=await buildComparedReconstructionParticipant({id:row.id,before:context.before,retained:context.retained,read:read.read,descriptor:JSON.stringify(sourceNativeRecoveryRead(client.core).descriptor()),assets:context.assets,resolveAsset:preparedMemberBytes(catalog,row.id,context.check),check:context.check},row.family);context.check();if(recipe.kind!=='ready'||recipe.family!==row.family||recipe.sourceFamily!==row.sourceFamily||JSON.stringify(recipe.participant.selection)!==JSON.stringify(row.selection)||recipe.participant.file.size!==row.bytes||recipe.participant.file.type!==row.mime||await digest.digest(recipe.participant.file)!==row.sha256)throw fail();}
  }finally{try{if(catalog)disposeCatalog.call(catalog);}finally{if(prepared)archive.dispose.call(prepared);}}
  context.check();const signal=context.integrity.signal;if(!signal)throw fail('room_preparation_policy');await decideFreshAssetChoice(expected,approve,{check:context.check,signal,watchClosing:notify=>{add.call(signal,'abort',notify,{once:true});return()=>remove.call(signal,'abort',notify);}});context.check();const actual=await context.captureCurrent();context.check();if(JSON.stringify(actual.current.selection)!==JSON.stringify(expected.plan.before))throw fail();
  return Object.freeze({format:'breditor/prepared-room-retirement' as const,formatVersion:1 as const,preparation:expected,state:'old-writers-closed' as const,scope:'local-native-and-selected-asset-custody-only' as const});
 });
}

/** Original explicit closure keeps its established actor-release semantics. */
export function retirePreparedRoom<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:PreparedRoomRetirementOptions):Promise<PreparedRoomRetirementResult>{return runPreparedRetirement(owner,provided,options,false);}
/** Complete saved recipes and a fresh affirmative decision are required again.
 * This alternative retains all actual author locks BEFORE parent cleanup.
 * The same actual owner retains them if cleanup fails; finish canonical Close
 * before taking them through takeSelectedRetiredActors. No target or server
 * activation is created, and the stored/result DATA cannot supply custody. */
export const retirePreparedRoomKeepingActors:typeof retirePreparedRoom=(owner,provided,options)=>runPreparedRetirement(owner,provided,options,true);
