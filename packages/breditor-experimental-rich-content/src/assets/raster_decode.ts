/** Await the real decoder while keeping cancellation independent of its return.
 * Late success and failure are observed, never admitted after Abort. The caller
 * owns the temporary object URL and can revoke it as soon as this wait ends.
 * No timeout changes ordinary raster admission or its encoded-byte contract.
 */
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const cancelled=()=>new DOMException('Raster admission was cancelled','AbortError');
export function checkRasterSignal(signal?:AbortSignal):void{if(signal!==undefined&&aborted.call(signal))throw cancelled();}
export function awaitRasterOperation<T>(start:()=>T|Promise<T>,signal?:AbortSignal):Promise<T>{
 if(signal===undefined)return Promise.resolve(start());
 checkRasterSignal(signal);
 return new Promise<T>((resolve,reject)=>{
  let active=true;
  const release=()=>{if(!active)return false;active=false;remove.call(signal,'abort',abort);return true;};
  const fail=(error:unknown)=>{if(release())reject(error);};
  const abort=()=>fail(cancelled());
  add.call(signal,'abort',abort,{once:true});
  if(aborted.call(signal)){abort();return;}
  let pending:Promise<T>;try{pending=Promise.resolve(start());}catch(error){fail(error);return;}
  // Both branches stay observed if cancellation wins. In particular a late
  // rejection cannot escape as an unhandled application rejection.
  void pending.then(value=>{if(aborted.call(signal))abort();else if(release())resolve(value);},fail);
 });
}
export function decodeRaster(image:HTMLImageElement,signal?:AbortSignal):Promise<void>{return awaitRasterOperation(()=>image.decode(),signal);}
