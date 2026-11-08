/** Same immutable raster/queue conservation as a retained selected base, but
 * anchored to a later independently pinned whole upload cut. This does not
 * reconcile conflicts, authenticate a receipt or authorize any store mutation. */
import {RichAssetArchive,type AssetLimits} from '@breditor/experimental-rich-content';
import {fail} from '../physical_room_asset_adoption/policy.js';
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,blob=RichAssetArchive.prototype.blob,dispose=RichAssetArchive.prototype.dispose;
export async function verifySelectedUploadContinuation(prior:Blob,current:Blob,limits:Readonly<AssetLimits>,check:()=>void,signal?:AbortSignal):Promise<void>{
 check();const before=await read.call(RichAssetArchive,prior,{limits,...(signal?{signal}:{})});let after:RichAssetArchive|undefined;
 try{check();after=await read.call(RichAssetArchive,current,{limits,...(signal?{signal}:{})});check();const byId=new Map(entries.call(after).map(row=>[row.asset,row]));
  for(const old of entries.call(before)){const next=byId.get(old.asset);if(!next||next.mime!==old.mime||next.width!==old.width||next.height!==old.height||next.bytes!==old.bytes||next.epoch<old.epoch||next.attempts<old.attempts||old.status==='uploaded'&&(next.status!=='uploaded'||next.storageRef!==old.storageRef))throw fail('asset_adoption_diverged');const a=blob.call(before,old.asset),b=blob.call(after,old.asset);if(!a||!b)throw fail('asset_adoption_diverged');const left=new Uint8Array(await a.arrayBuffer()),right=new Uint8Array(await b.arrayBuffer());check();
   // Equal short reads cannot prove the retained raster bytes match.
   if(left.byteLength!==old.bytes||right.byteLength!==next.bytes||left.some((byte,i)=>byte!==right[i]))throw fail('asset_adoption_diverged');
  }check();
 }finally{if(after)dispose.call(after);dispose.call(before);}
}
