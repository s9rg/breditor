/** Canonical gap-free outer native framing. Actual component replay/decoding stays native. */
import {digestBytes,frozen} from "../room_participant_inventory/policy.js";
import {serverLogGenerationIdentity} from "../server_generation_inventory/identity.js";
import {archiveFailure,archiveFields as object,archiveInteger,archiveHex} from "../archive_integrity/policy.js";
import {serverGenerationAssetIdentity} from "./identity.js";
import {MAX_SHARED_SERVER_LOG_GENERATION_BACKUP_BYTES,MAX_SHARED_SERVER_RASTER_BACKUP_BYTES} from "./framing.js";
import type {SharedServerLogGenerationRoomBackupIdentity} from "./contract.js";
interface Section {readonly offset:number;readonly bytes:number;readonly sha256:readonly number[]}
function section(value:unknown,offset:number,maximum:number):Section{const r=object(value,"offset,bytes,sha256");if(r["offset"]!==offset)throw archiveFailure();return{offset,bytes:archiveInteger(r["bytes"],1,maximum),sha256:digestBytes(r["sha256"])};}
export function serverGenerationHeader(text:string,bodyBytes:number,expected:SharedServerLogGenerationRoomBackupIdentity){
 try{
  const r=object(JSON.parse(text),"format,formatVersion,native,assets,log,rasters");if(r["format"]!=="breditor/server-log-generation-room-backup"||r["formatVersion"]!==1)throw archiveFailure();
  const native=serverLogGenerationIdentity(r["native"]),assets=serverGenerationAssetIdentity(r["assets"]),log=section(r["log"],0,MAX_SHARED_SERVER_LOG_GENERATION_BACKUP_BYTES),rasters=section(r["rasters"],log.bytes,MAX_SHARED_SERVER_RASTER_BACKUP_BYTES);
  const header={format:r["format"],formatVersion:1,native,assets,log,rasters};
  if(JSON.stringify(header)!==text||JSON.stringify(native)!==JSON.stringify(expected.native)||JSON.stringify(assets)!==JSON.stringify(expected.assets)||native.source.assetBinding!==assets.binding||archiveHex(log.sha256)!==archiveHex(native.archiveSha256)||archiveHex(rasters.sha256)!==archiveHex(assets.archiveSha256)||log.bytes+rasters.bytes!==bodyBytes)throw archiveFailure();return frozen(header);
 }catch{throw archiveFailure("archive_integrity");}
}
