/** Genuine complete-input DATA lifetime. This wrapper admits the private input
 * brand before acquiring callbacks; it grants no mutable source or writer lease. */
import type {SharedRustOwner} from '../types.js';
import {LoadedNativeReconstructionCurrent,retainNativeReconstructionInput} from './loaded_current.js';
import {NativeReconstructionWaits} from './read_waits.js';
import {fail} from './policy.js';
export class NativeReconstructionWork{
 readonly signal:AbortSignal;
 #input:ReturnType<typeof retainNativeReconstructionInput>|undefined;
 #waits:NativeReconstructionWaits|undefined;
 #closed=false;#inputClosed=false;
 constructor(source:LoadedNativeReconstructionCurrent,signal?:AbortSignal){
  try{
   this.#input=retainNativeReconstructionInput(source,()=>{this.#inputClosed=true;this.#waits?.closeInput();});
   this.#waits=new NativeReconstructionWaits(()=>{if(this.#closed||this.#inputClosed)throw fail('native_reconstruction_closed');this.#input!.check();if(this.#closed||this.#inputClosed)throw fail('native_reconstruction_closed');},[this.#input.signal,signal]);
   this.signal=this.#waits.signal;this.check();Object.freeze(this);
  }catch(error){this.close();throw error;}
 }
 check=()=>{if(!this.#waits)throw fail('native_reconstruction_closed');this.#waits.check();};
 call<T>(invoke:()=>T|Promise<T>,late?:(value:T)=>void):Promise<T>{this.check();return this.#waits!.call(invoke,late);}
 restore<T extends(...args:never[])=>SharedRustOwner|Promise<SharedRustOwner>>(factory:T,receiver:object):T{this.check();return this.#waits!.restore(factory,receiver);}
 close():void{if(this.#closed)return;this.#closed=true;try{this.#waits?.close();}finally{this.#waits=undefined;this.#input?.release();this.#input=undefined;}}
}
