/** Shared cancellable read waits. A supplied guard is a check, not source or
 * writer authority. Genuine input/cohort admission belongs to its caller.
 * Late unclaimed native owners are consumed once; claimed owners stay untouched.
 */
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import type {SharedRustOwner} from '../types.js';
import {fail} from './policy.js';
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
export class NativeReconstructionWaits {
 readonly #controller=new AbortController();
 readonly signal=this.#controller.signal;
 readonly #waiters=new Set<(error:Error)=>void>();
 readonly #observations:{read:ReturnType<typeof observeIndependentRecoveryAbort>;disable():void}[]=[];
 #readCheck:(()=>void)|undefined;
 #finish:()=>void=()=>{};#closed=false;#inputClosed=false;#cancelled=false;
 constructor(check:()=>void,signals:readonly(AbortSignal|undefined)[]){
  const lifetime=new Promise<void>(resolve=>{this.#finish=resolve;});
  try{
   if(typeof check!=='function')throw fail('native_reconstruction_policy');this.#readCheck=check;
   for(const value of new Set(signals))if(value!==undefined){
    const read=observeIndependentRecoveryAbort(value,lifetime);let active=true;
    const listener=()=>{if(active&&read.aborted())this.#stop(false);};
    try{add.call(value,'abort',listener);}catch(error){read.release();throw error;}
    this.#observations.push({read,disable(){active=false;read.release();}});
    void lifetime.then(()=>{try{remove.call(value,'abort',listener);}catch{/* Only a detached signal/listener remains. */}});
    if(read.aborted())this.#stop(false);
   }
   this.check();Object.freeze(this);
  }catch(error){this.close();throw error;}
 }
 check=()=>{if(this.#closed||this.#inputClosed)throw fail('native_reconstruction_closed');if(this.#cancelled||this.#observations.some(row=>row.read.aborted()))throw fail('native_reconstruction_aborted');this.#readCheck!();if(this.#closed||this.#inputClosed)throw fail('native_reconstruction_closed');if(this.#cancelled||this.#observations.some(row=>row.read.aborted()))throw fail('native_reconstruction_aborted');};
 #stop(inputClosed:boolean):void{
  if(inputClosed)this.#inputClosed=true;else this.#cancelled=true;
  try{this.#controller.abort();}finally{const error=fail(inputClosed?'native_reconstruction_closed':'native_reconstruction_aborted');for(const cancel of [...this.#waiters])cancel(error);}
 }
 /** The callback starts only after the genuine input and current grant check.
  * Both late settlement branches stay observed after a cancelled wait. */
 call<T>(invoke:()=>T|Promise<T>,late?:(value:T)=>void):Promise<T>{
  this.check();let pending:Promise<T>;try{pending=Promise.resolve(invoke());}catch(error){this.check();return Promise.reject(error);}
  return new Promise<T>((resolve,reject)=>{
   let active=true;
   const finish=(failed:boolean,error?:unknown,value?:T)=>{if(!active)return;active=false;this.#waiters.delete(cancel);failed?reject(error):resolve(value as T);};
   const cancel=(error:Error)=>finish(true,error);this.#waiters.add(cancel);
   // Genuine free is synchronous. A failing host cleanup is observed; it can
   // never turn a cancelled read into a successful source or an activation.
   const discard=(value:T)=>{try{late?.(value);}catch{/* The original read has already failed. No owner is exposed. */}};
   void pending.then(value=>{if(!active){discard(value);return;}try{this.check();}catch(error){discard(value);finish(true,error);return;}finish(false,undefined,value);},error=>finish(true,error));
   try{this.check();}catch(error){finish(true,error);}
  });
 }
 /** Unwrap the existing staged initializer before wrapping the raw factory;
  * the original replay still performs its one-shot native initialization. */
 restore<T extends(...args:never[])=>SharedRustOwner|Promise<SharedRustOwner>>(factory:T,receiver:object):T{
  if(typeof factory!=='function')throw fail('native_reconstruction_policy');this.check();const binding=nativeRestoreBinding(factory,receiver);
  return((...args:unknown[])=>this.call(()=>Reflect.apply(binding.factory,binding.receiver,args) as SharedRustOwner|Promise<SharedRustOwner>,owner=>freeUnclaimedSharedRustOwner(owner))) as unknown as T;
 }
 /** A trusted owner/input lifetime has ended; no source is retired here. */
 closeInput():void{this.#stop(true);}
 close():void{if(this.#closed)return;this.#closed=true;try{this.#stop(true);}finally{for(const row of this.#observations)row.disable();this.#observations.length=0;this.#readCheck=undefined;this.#waiters.clear();this.#finish();this.#finish=()=>{};}}
}
