import {recordedBaseProviderSelection,type RecordedBaseHandoverInspection} from './recorded_base_control.js';
/** Check the historical base availability report against exact selected
 * client files and a separately authenticated provider at the archived server.
 * Reconciliation/ACK flags retain their recorded-only meaning. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import {SelectedRoomCurrentArchive as Current} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive as Cut} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {prepareGenerationAssetRequest} from '../generation_recovery_control/asset_requirements.js';
import {readGenerationAssetReceipt} from '../generation_recovery_control/asset_response.js';
import {readLocalMetadataUploadInventory} from '../selected_local_metadata_assets/upload_inventory.js';
import type {ServerPacketRecoveryBundle} from './contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const approval=Current.prototype.approval,selection=Cut.prototype.selection,root=Cut.prototype.root;
export async function inspectRecordedBaseAvailability(bundle:ServerPacketRecoveryBundle,base:LocalMetadataReferenceCut,current:Current,cut:Cut,host:SharedServerLogGenerationRecoveryHost,options:SharedArchiveIntegrityOptions,check:()=>void,handover?:RecordedBaseHandoverInspection):Promise<void>{
 check();const recorded=bundle.packets.containment.reconciliation.assets.availability,r=fields(recorded,['format','formatVersion','scope','references','control','approval','current','uploads','kind','provider']);
 if(r['format']!=='breditor/local-metadata-asset-availability-read'||r['formatVersion']!==1||r['scope']!=='complete-base-and-metadata-references-and-origin-selected-upload-bytes'||!['checked','pending'].includes(r['kind'] as string))throw fail();
 const catalog=parsePhysicalCatalogV3Manifest(root.call(cut).source.manifest),providerSelection=recordedBaseProviderSelection(r['control'],catalog,handover);
 if(!same(providerSelection,bundle.packets.containment.catalog.selection)||!same(r['references'],{bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256})||!same(r['approval'],approval.call(current).selection)||!same(r['current'],selection.call(cut)))throw fail();
 const uploads=await readLocalMetadataUploadInventory(current,cut,options,check);check();if(!same(r['uploads'],uploads.pins))throw fail();
 if(base.outcome.kind!=='ready'){if(r['provider']!==null||r['kind']!=='pending')throw fail();return;}
 const requirements={references:base.outcome.references,uploads:[...uploads.assets.keys()].sort()},request=await prepareGenerationAssetRequest(providerSelection,requirements);check();
 const provider=readGenerationAssetReceipt(JSON.stringify(r['provider']),providerSelection,request.sha256,request.requirements);if(r['kind']!==(provider.missing.length?'pending':'checked'))throw fail();
 const actual=await generationRecoveryHostPort(host).checkAssets(requirements,options.signal);check();
 const meaning=(value:typeof provider)=>({resolutions:value.resolutions,assets:value.assets,missing:value.missing});if(!same(meaning(actual),meaning(provider)))throw fail();
}
