import {SharedRelayError} from "../relay/validation.js";
import {queueKey} from "./database.js";
import type {SharedSuggestionQueueIdentity} from "./types.js";
/** One mutation owner across database names; independent from author leases and server rights. */
export class SuggestionQueueLease {
 #live=true;readonly #release:()=>void;readonly #finished:Promise<void>;
 private constructor(release:()=>void,finished:Promise<void>){this.#release=release;this.#finished=finished;}
 static async acquire(identity:SharedSuggestionQueueIdentity):Promise<SuggestionQueueLease>{
  if(!globalThis.navigator?.locks)throw new SharedRelayError("suggestion_locks_unavailable");
  let release!:()=>void,accept!:(lease:SuggestionQueueLease)=>void,reject!:(error:unknown)=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<SuggestionQueueLease>((resolve,fail)=>{accept=resolve;reject=fail;});
  const finished=navigator.locks.request(`breditor:suggestion-queue:${queueKey(identity)}`,{mode:"exclusive",ifAvailable:true},async lock=>{await Promise.resolve();if(!lock){reject(new SharedRelayError("suggestion_queue_in_use"));return;}accept(new SuggestionQueueLease(release,finished));await held;});void finished.catch(reject);return ready;
 }
 assertLive():void{if(!this.#live)throw new SharedRelayError("suggestion_queue_closed");}
 async close():Promise<void>{if(this.#live){this.#live=false;this.#release();}await this.#finished;}
}
