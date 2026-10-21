/** Complete selected opaque native/raster transport. Never a native replay or activation proof. */
import {prepareArchiveIntegrity} from "../archive_integrity/context.js";
import {archiveBlob,archiveFailure,archiveHex,SharedArchiveIntegrityError} from "../archive_integrity/policy.js";
import {frozen} from "../room_participant_inventory/policy.js";
import {serverGenerationRoomIdentity} from "./identity.js";
import {serverGenerationHeader} from "./header.js";
import {SERVER_GENERATION_ARCHIVE_MAGIC as MAGIC,SERVER_GENERATION_ARCHIVE_PREFIX_BYTES as PREFIX,MAX_SHARED_SERVER_GENERATION_ARCHIVE_HEADER_BYTES as MAX_HEADER,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES as MAX_BYTES} from "./framing.js";
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import type {SharedServerLogGenerationRoomBackupIdentity,SharedServerLogGenerationArchiveMetadata} from "./contract.js";
const token=Object.freeze({}),files=new WeakMap<SharedServerLogGenerationRoomArchive,Blob>();
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
  const prefix=await context.read(file,0,PREFIX);if(MAGIC.some((byte,index)=>byte!==prefix[index]))throw archiveFailure("archive_integrity");
  const headerSize=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(MAGIC.length);if(headerSize<1||headerSize>MAX_HEADER||PREFIX+headerSize>=file.size)throw archiveFailure("archive_budget");
  const headerFile=file.slice(PREFIX,PREFIX+headerSize);if(await context.digest(headerFile)!==archiveHex([...prefix.slice(MAGIC.length+4)]))throw archiveFailure("archive_integrity");
  let text:string;try{text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(await context.read(file,PREFIX,headerSize));}catch(error){if(error instanceof SharedArchiveIntegrityError)throw error;throw archiveFailure("archive_policy");}
  const body=PREFIX+headerSize,header=serverGenerationHeader(text,file.size-body,selected);
  if(await context.digest(file.slice(body,body+header.log.bytes))!==archiveHex(header.log.sha256)||await context.digest(file.slice(body+header.log.bytes))!==archiveHex(header.rasters.sha256)||await context.digest(file)!==archiveHex(selected.archiveSha256))throw archiveFailure("archive_integrity");
  context.guard();const metadata=frozen({format:"breditor/server-log-generation-room-backup" as const,formatVersion:1 as const,identity:selected,bytes:file.size,nativeBytes:header.log.bytes,rasterArchiveBytes:header.rasters.bytes});return new SharedServerLogGenerationRoomArchive(token,file,metadata);
 }
}
export const readSharedServerLogGenerationRoomArchive=(file:Blob,expected:SharedServerLogGenerationRoomBackupIdentity,options:SharedArchiveIntegrityOptions):Promise<SharedServerLogGenerationRoomArchive>=>SharedServerLogGenerationRoomArchive.read(file,expected,options);
