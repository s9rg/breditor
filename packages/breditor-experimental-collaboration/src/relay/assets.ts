import {accountToken} from "./registration.js";
import {SharedRelayError,digest,endpoint,object,timeout} from "./validation.js";
import type {SharedRelayAssetInfo,SharedRelayAssetsOptions} from "./asset_types.js";

const MAX_BYTES=10*1024*1024;
const mimes=new Set(["image/png","image/jpeg","image/webp"]);
const storageRef=(asset:string):string=>`breditor:relay-asset:1:${asset}`;
async function body(response:Response,maximum:number):Promise<ArrayBuffer>{
 const length=response.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximum))throw new SharedRelayError("asset_byte_budget");
 if(!response.body)throw new SharedRelayError("asset_empty_response");
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0,complete=false;
 try{while(true){const next=await reader.read();if(next.done){complete=true;break;}size+=next.value.byteLength;if(size>maximum)throw new SharedRelayError("asset_byte_budget");chunks.push(next.value);}
  const out=new Uint8Array(size);let at=0;for(const chunk of chunks){out.set(chunk,at);at+=chunk.byteLength;}return out.buffer;
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Opt-in cross-host raster transport. Local bytes are durable before document insertion;
 * server bytes have a separate receipt. Downloads are re-decoded/rehashed by the host cache,
 * never treated as local uploads. This class does not mutate an editor or own its cache. */
export class SharedRelayAssets {
 #options:SharedRelayAssetsOptions;#base:URL;#milliseconds:number;#closed=false;#online=true;
 #active=new Set<AbortController>();#downloads=new Map<string,Promise<string|undefined>>();
 #running=0;#waiting:{signal:AbortSignal;start:()=>void;cancel:()=>void}[]=[];
 constructor(options:SharedRelayAssetsOptions){
  const url=new URL(endpoint(options.endpoint));url.protocol=url.protocol==="wss:"?"https:":"http:";url.pathname=url.pathname.replace(/\/[^/]*$/,"/assets/");
  if(!options.principal||options.principal.length>128||new TextEncoder().encode(options.principal).length>128||/[\x00-\x1f\x7f]/.test(options.principal))throw new SharedRelayError("identity_invalid");
  this.#base=url;this.#options={...options};this.#milliseconds=timeout(options.requestTimeoutMs);
 }
 #live():void{if(this.#closed)throw new SharedRelayError("closed");}
 #slot(signal:AbortSignal):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
   const entry={signal,start:()=>{signal.removeEventListener("abort",entry.cancel);this.#running++;let released=false;resolve(()=>{if(released)return;released=true;this.#running--;const next=this.#waiting.shift();next?.start();});},cancel:()=>{const index=this.#waiting.indexOf(entry);if(index>=0)this.#waiting.splice(index,1);signal.removeEventListener("abort",entry.cancel);reject(new SharedRelayError("asset_cancelled"));}};
   if(signal.aborted){entry.cancel();return;}if(this.#running<4){entry.start();return;}
   if(this.#waiting.length>=64){reject(new SharedRelayError("asset_request_budget"));return;}
   this.#waiting.push(entry);signal.addEventListener("abort",entry.cancel,{once:true});
  });
 }
 async #request<T>(signal:AbortSignal|undefined,run:(headers:Headers,signal:AbortSignal)=>Promise<T>):Promise<T>{
  this.#live();if(!this.#online)throw new SharedRelayError("offline");if(this.#active.size>=68)throw new SharedRelayError("asset_request_budget");
  const controller=new AbortController(),abort=()=>controller.abort();this.#active.add(controller);signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)controller.abort();
  const timer=setTimeout(abort,this.#milliseconds);
  let release:(()=>void)|undefined;
  try{
   release=await this.#slot(controller.signal);
   const token=await accountToken(this.#options.getToken,controller.signal,this.#milliseconds);
   if(controller.signal.aborted)throw new SharedRelayError("asset_cancelled");
   const headers=new Headers({"Authorization":`Bearer ${token}`,"X-Breditor-Principal":this.#options.principal});
   const result=await run(headers,controller.signal);this.#live();if(controller.signal.aborted)throw new SharedRelayError("asset_cancelled");return result;
  }catch(error){if(error instanceof SharedRelayError)throw error;throw new SharedRelayError(controller.signal.aborted?"asset_cancelled":"asset_transfer_failed");}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);this.#active.delete(controller);release?.();}
 }
 #url(asset:string):string{return new URL(encodeURIComponent(digest(asset)),this.#base).href;}
 /** Compatible with RichAssetStore.flush; exact retries return the same stable storage reference. */
 readonly uploader=async(info:Readonly<SharedRelayAssetInfo>,blob:Blob,signal:AbortSignal):Promise<string>=>{
  const url=this.#url(info.asset);if(!mimes.has(info.mime)||blob.type!==info.mime||blob.size!==info.bytes||blob.size<1||blob.size>MAX_BYTES)throw new SharedRelayError("asset_metadata_mismatch");
  return this.#request(signal,async(headers,abort)=>{
   headers.set("Content-Type",info.mime);const response=await fetch(url,{method:"PUT",headers,body:blob,signal:abort,credentials:"omit",redirect:"error",cache:"no-store"});
   if(!response.ok)throw new SharedRelayError(response.status===403?"permission_denied":"asset_upload_rejected");
   const receipt=object(JSON.parse(new TextDecoder().decode(await body(response,4096))));
   if(receipt["format"]!=="breditor/relay-asset-receipt"||receipt["formatVersion"]!==1||receipt["asset"]!==info.asset||receipt["mime"]!==info.mime||receipt["bytes"]!==info.bytes||receipt["width"]!==info.width||receipt["height"]!==info.height||typeof receipt["duplicate"]!=="boolean")throw new SharedRelayError("asset_receipt_mismatch");
   return storageRef(info.asset);
  });
 };
 /** Local-first. A missing server asset is not permanently cached: retry on an availability hint.
  * Custom non-content-addressed asset schemes remain the surrounding host's responsibility. */
 async resolve(asset:string):Promise<string|undefined>{
  this.#live();if(!/^sha256:[0-9a-f]{64}$/.test(asset))return undefined;
  const local=await this.#options.store.resolve(asset);this.#live();if(local||!this.#online)return local;
  const existing=this.#downloads.get(asset);if(existing)return existing;
  const work=this.#request(undefined,async(headers,signal)=>{
   const response=await fetch(this.#url(asset),{headers,signal,credentials:"omit",redirect:"error",cache:"no-store"});
   if(response.status===404)return undefined;
   if(!response.ok)throw new SharedRelayError(response.status===403?"permission_denied":"asset_download_rejected");
   const mime=response.headers.get("content-type");if(!mime||!mimes.has(mime))throw new SharedRelayError("asset_mime_rejected");
   const bytes=await body(response,MAX_BYTES);if(signal.aborted||this.#closed)throw new SharedRelayError("asset_cancelled");
   await this.#options.store.cacheRemote(asset,new Blob([bytes],{type:mime}),storageRef(asset));
   if(signal.aborted||this.#closed)throw new SharedRelayError("asset_cancelled");return this.#options.store.resolve(asset);
  });
  this.#downloads.set(asset,work);try{return await work;}finally{if(this.#downloads.get(asset)===work)this.#downloads.delete(asset);}
 }
 /** Explicit upload drain. Failed/cancelled local queue items require the cache's retry action. */
 async flush():Promise<void>{this.#live();if(!this.#online)throw new SharedRelayError("offline");await this.#options.store.flush(this.uploader);}
 /** Offline mode retains local bytes and aborts live transfers; it never changes document state. */
 setOnline(online:boolean):void{this.#live();this.#online=online;if(!online)for(const controller of this.#active)controller.abort();}
 /** Stops this provider only; the caller retains ownership of the durable cache and object URLs. */
 dispose():void{if(this.#closed)return;this.#closed=true;for(const controller of this.#active)controller.abort();this.#downloads.clear();}
}
