/** One genuine source-owned capture. Server knowledge is captured through its
 * actual private host port and pinned to exact selected server/inventory bytes.
 * It never changes the original packet/reference result or settles client work. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {LocalMetadataPacketRetentionBundle} from '../metadata_packet_retention/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {PreparedMetadataPacketRecoveryInput} from '../metadata_packet_retention/recovery_input.js';
import type {readLocalMetadataUploadInventory} from '../selected_local_metadata_assets/upload_inventory.js';
import {captureSelectedServerNativeDependencies,withCheckedServerNativeDependencies} from '../server_native_dependencies/collect.js';
import {MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES} from '../server_native_dependencies/contract.js';
import {captureLocalMetadataSelectedServerFiles} from '../selected_local_metadata_assets/recovery_bytes_capture.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {composeServerPacketClosure} from './closure.js';
import {captureServerPacketAssets} from './capture_assets.js';
import type {ServerPacketRecoveryOutcome} from './contract.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export async function captureClientServerPacketRecovery(packets:LocalMetadataPacketRetentionBundle,base:LocalMetadataReferenceCut,input:PreparedMetadataPacketRecoveryInput,readUploads:()=>ReturnType<typeof readLocalMetadataUploadInventory>,options:SharedArchiveIntegrityOptions&{readonly signal:AbortSignal},check:()=>void):Promise<ServerPacketRecoveryOutcome>{
 check();input.selected.check();input.reconciliation.check();
 const native=await captureSelectedServerNativeDependencies(input.reconciliation.host,options.signal);check();
 if(!same(native.selection,input.reconciliation.port.selection.current)||!same(native.native.source,input.selected.identity.native))throw fail();
 return withCheckedServerNativeDependencies(native,async()=>{
  const files=await captureLocalMetadataSelectedServerFiles(input.selected,options,check,()=>input.reconciliation.port.check(options.signal));check();
  const parent={bytes:packets.references.references.bytes,sha256:packets.references.references.sha256},archive=await MetadataPacketArchive.read(packets.packets,parent,options);check();
  let closure;try{if(!same(archive.header().catalog.selection,native.selection))throw fail();closure=composeServerPacketClosure(base,archive.header(),packets.requirements,native.native,parent);}finally{archive.dispose();}
  const file=new Blob([JSON.stringify(native)],{type:'application/vnd.breditor.server-native-dependencies+json'});if(file.size>MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES)throw fail('metadata_packet_retention_budget');
  const integrity=prepareArchiveIntegrity({...options,checkAuthority:check}),dependencies=Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)});check();
  const uploads=await readUploads();check();const assets=await captureServerPacketAssets(packets,dependencies,closure,uploads,input.reconciliation,input.transport,options,input.options,check);check();input.selected.check();input.reconciliation.check();
  const bundle=Object.freeze({format:'breditor/selected-local-server-packet-recovery-bundle' as const,formatVersion:1 as const,scope:'client-history-original-packets-complete-server-native-and-selected-files' as const,packets,dependencies,closure,assets,...files});return Object.freeze({kind:assets.kind==='retained'?'retained':'pending',bundle});
 });
}
