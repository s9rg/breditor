/** Observe actual cancellation before native reads; final checks and release
 * access private flags only. Event-listener removal is deferred until the
 * genuine read lifetime ends, not run inside the final multi-source fence. */
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
export class OperationalReadCancellation{
 readonly #observation:ReturnType<typeof observeIndependentRecoveryAbort>;readonly #finish:()=>void;
 #closed=false;
 constructor(signal:AbortSignal|undefined){let finish!:()=>void;const lifetime=new Promise<void>(resolve=>{finish=resolve;});this.#finish=finish;this.#observation=observeIndependentRecoveryAbort(signal,lifetime);}
 check(fail:()=>Error):void{if(this.#closed||this.#observation.aborted())throw fail();}
 close():void{if(this.#closed)return;this.#closed=true;this.#observation.release();this.#finish();}
}
