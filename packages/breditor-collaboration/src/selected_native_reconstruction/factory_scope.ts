/** Bind explicit read factories to the actual selected-owner scope BEFORE its
 * first capture. An uncooperative host wait must not hold a cancelled room read
 * forever. Only function wrappers change; profiles, policies and stored meanings
 * remain explicit. This does not create custody, retire a source or acknowledge
 * any native/source write. The common inspector admits the genuine owner first.
 */
import type {SharedSelectionPolicy,SharedRustOwner} from '../types.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {NativeReconstructionWaits} from './read_waits.js';
import {fail} from './policy.js';
type Restore=(...args:never[])=>SharedRustOwner|Promise<SharedRustOwner>;
export class NativeReconstructionFactoryScope<P extends SharedSelectionPolicy>{
 readonly reads:PhysicalOperationV3HistoryReadOptions<P>['reads'];
 #waits:NativeReconstructionWaits|undefined;#bound=false;#closed=false;
 constructor(reads:PhysicalOperationV3HistoryReadOptions<P>['reads']){
  this.reads=Object.freeze(reads.map(row=>{
   const next={...row.read} as Record<string,unknown>;
   for(const name of['restore','restoreSegmented','restoreContinued'])if(typeof next[name]==='function')next[name]=this.#wrap(next[name] as Restore,row.read);
   const selected=next['session'];if(selected&&typeof selected==='object'&&!Array.isArray(selected)){
    const session={...selected} as Record<string,unknown>,chosen=session['documentHistory'];
    if(chosen&&typeof chosen==='object'&&!Array.isArray(chosen)){const history={...chosen} as Record<string,unknown>;for(const name of['restoreOriginal','restoreSegmented'])if(typeof history[name]==='function')history[name]=this.#wrap(history[name] as Restore,chosen);session['documentHistory']=Object.freeze(history);}
    next['session']=Object.freeze(session);
   }
   return Object.freeze({id:row.id,read:Object.freeze(next)});
  })) as unknown as PhysicalOperationV3HistoryReadOptions<P>['reads'];Object.freeze(this);
 }
 #wrap<T extends Restore>(factory:T,receiver:object):T{return((...args:unknown[])=>{const waits=this.#waits;if(this.#closed||!waits)throw fail('native_reconstruction_closed');return Reflect.apply(waits.restore(factory,receiver),receiver,args);}) as unknown as T;}
 /** The actual scope supplies liveness/cancellation only. It is never stored in
  * incoming DATA or used to infer credentials, writer access or room approval. */
 bind(scope:SelectedNativeRecoveryScope,signal?:AbortSignal):void{if(this.#bound||this.#closed)throw fail('native_reconstruction_closed');this.#bound=true;this.#waits=new NativeReconstructionWaits(scope.check,[scope.signal,signal]);}
 close():void{if(this.#closed)return;this.#closed=true;this.#waits?.close();this.#waits=undefined;}
}
