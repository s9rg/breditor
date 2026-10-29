/** Actual document/comment adapter work, independent of visible socket state.
 * SDK-private: detached status, a disposed facade or a saved ACK cannot provide
 * this reservation. Pending work remains owned until its real promise settles. */
interface Entry { readonly idle:()=>boolean; readonly work:Set<Promise<void>>; retired:boolean }
interface CoreWork { readonly entries:Set<Entry>; token:object|undefined }
const cores=new WeakMap<object,CoreWork>();
function state(core:object):CoreWork{let value=cores.get(core);if(!value){value={entries:new Set(),token:undefined};cores.set(core,value);}return value;}
export class RelayWorkCustody {
 readonly #state:CoreWork;readonly #entry:Entry;readonly #fail:()=>Error;
 #retired:(()=>void)|undefined;
 constructor(core:object,idle:()=>boolean,fail:()=>Error){
  this.#state=state(core);this.#fail=fail;if(this.#state.token)throw fail();
  this.#entry={idle,work:new Set(),retired:false};this.#state.entries.add(this.#entry);
 }
 checkAllowed():void{if(this.#state.token||this.#entry.retired)throw this.#fail();}
 /** Install the pending witness BEFORE invoking token/storage/native callbacks.
  * A synchronous reentrant recovery attempt must see this actual work too. */
 run<T>(start:()=>Promise<T>):Promise<T>{
  this.checkAllowed();let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});this.#entry.work.add(done);
  const settled=()=>{this.#entry.work.delete(done);finish();this.#finishRetirement();};
  try{return Promise.resolve(start()).then(value=>{settled();return value;},error=>{settled();throw error;});}
  catch(error){settled();return Promise.reject(error);}
 }
 /** Does not connect, retry a save, acknowledge a packet or cancel actual work.
  * The caller pins its epoch and disconnected intent before and after each wait. */
 async wait(check:()=>void):Promise<void>{check();while(this.#entry.work.size){await Promise.all([...this.#entry.work]);check();}check();}
 retire(release:()=>void):void{if(this.#entry.retired)return;this.#entry.retired=true;this.#retired=release;this.#finishRetirement();}
 #finishRetirement():void{if(!this.#entry.retired||this.#entry.work.size)return;this.#state.entries.delete(this.#entry);const release=this.#retired;this.#retired=undefined;release?.();}
}
/** Callback-free SDK owner checks: every entry callback reads private fields
 * only. Validate the complete set before setting the first exclusion flag. */
export function reserveRelayRecoveryWork(members:readonly object[],fail:()=>Error):Readonly<{check():void;close():void}>{
 let selected=members.map(core=>state(core));
 for(const value of selected)if(value.token||[...value.entries].some(entry=>entry.work.size||!entry.idle()))throw fail();
 const token=Object.freeze({});let closed=false;
 const check=()=>{if(closed||selected.some(value=>value.token!==token))throw fail();};
 const result=Object.freeze({check,close(){if(closed)return;for(const value of selected)if(value.token===token)value.token=undefined;closed=true;selected=[];}});
 for(const value of selected)value.token=token;return result;
}
/** Genuine tracked adapters have already been disposed by their source. Their
 * late callbacks still own custody; disposal is not an awaited drain. */
export async function waitRetiredRelayWork(core:object):Promise<void>{
 const value=cores.get(core);if(!value)return;
 while(value.entries.size){const entries=[...value.entries];if(entries.some(entry=>!entry.retired))throw Error('Dispose borrowed document/comment adapters before source cleanup');await Promise.all(entries.flatMap(entry=>[...entry.work]));}
}
