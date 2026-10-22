/** Cooperative current-SDK store exclusion. Bytes, hashes and saved flags never mint this lease. */
export class RichAssetCustodyError extends Error {
 constructor(readonly code:'asset_custody_policy'|'asset_custody_busy'|'asset_custody_closed'){super(code==='asset_custody_busy'?'A retained asset custody operation owns this store':code==='asset_custody_closed'?'The actual asset custody lease is closed':'Asset custody requires the current origin Web Locks host');this.name='RichAssetCustodyError';}
}
export type AssetCustodyLocks=Pick<LockManager,'request'>;
const nameOf=(name:string)=>`breditor/assets-custody/${name}`,key=Object.freeze({});
/** Ordinary mutations share this lane, so Cancel can still race safely with an upload's epoch. */
export async function withAssetMutationLock<T>(locks:AssetCustodyLocks|undefined,name:string,work:()=>Promise<T>):Promise<T>{
 if(!locks)return work();let entered=false;const result=await locks.request(nameOf(name),{mode:'shared',ifAvailable:true},async lock=>{entered=true;if(!lock)throw new RichAssetCustodyError('asset_custody_busy');return work();});if(!entered)throw new RichAssetCustodyError('asset_custody_policy');return result;
}
/** Reconciliation excludes every cooperating writer, not only uploads or its own handle. */
export async function withAssetExclusiveLock<T>(locks:AssetCustodyLocks|undefined,name:string,work:()=>Promise<T>):Promise<T>{
 if(!locks)throw new RichAssetCustodyError('asset_custody_policy');let entered=false;const result=await locks.request(nameOf(name),{mode:'exclusive',ifAvailable:true},async lock=>{entered=true;if(!lock)throw new RichAssetCustodyError('asset_custody_busy');return work();});if(!entered)throw new RichAssetCustodyError('asset_custody_policy');return result;
}
let issue:(locks:AssetCustodyLocks,name:string,check:()=>void,released:(owner:RichAssetStoreCustody)=>void)=>Promise<RichAssetStoreCustody>;
/** A genuine held lease. release is synchronous for the final no-await ownership barrier.
 * close additionally waits for the actual LockManager callback to finish during cleanup. */
export class RichAssetStoreCustody {
 readonly #check:()=>void;readonly #released:()=>void;readonly #release:()=>void;readonly #finished:Promise<void>;#held=true;
 private constructor(token:object,check:()=>void,released:()=>void,release:()=>void,finished:Promise<void>){if(token!==key)throw new RichAssetCustodyError('asset_custody_policy');this.#check=check;this.#released=released;this.#release=release;this.#finished=finished;Object.freeze(this);}
 static{issue=async(locks,name,check,released)=>{
  let accept!:(owner:RichAssetStoreCustody)=>void,reject!:(error:unknown)=>void,release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<RichAssetStoreCustody>((resolve,fail)=>{accept=resolve;reject=fail;});
  let entered=false;const finished=locks.request(nameOf(name),{mode:'exclusive',ifAvailable:true},async lock=>{entered=true;await Promise.resolve();if(!lock)throw new RichAssetCustodyError('asset_custody_busy');check();let owner!:RichAssetStoreCustody;owner=new RichAssetStoreCustody(key,check,()=>released(owner),release,finished);accept(owner);await held;});void finished.then(()=>{if(!entered)reject(new RichAssetCustodyError('asset_custody_policy'));},reject);return ready;
 };}
 check():void{if(!this.#held)throw new RichAssetCustodyError('asset_custody_closed');this.#check();if(!this.#held)throw new RichAssetCustodyError('asset_custody_closed');}
 #giveUp():void{if(!this.#held)return;this.#held=false;this.#released();this.#release();}
 release():void{this.#giveUp();}
 async close():Promise<void>{this.#giveUp();await this.#finished;}
}
const checkCustody=RichAssetStoreCustody.prototype.check,releaseCustody=RichAssetStoreCustody.prototype.release,closeCustody=RichAssetStoreCustody.prototype.close;
/** Internal module-initialized operations, never mutable public cleanup hooks. */
export const checkAssetStoreCustody=(owner:RichAssetStoreCustody):void=>checkCustody.call(owner);
export const releaseAssetStoreCustody=(owner:RichAssetStoreCustody):void=>releaseCustody.call(owner);
export const closeAssetStoreCustody=(owner:RichAssetStoreCustody):Promise<void>=>closeCustody.call(owner);
/** Internal actual-store factory only, not re-exported by the package root. */
export function acquireAssetStoreCustody(locks:AssetCustodyLocks|undefined,name:string,check:()=>void,released:(owner:RichAssetStoreCustody)=>void):Promise<RichAssetStoreCustody>{if(!locks)return Promise.reject(new RichAssetCustodyError('asset_custody_policy'));return issue(locks,name,check,released);}
