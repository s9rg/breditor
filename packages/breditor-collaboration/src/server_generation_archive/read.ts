/** Complete selected opaque native/raster transport. Never a native replay or activation proof. */
import {prepareArchiveIntegrity} from "../archive_integrity/context.js";
import {archiveBlob,archiveFailure} from "../archive_integrity/policy.js";
import {frozen} from "../room_participant_inventory/policy.js";
import {serverGenerationRoomIdentity} from "./identity.js";
import {verifyServerGenerationSections} from "./verify_sections.js";
import {SERVER_GENERATION_ARCHIVE_MAGIC as MAGIC,SERVER_GENERATION_ARCHIVE_PREFIX_BYTES as PREFIX,MAX_SHARED_SERVER_GENERATION_ARCHIVE_HEADER_BYTES as MAX_HEADER,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES as MAX_BYTES} from "./framing.js";
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import type {SharedServerLogGenerationRoomBackupIdentity,SharedServerLogGenerationArchiveMetadata} from "./contract.js";
const token=Object.freeze({}),files=new WeakMap<SharedServerLogGenerationRoomArchive,Blob>();
function headerSize(prefix:Uint8Array,fileBytes:number):number{
 if(MAGIC.some((byte,index)=>byte!==prefix[index]))throw archiveFailure("archive_integrity");
 const size=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(MAGIC.length);
 if(size<1||size>MAX_HEADER||PREFIX+size>=fileBytes)throw archiveFailure("archive_budget");
 return size;
}
/** Immutable byte-selected archive. Native replay, currentness, protected credentials,
 * client/provider closure and deployment fencing are separate requirements. */
export class SharedServerLogGenerationRoomArchive {
 readonly #metadata:SharedServerLogGenerationArchiveMetadata;
 private constructor(key:object,file:Blob,metadata:SharedServerLogGenerationArchiveMetadata){if(key!==token)throw archiveFailure("archive_closed");this.#metadata=metadata;files.set(this,file);Object.freeze(this);}
 identity():SharedServerLogGenerationRoomBackupIdentity{return this.#metadata.identity;}
 metadata():SharedServerLogGenerationArchiveMetadata{return this.#metadata;}
 file():Blob{const file=files.get(this);if(!file)throw archiveFailure("archive_closed");return file;}
 /** Release only this reader's file reference; no native owner, client or provider is touched. */
 dispose():void{files.delete(this);}
 static async read(input:Blob,expected:SharedServerLogGenerationRoomBackupIdentity,options:SharedArchiveIntegrityOptions):Promise<SharedServerLogGenerationRoomArchive>{
  // Select/copy before any awaited read; incoming header/whole digests never choose trust.
  const selected=serverGenerationRoomIdentity(expected),context=prepareArchiveIntegrity(options),file=archiveBlob(input,MAX_BYTES);context.guard();
  if(file.size<=PREFIX)throw archiveFailure("archive_integrity");
  const size=headerSize(await context.read(file,0,PREFIX),file.size);
  const body=PREFIX+size,framing=(await context.read(file,0,body)).slice();
  if(headerSize(framing,file.size)!==size)throw archiveFailure("archive_integrity");
  const sections=await verifyServerGenerationSections(file,framing,selected,context);
  context.guard();const metadata=frozen({format:"breditor/server-log-generation-room-backup" as const,formatVersion:1 as const,identity:selected,bytes:file.size,...sections});return new SharedServerLogGenerationRoomArchive(token,file,metadata);
 }
}
export const readSharedServerLogGenerationRoomArchive=(file:Blob,expected:SharedServerLogGenerationRoomBackupIdentity,options:SharedArchiveIntegrityOptions):Promise<SharedServerLogGenerationRoomArchive>=>SharedServerLogGenerationRoomArchive.read(file,expected,options);
