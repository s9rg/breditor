/** Preserve both independently selected files inside the same source-owned
 * finite capture. No recorded control JSON is used as live host authority. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveHex} from '../archive_integrity/policy.js';
import type {LocalMetadataRecoverableBundle} from './recoverable_contract.js';
import type {LocalMetadataRecoveryBytesBundle} from './recovery_bytes_contract.js';
import type {PreparedRecoveryServerInputs} from './recovery_server_inputs.js';
import {fail} from './error.js';
export async function captureLocalMetadataRecoveryFiles(recoverable:LocalMetadataRecoverableBundle,selected:PreparedRecoveryServerInputs,options:SharedArchiveIntegrityOptions,check:()=>void,checkHost:()=>Promise<void>):Promise<LocalMetadataRecoveryBytesBundle>{
 const files=await captureLocalMetadataSelectedServerFiles(selected,options,check,checkHost);
 return Object.freeze({format:'breditor/selected-local-metadata-recovery-bytes-bundle',formatVersion:1,scope:'complete-client-metadata-assets-and-selected-server-files',recoverable,...files});
}
/** Shared exact-file read; additional formats cannot relabel themselves as the
 * original V2 raster bundle. Both callers retain the same original file bytes. */
export async function captureLocalMetadataSelectedServerFiles(selected:PreparedRecoveryServerInputs,options:SharedArchiveIntegrityOptions,check:()=>void,checkHost:()=>Promise<void>):Promise<Pick<LocalMetadataRecoveryBytesBundle,'server'|'inventory'>>{
 const guard=()=>{check();selected.check();},integrity=prepareArchiveIntegrity({...options,checkAuthority:guard});guard();await checkHost();guard();
 const serverSha=archiveHex(selected.identity.archiveSha256),inventorySha=archiveHex(selected.participants.sha256);
 if(await integrity.digest(selected.server)!==serverSha)throw fail('local_metadata_assets_state');guard();
 if(await integrity.digest(selected.inventory)!==inventorySha)throw fail('local_metadata_assets_state');guard();await checkHost();guard();
 return Object.freeze({server:Object.freeze({file:selected.server,bytes:selected.server.size,sha256:serverSha,identity:selected.identity}),inventory:Object.freeze({file:selected.inventory,bytes:selected.inventory.size,sha256:inventorySha,identity:selected.participants})});
}
