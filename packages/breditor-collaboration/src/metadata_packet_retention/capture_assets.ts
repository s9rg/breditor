/** Full base + additional packet + every original/selected upload requirement.
 * Actual provider-missing local bytes remain unacknowledged and are retained. */
import {checkRichAssetLimits,inspectRichRaster} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {LocalMetadataMaterializationOptions,LocalMetadataRasterInfo} from '../selected_local_metadata_assets/materialization_contract.js';
import type {readLocalMetadataUploadInventory} from '../selected_local_metadata_assets/upload_inventory.js';
import {localMetadataRecoveryRasterPort,type LocalMetadataRecoveryRasterTransport} from '../selected_local_metadata_assets/raster_transport.js';
import {localMetadataRecoverableRequirements} from '../selected_local_metadata_assets/recoverable_requirements.js';
import type {PreparedLocalMetadataReconciliation} from '../selected_local_metadata_assets/reconciliation_input.js';
import type {LocalMetadataPacketRetentionBundle,MetadataPacketAssetOutcome} from './contract.js';
import {encodeMetadataPacketAssets} from './asset_archive.js';
import {fail,same} from './policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
export async function captureMetadataPacketAssets(packet:LocalMetadataPacketRetentionBundle,base:LocalMetadataReferenceCut,uploads:Awaited<ReturnType<typeof readLocalMetadataUploadInventory>>,input:PreparedLocalMetadataReconciliation,transport:LocalMetadataRecoveryRasterTransport,options:SharedArchiveIntegrityOptions&{readonly signal:AbortSignal},provided:LocalMetadataMaterializationOptions,check:()=>void):Promise<MetadataPacketAssetOutcome>{
 check();if(base.outcome.kind!=='ready'||packet.requirements.pending.length)return frozen({kind:'pending',missing:[{kind:'native-source' as const}]});
 const network=localMetadataRecoveryRasterPort(transport,input.port.selection.current),limits=checkRichAssetLimits(provided.limits),map=new Map([...base.outcome.references,...packet.requirements.references].map(row=>[JSON.stringify([row.asset,row.generation]),row]));
 const references=[...map.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),uploadIds=[...uploads.assets.keys()].sort(),provider=await input.port.checkAssets({references,uploads:uploadIds},options.signal);check();input.check();
 const union=localMetadataRecoverableRequirements(references,uploads.assets,provider);if(union.unresolved.length)return frozen({kind:'pending',missing:[{kind:'opaque-mapping' as const}]});if(union.unavailable.length)return frozen({kind:'pending',missing:union.unavailable.map(asset=>({kind:'bytes' as const,asset}))});
 const payloads:{info:LocalMetadataRasterInfo;blob:Blob}[]=[],missing:{kind:'bytes';asset:string}[]=[];let total=0;
 for(const expected of union.payloads){check();let blob=uploads.payloads.get(expected.asset);if(!blob){const remote=await network.read(expected.asset,options.signal);check();if(!remote){missing.push({kind:'bytes',asset:expected.asset});continue;}if(remote.asset!==expected.asset||remote.mime!==expected.mime||remote.bytes!==expected.bytes)throw fail();blob=remote.blob;}
  const raster=await inspectRichRaster(blob,{limits,...(options.signal?{signal:options.signal}:{})});check();if(raster.asset!==expected.asset||raster.mime!==expected.mime||raster.bytes!==expected.bytes||raster.width!==expected.width||raster.height!==expected.height)throw fail();total+=raster.bytes;if(total>limits.maxStoredBytes)throw fail('metadata_packet_retention_budget');payloads.push({info:expected,blob:raster.blob});}
 if(missing.length)return frozen({kind:'pending',missing});
 const files=await encodeMetadataPacketAssets({format:'breditor/original-metadata-packet-assets',formatVersion:1,scope:'complete-base-packet-and-whole-upload-raster-union',parent:{references:{bytes:packet.references.references.bytes,sha256:packet.references.references.sha256},packets:{bytes:packet.packets.manifest.bytes,sha256:packet.packets.manifest.sha256}},control:input.port.selection.current,requirements:{references,uploads:uploadIds},local:[...uploads.assets.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:0),provider},payloads,options,limits);check();input.check();
 const fresh=await input.port.checkAssets({references,uploads:uploadIds},options.signal);check();input.check();if(!same(fresh,provider))throw fail('metadata_packet_retention_changed');return frozen({kind:'retained',files});
}
