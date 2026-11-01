/** Capture additional verified source knowledge under the genuine metadata
 * task and selected server. Original downloads, receipts and queues stay literal. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataPacketRetentionBundle} from '../metadata_packet_retention/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {PreparedMetadataPacketRecoveryInput} from '../metadata_packet_retention/recovery_input.js';
import type {readLocalMetadataUploadInventory} from '../selected_local_metadata_assets/upload_inventory.js';
import {captureClientServerPacketRecovery} from '../server_packet_recovery/capture.js';
import {captureServerPacketAssets} from '../server_packet_recovery/capture_assets.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {captureSelectedServerNativeDependencies,withCheckedServerNativeDependencies} from '../server_native_dependencies/collect.js';
import {resolveServerPacketSources} from './resolve.js';
import {encodeSourceResolution} from './file.js';
import type {NativeSourceVersionKnowledge,ResolvedServerPacketRecoveryOutcome} from './contract.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export async function captureResolvedClientServerPacketRecovery(packets:LocalMetadataPacketRetentionBundle,base:LocalMetadataReferenceCut,input:PreparedMetadataPacketRecoveryInput,readUploads:()=>ReturnType<typeof readLocalMetadataUploadInventory>,readVersions:()=>Promise<NativeSourceVersionKnowledge>,options:SharedArchiveIntegrityOptions&{readonly signal:AbortSignal},check:()=>void):Promise<ResolvedServerPacketRecoveryOutcome>{
 let uploads:ReturnType<typeof readLocalMetadataUploadInventory>|undefined;const allUploads=()=>uploads??=readUploads();
 check();const previous=await captureClientServerPacketRecovery(packets,base,input,allUploads,options,check);check();const original=previous.bundle,versions=await readVersions();check();
 const native=await captureSelectedServerNativeDependencies(input.reconciliation.host,options.signal);check();if(!same(native.selection,input.reconciliation.port.selection.current)||!same(native.native.source,input.selected.identity.native)||await original.dependencies.file.text()!==JSON.stringify(native))throw fail();check();
 return withCheckedServerNativeDependencies(native,async()=>{
  const parent={references:{bytes:packets.references.references.bytes,sha256:packets.references.references.sha256},packets:{bytes:packets.packets.manifest.bytes,sha256:packets.packets.manifest.sha256},dependencies:{bytes:original.dependencies.bytes,sha256:original.dependencies.sha256}},archive=await MetadataPacketArchive.read(packets.packets,parent.references,options);check();
  let resolution;try{if(!same(archive.header().catalog.selection,native.selection))throw fail();resolution=resolveServerPacketSources(base,archive.header(),packets.requirements,native.native,versions,parent);}finally{archive.dispose();}
  const file=await encodeSourceResolution(resolution,{...options,checkAuthority:check});check();const assets=await captureServerPacketAssets(packets,original.dependencies,resolution,await allUploads(),input.reconciliation,input.transport,options,input.options,check);check();input.selected.check();input.reconciliation.check();
  const bundle=Object.freeze({format:'breditor/selected-local-resolved-server-packet-recovery-bundle' as const,formatVersion:1 as const,scope:'literal-original-recovery-plus-verified-native-source-and-raster-resolution' as const,original,resolution:file,assets});return Object.freeze({kind:assets.kind==='retained'?'retained':'pending',bundle});
 });
}
