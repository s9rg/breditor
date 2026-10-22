/** Valid framing around deliberately inconsistent opaque native strings. Outer
 * digests are recomputed so semantic refusals cannot be mistaken for hash checks. */
import {createHash} from 'node:crypto';
export function remapLocalPortableParts(header,rename){
 const part=value=>{const next=rename.get(value);if(next===undefined)throw Error('Test frame lost an actual part');return next;};for(const cut of [header.current,header.pending])if(cut){cut.head=part(cut.head);for(const file of cut.files)file.part=part(file.part);}for(const row of header.live)row.part=part(row.part);header.uploads=part(header.uploads);for(const row of header.assets)row.part=part(row.part);
}
export async function reframeLocalPortable(backup,codec,mutate){
 const{LOCAL_OPERATION_BACKUP_MAGIC:magic,LOCAL_OPERATION_BACKUP_PREFIX_BYTES:prefixBytes,LOCAL_OPERATION_BACKUP_MIME:mime,localOperationManifestDigest:digest}=codec,file=backup.file(),prefix=new Uint8Array(await file.slice(0,prefixBytes).arrayBuffer()),length=new DataView(prefix.buffer).getUint32(magic.length),start=prefixBytes+length,header=backup.metadata(),parts=header.parts.map(row=>file.slice(start+row.offset,start+row.offset+row.bytes));await mutate(header,parts);let offset=0;header.parts=[];
 for(const blob of parts){header.parts.push({offset,bytes:blob.size,sha256:createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex')});offset+=blob.size;}delete header.manifestSha256;const manifestSha256=await digest(header),encoded=new TextEncoder().encode(JSON.stringify({...header,manifestSha256})),next=new Uint8Array(prefixBytes);next.set(magic);new DataView(next.buffer).setUint32(magic.length,encoded.length);return{file:new Blob([next,encoded,...parts],{type:mime}),selection:{original:backup.selection().original,manifestSha256}};
}
