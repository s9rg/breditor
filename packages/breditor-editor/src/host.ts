/** Host ownership is a UI lifetime guard, not a Rust mutation observation. */
const claims=new WeakMap<HTMLElement,symbol>();
export function claimHost(host:HTMLElement,signal?:AbortSignal):{assert():void;rollback():void;release():void}{
 signal?.throwIfAborted();
 if(claims.has(host)||host.hasAttribute("data-breditor-rich")||host.hasAttribute("data-breditor-shared"))throw Error("This host already has an editor or pending opening");
 const token=Symbol(),children=[...host.childNodes];claims.set(host,token);
 const release=()=>{if(claims.get(host)===token)claims.delete(host);};
 return {assert(){signal?.throwIfAborted();if(claims.get(host)!==token)throw Error("Editor opening no longer owns this host");},rollback(){if(claims.get(host)===token){
  // Reattaching identical children blurs focused inputs. A pre-mount failure must
  // leave them connected, not attempt to refocus an element the user may have left.
  const unchanged=host.childNodes.length===children.length&&children.every((child,index)=>host.childNodes[index]===child);
  if(!unchanged)host.replaceChildren(...children);delete host.dataset["breditorRich"];delete host.dataset["breditorShared"];release();
 }},release};
}
/** Cancel one consumer's wait without cancelling initialization shared by other consumers. */
export function awaitInitialization<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return promise;
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>{detach();reject(signal.reason??new DOMException("Editor opening aborted","AbortError"));};
  const detach=()=>signal.removeEventListener("abort",abort);
  promise.then(value=>{detach();resolve(value);},error=>{detach();reject(error);});
  if(signal.aborted)abort();else signal.addEventListener("abort",abort,{once:true});
 });
}
