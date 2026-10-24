/** One immutable raster/queue continuity edge. Upload decisions belong between
 * edges, never inside this check; existing uploaded receipts stay immutable. */
import {importAssetBackup} from '../archive/import_backup.js';
import {sameAssetPayload} from '../reconciliation/plan.js';
import type {AssetLimits} from '../types.js';
import {RichAssetBaseError} from './contract.js';
export async function verifyAssetBaseContinuity(prior:Blob,current:Blob,limits:Readonly<AssetLimits>,check:()=>void,signal?:AbortSignal):Promise<void>{
 check();const before=await importAssetBackup(prior,limits,signal);check();const after=await importAssetBackup(current,limits,signal);check();const byId=new Map(after.map(row=>[row.asset,row]));
 for(const old of before){const now=byId.get(old.asset);if(!now||!sameAssetPayload(old,now)||now.epoch<old.epoch||now.attempts<old.attempts||old.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==old.storageRef))throw new RichAssetBaseError('asset_base_predecessor','The current whole upload state does not extend its selected prior baseline');}check();
}
