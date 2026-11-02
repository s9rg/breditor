/** Private completion plumbing. Only the owning session can end its visitor;
 * neither command failure nor a caller's saved result settles this lifetime. */
export function deferred<T>():Readonly<{promise:Promise<T>;resolve(value:T):void;reject(error:unknown):void}>{
 let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});void promise.catch(()=>{});
 return Object.freeze({promise,resolve,reject});
}
