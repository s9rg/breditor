/** Data conservation shared by capture/read/upload custody. Matching hashes do
 * not permit dropping queued rows or rewriting completed immutable receipts. */
import type {RichAssetArchiveEntry} from '@breditor/experimental-rich-content';
export function checkNativeInputUploadContinuation(previous:readonly RichAssetArchiveEntry[],actual:readonly RichAssetArchiveEntry[],refuse:()=>never):void{const rows=new Map(actual.map(row=>[row.asset,row]));for(const before of previous){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))refuse();}}
