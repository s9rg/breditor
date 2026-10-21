/** Closed transport selections only. No source ancestry or native/raster semantic proof. */
import {digestBytes,frozen,hex} from "../room_participant_inventory/policy.js";
import {serverLogGenerationIdentity} from "../server_generation_inventory/identity.js";
import {archiveFailure,archiveFields as object,archiveInteger} from "../archive_integrity/policy.js";
import type {SharedServerLogGenerationAssetBackupIdentity,SharedServerLogGenerationRoomBackupIdentity} from "./contract.js";
export function serverGenerationAssetIdentity(value:unknown):SharedServerLogGenerationAssetBackupIdentity {
 const r=object(value,"binding,archiveSha256,assets,bytes"),assets=archiveInteger(r["assets"],0,1024),bytes=archiveInteger(r["bytes"],0,256*1024*1024);
 if((assets===0)!==(bytes===0))throw archiveFailure("archive_policy");
 return frozen({binding:hex(r["binding"],true),archiveSha256:digestBytes(r["archiveSha256"]),assets,bytes});
}
export function serverGenerationRoomIdentity(value:unknown):SharedServerLogGenerationRoomBackupIdentity {
 try{const r=object(value,"native,assets,archiveSha256"),native=serverLogGenerationIdentity(r["native"]),assets=serverGenerationAssetIdentity(r["assets"]);if(native.source.assetBinding!==assets.binding)throw archiveFailure();return frozen({native,assets,archiveSha256:digestBytes(r["archiveSha256"])});}catch{throw archiveFailure("archive_policy");}
}
