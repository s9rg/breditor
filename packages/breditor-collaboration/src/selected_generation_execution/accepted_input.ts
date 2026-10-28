/** Saved response data is NOT historical authentication. Reauthenticate every
 * original request against the independently pinned live host before admission.
 * Only current reader role may differ; it never changes recipient permissions. */
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {SelectedGenerationNativeImportArchive} from '../selected_generation_import/archive.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedServerLogGenerationRecoveryAcceptedRead} from '../generation_recovery_control/accepted_contract.js';
import {fail} from './policy.js';
const manifest=SelectedGenerationNativeImportArchive.prototype.manifest,read=SelectedGenerationNativeImportArchive.prototype.readPage;
function payload(value:SharedServerLogGenerationRecoveryAcceptedRead){if(value.review===null)return value;const{currentRole,...historical}=value.review;return{...value,review:historical};}
export async function verifyAuthenticatedExecutionInput(archive:SelectedGenerationNativeImportArchive,host:SharedServerLogGenerationRecoveryHost,integrity:SharedArchiveIntegrityOptions):Promise<void>{const port=generationRecoveryHostPort(host),selected=manifest.call(archive);if(JSON.stringify(selected.server)!==JSON.stringify(port.selection))throw fail('generation_native_execution_policy');for(const[index,row]of selected.pages.entries()){integrity.checkAuthority();const stored=await read.call(archive,index,integrity),fresh=await port.readAcceptedNative(row.request,integrity.signal);integrity.checkAuthority();if(JSON.stringify(payload(stored))!==JSON.stringify(payload(fresh)))throw fail('generation_native_execution_integrity');}}
