import type {ServerPacketAssetRequirements} from './asset_scope.js';
/** Re-admit every retained raster against exact Native requirements and both
 * whole upload roles. A newly authenticated selected server checks its own
 * provider; recorded provider JSON never chooses current mappings or rights. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import type {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {readLocalMetadataUploadInventory,localMetadataAssetInfo} from '../selected_local_metadata_assets/upload_inventory.js';
import {localMetadataRecoverableRequirements} from '../selected_local_metadata_assets/recoverable_requirements.js';
import {ServerPacketAssetArchive} from './asset_archive.js';
import type {ServerPacketRecoveryBundle} from './contract.js';
import type {ServerPacketRecoveryInspection} from './inspection_contract.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const meaning=(read:import('../generation_recovery_control/asset_contract.js').SharedServerLogGenerationRecoveryAssetRead)=>({resolutions:read.resolutions,assets:read.assets,missing:read.missing});
export async function inspectServerPacketRasters(bundle:ServerPacketRecoveryBundle,closure:ServerPacketAssetRequirements,room:SelectedRoomCurrentArchive,cut:PhysicalRoomRecordCutArchive,host:SharedServerLogGenerationRecoveryHost,options:SharedArchiveIntegrityOptions,limits:Readonly<AssetLimits>,check:()=>void):Promise<ServerPacketRecoveryInspection['rasters']>{
 check();const port=generationRecoveryHostPort(host);if(!same(port.selection.source.origin,bundle.server.identity)||!same(port.selection.source.server,bundle.server.identity)||!same(port.selection.source.participants,bundle.inventory.identity))throw fail();
 if(bundle.assets.kind==='pending'){
  if(closure.outcome.kind==='pending'&&!same(bundle.assets.missing,[{kind:'native-source'}])||closure.outcome.kind==='ready'&&bundle.assets.missing.some(row=>row.kind==='native-source'))throw fail();
  return Object.freeze({kind:'recorded-pending',missing:bundle.assets.missing});
 }
 if(closure.outcome.kind!=='ready')throw fail();const parent={references:{bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256},packets:{bytes:bundle.packets.packets.manifest.bytes,sha256:bundle.packets.packets.manifest.sha256},dependencies:{bytes:bundle.dependencies.bytes,sha256:bundle.dependencies.sha256}},archive=await ServerPacketAssetArchive.read(bundle.assets.files,parent,options,limits);check();
 try{
  const selected=archive.header(),uploads=await readLocalMetadataUploadInventory(room,cut,options,check);check();const requirements={references:closure.outcome.references,uploads:[...uploads.assets.keys()].sort()},local=[...uploads.assets.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:0);
  if(!same(selected.requirements,requirements)||!same(selected.local,local)||!same(selected.control,selected.provider.selection)||!same(selected.control,bundle.packets.containment.catalog.selection))throw fail();
  const current=await port.checkAssets(requirements,options.signal);check();if(!same(meaning(current),meaning(selected.provider)))throw fail();
  for(const row of current.assets){const prior=uploads.assets.get(row.asset);if(prior&&localMetadataAssetInfo(prior)!==localMetadataAssetInfo(row))throw fail();}
  const union=localMetadataRecoverableRequirements(requirements.references,uploads.assets,current),payloads=selected.payloads.map(({offset:_,...row})=>row);if(union.unresolved.length||union.unavailable.length||!same(payloads,union.payloads))throw fail();
  const fresh=await port.checkAssets(requirements,options.signal);check();if(!same(fresh,current))throw fail('metadata_packet_retention_changed');
  return Object.freeze({kind:'retained',manifest:{bytes:bundle.assets.files.manifest.bytes,sha256:bundle.assets.files.manifest.sha256},payloads,uploads:uploads.pins,provider:current});
 }finally{archive.dispose();}
}
