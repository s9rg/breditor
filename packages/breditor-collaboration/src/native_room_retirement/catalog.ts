/** Re-admit all prepared output files with independent actual read factories.
 * Server/inventory inputs stay literal. No catalog database, native writer,
 * replacement root or serving authority is created by this DATA capture. */
import {PhysicalRoomCatalogV3Archive,physicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import type {PhysicalRoomCatalogV3Input,PhysicalRoomCatalogV3LocalPolicy,PhysicalRoomCatalogV3GraphPolicy,PhysicalRoomCatalogV3ReadOptions} from '../physical_room_catalog_v3/contract.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import type {NativeReconstructionInputs} from '../selected_native_reconstruction/input_scope.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import {checkRoomPreparationSources} from '../native_room_preparation/plan.js';
import {fail} from '../native_room_preparation/policy.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {RestoredOperationGraphArchive} from '../restored_graph/archive.js';
import {FlatLocalArchive} from '../flat_local_operation/archive.js';
import type {SharedAssetBytesResolver} from '../asset_bytes/types.js';
const choice=RoomPreparationArchive.prototype.choice,part=RoomPreparationArchive.prototype.participant;
const blobs={original:SharedParticipantBackup.prototype.blob,generation:SharedGenerationParticipantBackup.prototype.blob,'independent-local':SharedIndependentParticipantBackup.prototype.blob,'independent-delivery':SharedIndependentDeliveryParticipantBackup.prototype.blob,'restored-graph':RestoredOperationGraphArchive.prototype.blob,'local-operation-flat':FlatLocalArchive.prototype.blob};
export type ReconstructionCatalogReadContext=Pick<NativeReconstructionInputs,'before'|'retained'|'nativeReads'|'assets'|'integrity'|'check'>;
/** Returned policies retain the supplied read lifetime; a later mutable owner
 * must choose its own independent host policy, not reuse a retiring job's one. */
export async function readPreparedReconstructionCatalog(context:ReconstructionCatalogReadContext,prepared:RoomPreparationArchive):Promise<Readonly<{catalog:PhysicalRoomCatalogV3Archive;readOptions:PhysicalRoomCatalogV3ReadOptions}>>{
 const selected=choice.call(prepared),source=context.retained.catalog(),files=context.retained.nativeCut().catalogFiles();checkRoomPreparationSources(context.before,context.retained,selected.plan.database,selected.plan.participants);
 const graphPolicies:PhysicalRoomCatalogV3GraphPolicy[]=[],localPolicies:PhysicalRoomCatalogV3LocalPolicy[]=[],participants:PhysicalRoomCatalogV3Input[]=[];
 for(const row of selected.plan.participants){context.check();const original=context.retained.participant(row.id),binding=context.nativeReads.find(read=>read.id===row.id);if(!binding||original.family!==row.sourceFamily)throw fail();
  if(row.family==='restored-graph'){if(original.family!=='restored-graph'||JSON.stringify(original.selection.original)!==JSON.stringify(row.selection.original))throw fail();graphPolicies.push({id:row.id,original:original.selection.original,options:{session:(binding.read as {session:IndependentOperationReadOptions['session']}).session,checkAuthority:context.check,...(context.integrity.signal?{signal:context.integrity.signal}:{}),...(context.assets?.limits?{limits:context.assets.limits}:{})}});}
  else if(row.family==='local-operation-flat'){if(original.family!=='local-operation-flat'&&original.family!=='local-operation-snapshot'||JSON.stringify(original.selection.original)!==JSON.stringify(row.selection.original))throw fail();localPolicies.push({id:row.id,family:row.family,original:original.selection.original,options:{session:(binding.read as {session:LocalOperationReadOptions['session']}).session,checkAuthority:context.check,...(context.integrity.signal?{signal:context.integrity.signal}:{}),...(context.assets?.limits?{limits:context.assets.limits}:{})}});}
  else if(row.family==='local-operation-snapshot')throw fail();
  else if('identity'in original.selection&&'identity'in row.selection){if(JSON.stringify(original.selection.identity)!==JSON.stringify(row.selection.identity))throw fail();}else throw fail();
  participants.push({id:row.id,family:row.family,expected:row.selection,file:part.call(prepared,row.id)} as PhysicalRoomCatalogV3Input);
 }
 const take=(name:string)=>{const file=files.get(name);if(!file)throw fail();return file;};context.check();const readOptions:PhysicalRoomCatalogV3ReadOptions={...context.integrity,graphPolicies,localPolicies};const catalog=await PhysicalRoomCatalogV3Archive.capture({...readOptions,catalog:source.catalog,origin:{file:take('origin-server'),expected:source.origin.identity},current:{server:{file:take('current-server'),expected:source.current.server.identity},participants:{file:take('inventory'),expected:source.current.participants.identity}},participants});try{context.check();return Object.freeze({catalog,readOptions});}catch(error){catalog.dispose();throw error;}
}
/** Retained local bytes are not a new provider receipt or credential. This
 * resolver is scoped to ONE actual admitted member, so identical aliases in
 * distinct participant files cannot accidentally select a sibling's payload. */
export function preparedMemberBytes(catalog:PhysicalRoomCatalogV3Archive,id:string,check:()=>void):SharedAssetBytesResolver{
 const state=physicalCatalogV3ArchiveState(catalog),row=state.clients.get(id);if(!row||row.family==='local-operation-snapshot')throw fail();const blob=blobs[row.family] as (asset:string,generation:string)=>Blob|undefined;
 const guard=()=>{check();if(physicalCatalogV3ArchiveState(catalog)!==state||state.clients.get(id)!==row)throw fail();};
 return async(reference,signal)=>{guard();if(signal.aborted)throw fail('room_preparation_aborted');const file=blob.call(row.backup,reference.asset,reference.generation);guard();if(!file)return undefined;return{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',blob:file,check:guard};};
}
