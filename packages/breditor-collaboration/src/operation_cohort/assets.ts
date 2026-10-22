/** Hold genuine whole-upload stores across a verified multi-owner handoff.
 * This is temporary current-SDK exclusion, not stored readiness or server authority. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetCustodyError} from '@breditor/experimental-rich-content';

const checkStore=RichAssetStore.prototype.checkOpen,acquire=RichAssetStore.prototype.acquireRecoveryCustody;
const checkLease=RichAssetStoreCustody.prototype.check,releaseLease=RichAssetStoreCustody.prototype.release,closeLease=RichAssetStoreCustody.prototype.close;
export interface OperationalAssetCustody {
 check():void;
 /** Final synchronous barrier, or abandonment. Actual stores retain their released promises. */
 release():void;
 /** Failed asynchronous preparation waits for every actual callback to finish. */
 close():Promise<void>;
}
export async function holdOperationalAssets(input:readonly RichAssetStore[]):Promise<OperationalAssetCustody>{
 if(!Array.isArray(input)||input.length>2048||new Set(input).size!==input.length)throw new RichAssetCustodyError('asset_custody_policy');
 const stores=[...input],leases:RichAssetStoreCustody[]=[];
 for(const store of stores)checkStore.call(store);
 let released=false;
 const release=()=>{if(released)return;released=true;for(const lease of [...leases].reverse())releaseLease.call(lease);};
 const close=async()=>{release();const results=await Promise.allSettled([...leases].reverse().map(lease=>closeLease.call(lease)));const errors=results.flatMap(row=>row.status==='rejected'?[row.reason]:[]);if(errors.length)throw new AggregateError(errors,'Actual upload custody cleanup did not finish');};
 try{
  for(const store of stores)leases.push(await acquire.call(store));
  const check=()=>{if(released)throw new RichAssetCustodyError('asset_custody_closed');for(const store of stores)checkStore.call(store);for(const lease of leases)checkLease.call(lease);};
  check();return Object.freeze({check,release,close});
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Upload custody admission and cleanup failed');}throw error;}
}
