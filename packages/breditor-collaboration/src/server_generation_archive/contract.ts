/** Complete generation server selections, never native replay, account auth or activation proof. */
import type {SharedServerLogGenerationBackupIdentity} from "../server_generation_inventory/contract.js";
export interface SharedServerLogGenerationAssetBackupIdentity {readonly binding:string;readonly archiveSha256:readonly number[];readonly assets:number;readonly bytes:number}
export interface SharedServerLogGenerationRoomBackupIdentity {readonly native:SharedServerLogGenerationBackupIdentity;readonly assets:SharedServerLogGenerationAssetBackupIdentity;readonly archiveSha256:readonly number[]}
export interface SharedServerLogGenerationArchiveMetadata {
 readonly format:"breditor/server-log-generation-room-backup";readonly formatVersion:1;
 readonly identity:SharedServerLogGenerationRoomBackupIdentity;
 readonly bytes:number;readonly nativeBytes:number;readonly rasterArchiveBytes:number;
}
