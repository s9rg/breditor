import {SharedEditorError} from "../core.js";
/** Separate origin-wide comment-writer exclusion. Neither a document writer nor account authorization. */
export class ReviewWriterLease {
 #live=true;readonly #release:()=>void;readonly #finished:Promise<void>;
 private constructor(release:()=>void,finished:Promise<void>){this.#release=release;this.#finished=finished;}
 static async acquire(room:string,actor:string):Promise<ReviewWriterLease>{
  if(!room||new TextEncoder().encode(room).byteLength>200||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actor))throw new SharedEditorError("review_writer_identity","Invalid review room/writer");
  if(!globalThis.navigator?.locks)throw new SharedEditorError("review_locks_unavailable","Review recovery requires origin-wide Web Locks");
  let release!:()=>void,accept!:(lease:ReviewWriterLease)=>void,reject!:(error:unknown)=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<ReviewWriterLease>((resolve,fail)=>{accept=resolve;reject=fail;});
  const finished=navigator.locks.request(`breditor:review-writer:${JSON.stringify([room,actor])}`,{mode:"exclusive",ifAvailable:true},async lock=>{
   await Promise.resolve(); // The lease retains the request's completion even with a synchronous host shim.
   if(!lock){reject(new SharedEditorError("review_writer_in_use","This comment writer is already active in another session"));return;}
   accept(new ReviewWriterLease(release,finished));await held;
  });
  void finished.catch(reject);return ready;
 }
 assertLive():void{if(!this.#live)throw new SharedEditorError("review_lease_closed","The review writer lease is closed");}
 async close():Promise<void>{if(this.#live){this.#live=false;this.#release();}await this.#finished;}
}
