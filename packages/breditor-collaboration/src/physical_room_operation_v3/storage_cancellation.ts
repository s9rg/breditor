/** Actual cancellation observation and deferred listener retirement. Event
 * handlers may abort actual I/O; final checks and close read private state only. */
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {physicalOperationV3Failure as fail} from './policy.js';
const add=globalThis.EventTarget?.prototype.addEventListener,remove=globalThis.EventTarget?.prototype.removeEventListener;
export class PhysicalOperationV3Cancellation{
 readonly #observation;readonly #finish:()=>void;readonly #handlers=new Set<()=>void>();#closed=false;
 constructor(signal?:AbortSignal){
  let finish!:()=>void;const lifetime=new Promise<void>(resolve=>{finish=resolve;});this.#finish=finish;this.#observation=observeIndependentRecoveryAbort(signal,lifetime);
  if(signal){const listener=()=>{if(!this.#closed&&this.#observation.aborted())for(const cancel of this.#handlers)try{cancel();}catch{/* Completion checks retain cancellation even after a native transaction became inactive. */}};
   try{if(!add||!remove)throw fail('physical_operation_v3_policy');add.call(signal,'abort',listener);}catch{this.#observation.release();finish();throw fail('physical_operation_v3_policy');}
   void lifetime.then(()=>{try{remove!.call(signal,'abort',listener);}catch{/* Only tiny signal/listener state remains. */}});
  }
 }
 check():void{if(this.#closed)throw fail('physical_operation_v3_closed');if(this.#observation.aborted())throw fail('physical_operation_v3_aborted');}
 watch(cancel:()=>void):()=>void{this.check();this.#handlers.add(cancel);if(this.#observation.aborted())cancel();return()=>{this.#handlers.delete(cancel);};}
 close():void{if(this.#closed)return;this.#closed=true;this.#handlers.clear();this.#observation.release();this.#finish();}
}
