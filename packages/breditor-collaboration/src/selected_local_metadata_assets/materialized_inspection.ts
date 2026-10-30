/** Verify historical raster metadata against an already Native-recomputed
 * client cut and both genuine upload archive roles. Nothing in this module
 * registers a controller, authenticates old JSON, or revives serving rights. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {deliveryControlSelection} from '../generation_delivery_control/identity.js';
import {prepareGenerationAssetRequest} from '../generation_recovery_control/asset_requirements.js';
import {readGenerationAssetReceipt} from '../generation_recovery_control/asset_response.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {metadataJson,equal} from '../selected_local_metadata_delivery/data.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {readLocalMetadataUploadInventory,localMetadataAssetInfo} from './upload_inventory.js';
import {LocalMetadataRasterArchive} from './raster_archive.js';
import type {LocalMetadataReferenceCut} from './room_contract.js';
import type {LocalMetadataMaterializedBundle,LocalMetadataMaterializedInspection} from './materialization_contract.js';
import {fail} from './error.js';
const room={approval:SelectedRoomCurrentArchive.prototype.approval};
const cut={root:PhysicalRoomRecordCutArchive.prototype.root,selection:PhysicalRoomRecordCutArchive.prototype.selection};
const raster={read:LocalMetadataRasterArchive.read,metadata:LocalMetadataRasterArchive.prototype.metadata,dispose:LocalMetadataRasterArchive.prototype.dispose};
export async function inspectLocalMetadataMaterializedRasters(bundle:LocalMetadataMaterializedBundle,references:LocalMetadataReferenceCut,current:SelectedRoomCurrentArchive,record:PhysicalRoomRecordCutArchive,options:SharedArchiveIntegrityOptions,limits:Readonly<AssetLimits>,check:()=>void):Promise<LocalMetadataMaterializedInspection>{
 check();if(references.outcome.kind!=='ready')throw fail('local_metadata_assets_state');
 const selected={bytes:bundle.rasters.bytes,sha256:bundle.rasters.sha256},archive=await raster.read.call(LocalMetadataRasterArchive,bundle.rasters.file,selected,options,limits);
 try{
  check();const header=raster.metadata.call(archive),ref={bytes:bundle.references.references.bytes,sha256:bundle.references.references.sha256};
  if(!equal(header.references,ref))throw fail('local_metadata_assets_state');
  const input=fields(header.availability,['format','formatVersion','scope','references','control','approval','current','uploads','kind','provider']);
  if(input['format']!=='breditor/local-metadata-asset-availability-read'||input['formatVersion']!==1||input['scope']!=='complete-base-and-metadata-references-and-origin-selected-upload-bytes'||input['kind']!=='checked')throw fail('local_metadata_assets_state');
  const rawControl=fields(input['control'],['kind','selection']),catalog=parsePhysicalCatalogV3Manifest(cut.root.call(record).source.manifest);
  let control,providerSelection;
  if(rawControl['kind']==='source'){
   const selection=generationControlSelection(rawControl['selection']);
   if(!equal(selection.source.origin,catalog.origin.identity)||!equal(selection.source.server,catalog.current.server.identity)||!equal(selection.source.participants,catalog.current.participants.identity))throw fail('local_metadata_assets_state');
   control={kind:'source' as const,selection};providerSelection=selection;
  }else if(rawControl['kind']==='native-continuation'){
   const selection=deliveryControlSelection(rawControl['selection']);
   if(!equal(selection.continuation.previous,catalog.current.server.identity)||!equal(selection.continuation.current.origin,catalog.origin.identity))throw fail('local_metadata_assets_state');
   // Shape and exact predecessor declaration only. Old unsigned data does not
   // prove the newer server's Native continuation or current provider state.
   control={kind:'native-continuation' as const,selection};providerSelection=selection.current;
  }else throw fail('local_metadata_assets_state');
  const uploads=await readLocalMetadataUploadInventory(current,record,options,check);check();
  const request=await prepareGenerationAssetRequest(providerSelection,{references:references.outcome.references,uploads:[...uploads.assets.keys()].sort()});check();
  const provider=readGenerationAssetReceipt(metadataJson(input['provider']),providerSelection,request.sha256,request.requirements);
  if(provider.missing.length)throw fail('local_metadata_assets_state');
  for(const expected of provider.assets){const local=uploads.assets.get(expected.asset);if(local&&localMetadataAssetInfo(local)!==localMetadataAssetInfo(expected))throw fail('local_metadata_assets_state');}
  const payloads=header.payloads.map(({offset:_,...info})=>info);
  if(!equal(payloads,provider.assets))throw fail('local_metadata_assets_state');
  const recordedAvailability={format:'breditor/local-metadata-asset-availability-read' as const,formatVersion:1 as const,scope:'complete-base-and-metadata-references-and-origin-selected-upload-bytes' as const,references:ref,control,approval:room.approval.call(current).selection,current:cut.selection.call(record),uploads:uploads.pins,kind:'checked' as const,provider};
  if(metadataJson(recordedAvailability)!==metadataJson(header.availability))throw fail('local_metadata_assets_state');
  check();return frozen({format:'breditor/selected-local-metadata-materialized-inspection',formatVersion:1,scope:'native-client-cut-and-recorded-raster-payloads',references,rasters:{...selected,payloads},recordedAvailability});
 }finally{raster.dispose.call(archive);}
}
