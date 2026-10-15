import {SharedEditorError} from "../core.js";

/** Origin-wide exclusion for one causal writer. This is not a server authorization token. */
export class SharedWriterLease {
 #release:()=>void;#finished:Promise<void>;#live=true;
 private constructor(release:()=>void,finished:Promise<void>){this.#release=release;this.#finished=finished;}
 static async acquire(room:string,writer:string):Promise<SharedWriterLease>{
  if(!room||new TextEncoder().encode(room).length>200||!/^\d+$/.test(writer)||writer.length>20||BigInt(writer)<1n||BigInt(writer)>=18446744073709551615n||BigInt(writer).toString()!==writer)throw new SharedEditorError("writer_identity","Invalid room or canonical causal writer");
  if(!globalThis.navigator?.locks)throw new SharedEditorError("writer_locks_unavailable","Shared recovery requires the browser Web Locks API");
  let release!:()=>void,accept!:(value:SharedWriterLease)=>void,reject!:(reason:unknown)=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<SharedWriterLease>((resolve,fail)=>{accept=resolve;reject=fail;});
  // The lock is independent of the database name: another store cannot clone a live writer.
  const finished=navigator.locks.request(`breditor:shared-writer:${JSON.stringify([room,writer])}`,{mode:"exclusive",ifAvailable:true},async lock=>{
   if(!lock){reject(new SharedEditorError("writer_in_use","This shared writer is already active in another session"));return;}
   accept(new SharedWriterLease(release,finished));await held;
  });
  void finished.catch(reject);return ready;
 }
 assertLive():void{if(!this.#live)throw new SharedEditorError("writer_lease_closed","The shared writer lease is closed");}
 async close():Promise<void>{if(this.#live){this.#live=false;this.#release();}await this.#finished;}
}
