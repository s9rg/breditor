/** Await the real decoder while keeping cancellation independent of its return.
 * Late success and failure are observed, never admitted after Abort. The caller
 * owns the temporary object URL and can revoke it as soon as this wait ends.
 * No timeout changes ordinary raster admission or its encoded-byte contract.
 */
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const cancelled=()=>new DOMException('Raster admission was cancelled','AbortError');
export function checkRasterSignal(signal?:AbortSignal):void{if(signal!==undefined&&aborted.call(signal))throw cancelled();}
export function decodeRaster(image:HTMLImageElement,signal?:AbortSignal):Promise<void>{
 if(signal===undefined)return image.decode();
 checkRasterSignal(signal);
 return new Promise<void>((resolve,reject)=>{
  let active=true;
  const finish=(failed:boolean,error?:unknown)=>{if(!active)return;active=false;remove.call(signal,'abort',abort);if(failed)reject(error);else resolve();};
  const abort=()=>finish(true,cancelled());
  add.call(signal,'abort',abort,{once:true});
  if(aborted.call(signal)){abort();return;}
  let pending:Promise<void>;try{pending=Promise.resolve(image.decode());}catch(error){finish(true,error);return;}
  // Both branches stay observed if cancellation wins. In particular a late
  // decoder rejection cannot escape as an unhandled application rejection.
  void pending.then(()=>{if(aborted.call(signal))abort();else finish(false);},error=>finish(true,error));
 });
}
