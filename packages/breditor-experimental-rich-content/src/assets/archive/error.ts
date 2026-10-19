/** Payload-redacted archive refusal. A failed import never authorizes an overwrite retry. */
export class RichAssetBackupError extends Error {
 constructor(readonly code:"asset_backup_format"|"asset_backup_budget"|"asset_backup_integrity"|"asset_backup_raster"|"asset_backup_storage"|"asset_backup_destination_exists"|"asset_backup_policy"|"asset_backup_aborted",message:string){super(message);this.name="RichAssetBackupError";}
}
export function checkAssetBackupSignal(signal?:AbortSignal):void{if(signal?.aborted)throw new RichAssetBackupError("asset_backup_aborted","Asset archive work was cancelled");}
