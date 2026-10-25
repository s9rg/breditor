/** Managed selected-store facade. Tracks actual returned async jobs so closing
 * can settle them before releasing namespace custody. Never exposes the raw
 * store, starts implicit uploads, evicts bytes or promotes a receipt. */
import {RichAssetStore,type AssetUploader} from '@breditor/experimental-rich-content';
const methods={ingest:RichAssetStore.prototype.ingest,cacheRemote:RichAssetStore.prototype.cacheRemote,get:RichAssetStore.prototype.get,list:RichAssetStore.prototype.list,blob:RichAssetStore.prototype.blob,resolve:RichAssetStore.prototype.resolve,cancel:RichAssetStore.prototype.cancel,retry:RichAssetStore.prototype.retry,flush:RichAssetStore.prototype.flush};
export interface SelectedAssetPort{
 ingest(file:Blob):ReturnType<RichAssetStore['ingest']>;
 cacheRemote(asset:string,file:Blob,storageRef:string):ReturnType<RichAssetStore['cacheRemote']>;
 get(asset:string):ReturnType<RichAssetStore['get']>;
 list():ReturnType<RichAssetStore['list']>;
 blob(asset:string):ReturnType<RichAssetStore['blob']>;
 resolve(asset:string):ReturnType<RichAssetStore['resolve']>;
 cancel(asset:string):ReturnType<RichAssetStore['cancel']>;
 retry(asset:string):ReturnType<RichAssetStore['retry']>;
 flush(uploader:AssetUploader):Promise<void>;
}
export function selectedAssetPort(store:RichAssetStore,check:()=>void){
 const pending=new Set<Promise<unknown>>();
 const use=<T>(work:()=>Promise<T>):Promise<T>=>{let result:Promise<T>;try{check();result=work();}catch(error){return Promise.reject(error);}pending.add(result);void result.then(()=>pending.delete(result),()=>pending.delete(result));return result;};
 const port:SelectedAssetPort=Object.freeze({
  ingest:(file:Blob)=>use(()=>methods.ingest.call(store,file)),
  cacheRemote:(asset:string,file:Blob,storageRef:string)=>use(()=>methods.cacheRemote.call(store,asset,file,storageRef)),
  get:(asset:string)=>use(()=>methods.get.call(store,asset)),list:()=>use(()=>methods.list.call(store)),
  blob:(asset:string)=>use(()=>methods.blob.call(store,asset)),resolve:(asset:string)=>use(()=>methods.resolve.call(store,asset)),
  cancel:(asset:string)=>use(()=>methods.cancel.call(store,asset)),retry:(asset:string)=>use(()=>methods.retry.call(store,asset)),
  flush:(uploader:AssetUploader)=>use(()=>methods.flush.call(store,uploader)),
 });
 return Object.freeze({port,async settle(){while(pending.size)await Promise.allSettled([...pending]);}});
}
