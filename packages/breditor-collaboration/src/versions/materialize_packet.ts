/** Fetch only the body of an already known immutable catalog entry. This
 * explicit action never connects a document socket, refreshes a catalog or
 * publishes queued versions. Actual cache persistence remains with the genuine
 * Native store loan; old catalog entries and queued intentions are retained. */
import {VersionCatalogHttp} from './http.js';
import {nativeVersionView,type NativeVersionStoreLoan} from './native_store.js';
import {SharedRelayError} from '../relay/validation.js';
import {RelayWorkCustody} from '../relay/work_custody.js';
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
const packet=VersionCatalogHttp.prototype.packet,dispose=VersionCatalogHttp.prototype.dispose,verify=SharedRichEditor.prototype.verifyVersionSource,abort=AbortController.prototype.abort;
const failure=()=>new SharedRelayError('version_native_materialization_closed');
export class NativeVersionPacketMaterializer<P extends SharedSelectionPolicy>{
 readonly #loan:NativeVersionStoreLoan<P>;readonly #http:VersionCatalogHttp;readonly #work:RelayWorkCustody;
 readonly #active=new Map<string,Promise<string>>();readonly #requests=new Set<AbortController>();#closed=false;
 constructor(loan:NativeVersionStoreLoan<P>){
  // Actual-view admission precedes options, token callbacks and network work.
  const port=nativeVersionView(loan.store);if(!port||port!==loan.port)throw new SharedRelayError('version_native_delivery_source');port.check();
  const options=loan.store.options,getToken=options.getToken;this.#loan=loan;this.#http=new VersionCatalogHttp({...options.identity,getToken:async signal=>{this.#check();const token=await getToken(signal);this.#check();return token;},...(options.requestTimeoutMs===undefined?{}:{requestTimeoutMs:options.requestTimeoutMs})});
  try{this.#work=new RelayWorkCustody(port.core,()=>this.#active.size===0,failure,port.admission);this.#work.registerOwner(this);}catch(error){dispose.call(this.#http);throw error;}Object.freeze(this);
 }
 #check=()=>{if(this.#closed)throw failure();this.#work.checkAllowed();this.#loan.port.check();if(this.#closed)throw failure();};
 materialize(id:string):Promise<string>{
  if(this.#closed)return Promise.reject(failure());if(typeof id!=='string'||!/^sha256:[a-f0-9]{64}$/.test(id))return Promise.reject(new SharedRelayError('version_unknown'));
  const previous=this.#active.get(id);if(previous)return previous;if(this.#active.size>=4)return Promise.reject(new SharedRelayError('version_request_budget'));
  // The real work witness and map entry exist before a token or authority hook
  // can reenter this object, close its source or start an overlapping download.
  let work:Promise<string>;try{work=this.#work.run(()=>Promise.resolve().then(()=>this.#read(id)));}catch(error){return Promise.reject(error);}
  const task=work.then(value=>{if(this.#active.get(id)===task)this.#active.delete(id);return value;},error=>{if(this.#active.get(id)===task)this.#active.delete(id);throw error;});this.#active.set(id,task);return task;
 }
 async #read(id:string):Promise<string>{
  this.#check();const store=this.#loan.store,entry=store.entry(id);if(!entry)throw new SharedRelayError('version_unknown');this.#check();
  let known:string|undefined;try{known=store.packet(id);}catch(error){if(!(error instanceof SharedRelayError)||error.code!=='version_not_cached')throw error;}
  if(known!==undefined){verify.call(store.options.storage.core,known);this.#check();await store.flush();this.#check();return known;}
  const controller=new AbortController();this.#requests.add(controller);
  const check=()=>{this.#check();if(controller.signal.aborted)throw new SharedRelayError('disconnected');};
  try{const text=await packet.call(this.#http,entry,controller.signal);check();const result=await store.cachePacket(text,entry);check();return result;}
  finally{this.#requests.delete(controller);abort.call(controller);}
 }
 /** Cancellation is explicit. A later explicit materialize call may retry;
  * no background request or publication is started by this action. */
 cancel():void{for(const controller of this.#requests)abort.call(controller);}
 /** Stop admission synchronously; retain every real HTTP/cache promise until
  * wait() observes its completion. Disposing a facade never releases a loan. */
 stop():void{if(this.#closed)return;this.#closed=true;dispose.call(this.#http);this.#work.retire(()=>{});}
 async wait():Promise<void>{await Promise.allSettled([...this.#active.values()]);await this.#work.wait(()=>{if(!this.#closed)throw failure();});}
}
