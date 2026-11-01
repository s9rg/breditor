/** The historical report contains a second complete reference envelope. Admit
 * all five immutable file slots against the same selected files; matching JSON
 * counters cannot hide a different nested Blob under an unchanged digest. */
import type {LocalMetadataReferenceBundle} from '../selected_local_metadata_assets/room_contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export async function inspectRecordedReferenceCopy(primary:LocalMetadataReferenceBundle,copy:LocalMetadataReferenceBundle,options:SharedArchiveIntegrityOptions,check:()=>void):Promise<void>{
 check();if(!same(primary,copy))throw fail();const integrity=prepareArchiveIntegrity(options),p=copy.parent.parent;
 const files=[copy.references,copy.parent.metadata,p.delivery,{file:p.current.file,bytes:p.current.selection.bytes,sha256:p.current.selection.sha256},{file:p.prepared.file,bytes:p.prepared.choice.before.bytes,sha256:p.prepared.choice.before.sha256}];
 for(const row of files){check();if(row.file.size!==row.bytes||await integrity.digest(row.file)!==row.sha256)throw fail();check();}
}
