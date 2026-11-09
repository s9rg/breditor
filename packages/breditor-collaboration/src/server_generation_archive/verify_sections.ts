/** Check the whole archive and its partitions from one bounded sequence of bytes. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {withArchiveDigest} from '../archive_integrity/digest_owner.js';
import {archiveFailure,archiveHex,MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES as CHUNK} from '../archive_integrity/policy.js';
import type {SharedServerLogGenerationRoomBackupIdentity} from './contract.js';
import {SERVER_GENERATION_ARCHIVE_PREFIX_BYTES as PREFIX} from './framing.js';
import {serverGenerationHeader} from './header.js';

export async function verifyServerGenerationSections(
 file:Blob,
 framing:Uint8Array,
 selected:SharedServerLogGenerationRoomBackupIdentity,
 context:ArchiveIntegrityContext,
){
 const {wasm:{SharedArchiveDigest:digest},guard}=context;
 const encoded=framing.subarray(PREFIX);
 const expectedHeader=archiveHex([...framing.subarray(PREFIX-32,PREFIX)]);
 const actualHeader=await withArchiveDigest(digest.create,encoded.byteLength,guard,async update=>update(encoded));
 if(actualHeader!==expectedHeader)throw archiveFailure();
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(encoded);}
 catch{throw archiveFailure('archive_policy');}
 const header=serverGenerationHeader(text,file.size-framing.byteLength,selected);
 const actual=await withArchiveDigest(digest.create,file.size,guard,async updateWhole=>{
  updateWhole(framing);
  let offset=framing.byteLength;
  for(const section of [header.log,header.rasters]){
   const end=offset+section.bytes;
   const actualSection=await withArchiveDigest(digest.create,section.bytes,guard,async updateSection=>{
    while(offset<end){
     const count=Math.min(CHUNK,end-offset);
     const bytes=(await context.read(file,offset,count)).slice();
     updateWhole(bytes);
     updateSection(bytes);
     offset+=count;
    }
   });
   if(actualSection!==archiveHex(section.sha256))throw archiveFailure();
  }
 });
 if(actual!==archiveHex(selected.archiveSha256))throw archiveFailure();
 return {nativeBytes:header.log.bytes,rasterArchiveBytes:header.rasters.bytes};
}
