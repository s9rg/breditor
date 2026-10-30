/** Packet byte digests are distinct from native domain-separated content identities. */
import {archiveFields} from '../archive_integrity/policy.js';
import {digest} from '../relay/validation.js';
import {fail} from './policy.js';
import type {OriginalPacketFingerprint} from './contract.js';
export function metadataFingerprints(input:unknown,ids:readonly string[]):readonly OriginalPacketFingerprint[]{
 if(!Array.isArray(input)||input.length!==ids.length||ids.length>64||new Set(ids).size!==ids.length)throw fail();
 return input.map((entry,index)=>{const r=archiveFields(entry,'id,bytes,sha256'),id=digest(r['id']),sha256=digest(r['sha256']),bytes=r['bytes'];if(id!==ids[index]||typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<1)throw fail();return{id,bytes,sha256};});
}
