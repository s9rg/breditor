/** Reserve every genuine client before operator callbacks; no native/client source is retargeted. */
import {reserveOperationalParticipantGroup} from '../participant_operation/operation.js';
import {reserveOperationalGenerationGroup} from '../generation_operation/operation.js';
import {ownerSources} from '../participant_recovery/components.js';
import {generationOwnerSource} from '../generation_participant/recovery_components.js';
import {SharedAssetReferenceCapture} from '../asset_references_capture.js';
import {SharedGenerationSourceCapture} from '../generation_source/capture.js';
import {physicalRecoveryHostPort,SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import {SharedPhysicalRecoveryControlError} from '../physical_recovery_control/policy.js';
import type {PhysicalCatalogArchiveState} from '../physical_room_catalog/archive.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {physicalOperationFailure,SharedPhysicalRoomClientOperationError} from './policy.js';
import type {V2OperationChild} from '../room_operation_v2/children.js';
import type {SharedPhysicalRoomRecoveryCatalogSource} from '../physical_room_catalog/contract.js';
import type {SharedPhysicalRoomNativeCheck} from './contract.js';
import {physicalOperationalCoverage} from './native_coverage.js';
const captureOriginal=SharedAssetReferenceCapture.capture,captureGeneration=SharedGenerationSourceCapture.capture;
const checkOriginal=SharedAssetReferenceCapture.prototype.check,checkGeneration=SharedGenerationSourceCapture.prototype.check,disposeOriginal=SharedAssetReferenceCapture.prototype.dispose,disposeGeneration=SharedGenerationSourceCapture.prototype.dispose;
export class SharedPhysicalRoomNativeCheckError extends Error {
 readonly code='native_check_source';
 constructor(){super('The actual native host and selected client sources could not be verified at the same physical selection');this.name='SharedPhysicalRoomNativeCheckError';}
}
export function physicalNativeCheckFailure(error:unknown):Error {
 if(error instanceof SharedPhysicalRecoveryControlError||error instanceof SharedPhysicalRoomNativeCheckError)return error;
 if(error instanceof SharedPhysicalRoomClientOperationError)return error;
 return new SharedPhysicalRoomNativeCheckError();
}
export async function checkPhysicalRoomNativeHost(children:readonly V2OperationChild[],source:PhysicalCatalogArchiveState,host:SharedPhysicalRoomRecoveryHost,retained:()=>Promise<void>,guard:()=>void):Promise<SharedPhysicalRoomNativeCheck>{
 const originals=children.filter(child=>child.family==='original'),generations=children.filter(child=>child.family==='generation');
 const captures:SharedPhysicalRoomRecoveryCatalogSource[]=[],groups:{verify():Promise<void>;abandon():void}[]=[];
 try{
  const original=reserveOperationalParticipantGroup(originals.map(child=>{if(!child.operation)throw physicalOperationFailure('physical_operation_restore');return child.operation;}));groups.push(original);
  const generation=reserveOperationalGenerationGroup(generations.map(child=>{if(!child.operation)throw physicalOperationFailure('physical_operation_restore');return child.operation;}));groups.push(generation);
  // No caller getter/authority/HTTP callback occurs before both families are busy.
  const native=physicalRecoveryHostPort(host),selected=native.selection.source,metadata=source.metadata;
  if(JSON.stringify(selected.ancestor)!==JSON.stringify(metadata.origin.identity)||JSON.stringify(selected.server)!==JSON.stringify(metadata.current.server.identity)||JSON.stringify(selected.participants)!==JSON.stringify(metadata.current.participants.identity))throw new SharedPhysicalRoomNativeCheckError();
  guard();await retained();for(const group of groups)await group.verify();guard();
  for(const[index,state]of original.states.entries())captures.push({id:originals[index]!.id,family:'original',source:captureOriginal.call(SharedAssetReferenceCapture,ownerSources(state.p,state.owners))});
  for(const[index,state]of generation.states.entries())captures.push({id:generations[index]!.id,family:'generation',source:captureGeneration.call(SharedGenerationSourceCapture,generationOwnerSource(state.p,state.owners))});
  const check=()=>{for(const row of captures)if(row.family==='original')checkOriginal.call(row.source);else checkGeneration.call(row.source);};
  check();const coverage=physicalOperationalCoverage(source,captures);check();
  await native.check();guard();await retained();for(const group of groups)await group.verify();guard();check();
  const after=physicalOperationalCoverage(source,captures);check();
  if(JSON.stringify(after)!==JSON.stringify(coverage))throw new SharedPhysicalRoomNativeCheckError();
  return frozen({format:'breditor/shared-physical-room-native-check',formatVersion:1,control:native.selection,catalog:source.selection,scope:'native-host-and-selected-client-continuity',coverage});
 }finally{for(const row of captures)if(row.family==='original')disposeOriginal.call(row.source);else disposeGeneration.call(row.source);for(const group of groups.reverse())group.abandon();}
}
