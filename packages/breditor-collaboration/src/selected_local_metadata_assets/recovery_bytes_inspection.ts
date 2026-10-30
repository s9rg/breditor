/** Re-admit selected server/inventory file bytes after actual client Native
 * replay. This does not claim a browser-side replay of the new server or a
 * current authenticated controller; recorded selections remain DATA only. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveHex} from '../archive_integrity/policy.js';
import {SharedServerLogGenerationRoomArchive as Server} from '../server_generation_archive/read.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import type {LocalMetadataRecoverableInspection} from './recoverable_contract.js';
import type {LocalMetadataRecoveryBytesBundle,LocalMetadataRecoveryBytesInspection} from './recovery_bytes_contract.js';
import {recoveryBytesServerSelection} from './recovery_server_inputs.js';
import {fail} from './error.js';
const server={read:Server.read,metadata:Server.prototype.metadata,dispose:Server.prototype.dispose},inventory={read:Inventory.read,dispose:Inventory.prototype.dispose};
export async function inspectLocalMetadataRecoveryFiles(bundle:LocalMetadataRecoveryBytesBundle,recoverable:LocalMetadataRecoverableInspection,options:SharedArchiveIntegrityOptions,check:()=>void):Promise<LocalMetadataRecoveryBytesInspection>{
 const selected=recoveryBytesServerSelection(recoverable.recordedAvailability.control),integrity=prepareArchiveIntegrity({...options,checkAuthority:check});check();
 if(!equal(bundle.server.identity,selected.server)||!equal(bundle.inventory.identity,selected.participants)||!equal(bundle.inventory.identity.source,bundle.server.identity.native)||bundle.server.sha256!==archiveHex(selected.server.archiveSha256)||bundle.inventory.sha256!==archiveHex(selected.participants.sha256))throw fail('local_metadata_assets_state');
 if(bundle.server.file.size!==bundle.server.bytes||bundle.inventory.file.size!==bundle.inventory.bytes||await integrity.digest(bundle.server.file)!==bundle.server.sha256)throw fail('local_metadata_assets_state');check();
 if(await integrity.digest(bundle.inventory.file)!==bundle.inventory.sha256)throw fail('local_metadata_assets_state');check();
 let admittedServer:Server|undefined,admittedInventory:Inventory|undefined;
 try{
  admittedServer=await server.read.call(Server,bundle.server.file,selected.server,options);check();
  admittedInventory=await inventory.read.call(Inventory,bundle.inventory.file,selected.participants,{...(options.signal?{signal:options.signal}:{})});check();const metadata=server.metadata.call(admittedServer);
  return frozen({format:'breditor/selected-local-metadata-recovery-bytes-inspection',formatVersion:1,scope:'native-client-cut-and-recorded-server-byte-selection',recoverable,server:{identity:selected.server,bytes:bundle.server.bytes,sha256:bundle.server.sha256,nativeBytes:metadata.nativeBytes,rasterArchiveBytes:metadata.rasterArchiveBytes},inventory:{identity:selected.participants,bytes:bundle.inventory.bytes,sha256:bundle.inventory.sha256}});
 }finally{if(admittedInventory)inventory.dispose.call(admittedInventory);if(admittedServer)server.dispose.call(admittedServer);}
}
