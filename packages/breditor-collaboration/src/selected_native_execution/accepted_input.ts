/** Saved response data is NOT historical authentication. Reauthenticate every
 * original request against the independently pinned live host before admission.
 * Only current reader role may differ; it never changes recipient permissions. */
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import {SelectedNativeImportArchive} from '../selected_native_import/archive.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedPhysicalRecoveryAcceptedRead} from '../physical_recovery_control/accepted_contract.js';
import {fail} from './policy.js';
const manifest=SelectedNativeImportArchive.prototype.manifest,read=SelectedNativeImportArchive.prototype.readPage;
function payload(value:SharedPhysicalRecoveryAcceptedRead){if(value.review===null)return value;const{currentRole,...historical}=value.review;return{...value,review:historical};}
export async function verifyAuthenticatedExecutionInput(archive:SelectedNativeImportArchive,host:SharedPhysicalRoomRecoveryHost,integrity:SharedArchiveIntegrityOptions):Promise<void>{const port=physicalRecoveryHostPort(host),selected=manifest.call(archive);if(JSON.stringify(selected.server)!==JSON.stringify(port.selection))throw fail('native_execution_policy');for(const[index,row]of selected.pages.entries()){integrity.checkAuthority();const stored=await read.call(archive,index,integrity),fresh=await port.readAcceptedNative(row.request,integrity.signal);integrity.checkAuthority();if(JSON.stringify(payload(stored))!==JSON.stringify(payload(fresh)))throw fail('native_execution_integrity');}}
