/** Closed complete source pins. The incoming file cannot choose its own trusted selection. */
import {nativeRoomCut} from "../room_participant_inventory/native_cut.js";
import {nativeInventoryMetadata} from "../room_participant_inventory/parse.js";
import {digestBytes,frozen,invalid} from "../room_participant_inventory/policy.js";
import {generationInventoryObject as object,MAX_SHARED_SERVER_LOG_GENERATION_RECORDS} from "./policy.js";
import type {SharedServerLogGenerationBackupIdentity,SharedServerLogGenerationParticipantIdentity,SharedServerLogGenerationParticipantMetadata} from "./contract.js";
export function serverLogGenerationIdentity(value:unknown):SharedServerLogGenerationBackupIdentity {
 const r=object(value,"source,manifest,archiveSha256");
 return frozen({source:nativeRoomCut(r["source"],MAX_SHARED_SERVER_LOG_GENERATION_RECORDS),manifest:digestBytes(r["manifest"]),archiveSha256:digestBytes(r["archiveSha256"])});
}
export function serverGenerationParticipantIdentity(value:unknown):SharedServerLogGenerationParticipantIdentity {
 try{const r=object(value,"source,sha256");return frozen({source:serverLogGenerationIdentity(r["source"]),sha256:digestBytes(r["sha256"])});}catch{throw invalid();}
}
export function serverGenerationParticipantMetadata(value:unknown):SharedServerLogGenerationParticipantMetadata {
 const r=object(value,"format,formatVersion,source,native");
 if(r["format"]!=="breditor/server-log-generation-participants"||r["formatVersion"]!==1)throw invalid();
 const source=serverLogGenerationIdentity(r["source"]),native=nativeInventoryMetadata(r["native"],value=>nativeRoomCut(value,MAX_SHARED_SERVER_LOG_GENERATION_RECORDS));
 if(JSON.stringify(source.source)!==JSON.stringify(native.room))throw invalid();
 return frozen({format:r["format"],formatVersion:1,source,native});
}
