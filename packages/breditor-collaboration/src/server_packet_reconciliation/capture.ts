/** Reference-only current read: the genuine server supplies complete Native
 * dependency knowledge. No server packet body or raster download is requested. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {PreparedLocalMetadataReconciliation} from '../selected_local_metadata_assets/reconciliation_input.js';
import type {LocalMetadataReconciliationRead} from '../selected_local_metadata_assets/reconciliation_contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {NativeSourceVersionKnowledge} from '../server_packet_source_resolution/contract.js';
import type {readLocalMetadataUploadInventory} from '../selected_local_metadata_assets/upload_inventory.js';
import {localMetadataAssetInfo} from '../selected_local_metadata_assets/upload_inventory.js';
import type {CurrentLocalPacketReferences,ServerPacketReconciliationRead} from './contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {captureSelectedServerNativeDependencies,withCheckedServerNativeDependencies} from '../server_native_dependencies/collect.js';
import {composeCurrentServerPacketSources} from './sources.js';
import {composeServerPacketReconciliation} from './compose.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export async function captureCurrentServerPacketReconciliation(original:LocalMetadataReconciliationRead,base:LocalMetadataReferenceCut,input:PreparedLocalMetadataReconciliation,readLocal:()=>Promise<CurrentLocalPacketReferences>,readVersions:()=>Promise<NativeSourceVersionKnowledge>,readUploads:()=>ReturnType<typeof readLocalMetadataUploadInventory>,options:SharedArchiveIntegrityOptions&{readonly signal:AbortSignal},check:()=>void):Promise<ServerPacketReconciliationRead>{
 check();input.check();const native=await captureSelectedServerNativeDependencies(input.host,options.signal);check();if(!same(native.selection,input.port.selection.current)||!same(input.port.selection,original.legacy.native.control))throw fail();
 return withCheckedServerNativeDependencies(native,async()=>{
  const integrity=prepareArchiveIntegrity({...options,checkAuthority:check}),nativeResponseSha256=await integrity.digest(new Blob([JSON.stringify(native)]));check();const local=await readLocal();check();const versions=await readVersions();check();
  const sources=composeCurrentServerPacketSources(base,local,versions,native,{references:{bytes:original.assets.references.references.bytes,sha256:original.assets.references.references.sha256},nativeResponseSha256});let currentProvider:ServerPacketReconciliationRead['currentProvider']=null;
  if(sources.outcome.kind==='ready'){
   const uploads=await readUploads();check();if(!same(uploads.pins,original.assets.availability.uploads))throw fail();const requirements={references:sources.outcome.references,uploads:[...uploads.assets.keys()].sort()},read=await input.port.checkAssets(requirements,options.signal);check();input.check();
   for(const actual of read.assets){const known=uploads.assets.get(actual.asset);if(known&&localMetadataAssetInfo(known)!==localMetadataAssetInfo(actual))throw fail();}
   const fresh=await input.port.checkAssets(requirements,options.signal);check();input.check();if(!same(read,fresh))throw fail('metadata_packet_retention_changed');currentProvider={requirements,uploads:uploads.pins,read};
  }
  const result=composeServerPacketReconciliation(original,sources,currentProvider);check();input.check();return result;
 });
}
