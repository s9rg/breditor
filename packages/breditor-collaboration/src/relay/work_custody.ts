/** Actual document/comment/metadata adapter and local store work, independent of visible socket state.
 * SDK-private: detached status, a disposed facade or a saved ACK cannot provide
 * this reservation. Pending work remains owned until its real promise settles. */
interface Entry { readonly idle:()=>boolean; readonly work:Set<Promise<void>>; retired:boolean; readonly admission:object|undefined }
interface CoreWork { readonly entries:Set<Entry>; token:object|undefined }
declare const admissionBrand:unique symbol;
/** Opaque live admission; serialized/copied fields carry no permission. */
export interface RelayWorkAdmission{readonly [admissionBrand]:true}
const admissions=new WeakMap<RelayWorkAdmission,Readonly<{state:CoreWork;token:object}>>();
const cores=new WeakMap<object,CoreWork>();
const ownedGroups=new WeakMap<object,Readonly<{state:CoreWork;entries:ReadonlySet<Entry>}>>();
/** Genuine constructor composition only. Grouping grants no native or network rights. */
export function registerRelayWorkGroup(owner:object,members:readonly object[]):void{
 if(ownedGroups.has(owner)||!members.length||new Set(members).size!==members.length)throw Error("Actual metadata work ownership is required");const groups=members.map(member=>ownedGroups.get(member));if(groups.some(group=>!group)||groups.some(group=>group!.state!==groups[0]!.state))throw Error("Actual metadata work ownership is required");ownedGroups.set(owner,Object.freeze({state:groups[0]!.state,entries:new Set(groups.flatMap(group=>[...group!.entries]))}));
}
function state(core:object):CoreWork{let value=cores.get(core);if(!value){value={entries:new Set(),token:undefined};cores.set(core,value);}return value;}
export class RelayWorkCustody {
 readonly #state:CoreWork;readonly #entry:Entry;readonly #fail:()=>Error;
 #retired:(()=>void)|undefined;
 constructor(core:object,idle:()=>boolean,fail:()=>Error,admission?:RelayWorkAdmission){
  this.#state=state(core);this.#fail=fail;const grant=admission?admissions.get(admission):undefined;
  if(admission&&(!grant||grant.state!==this.#state||grant.token!==this.#state.token)||!admission&&this.#state.token)throw fail();
  this.#entry={idle,work:new Set(),retired:false,admission:grant?.token};this.#state.entries.add(this.#entry);
 }
 /** Register the actual private store/adapter with its constructor-owned work. */
 registerOwner(owner:object):void{if(ownedGroups.has(owner))throw this.#fail();ownedGroups.set(owner,Object.freeze({state:this.#state,entries:new Set([this.#entry])}));}
 checkAllowed():void{if(this.#entry.retired||(this.#entry.admission?this.#state.token!==this.#entry.admission:this.#state.token!==undefined))throw this.#fail();}
 /** Install the pending witness BEFORE invoking token/storage/native callbacks.
  * A synchronous reentrant recovery attempt must see this actual work too. */
 run<T>(start:()=>Promise<T>):Promise<T>{
  this.checkAllowed();let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});this.#entry.work.add(done);
  const settled=()=>{this.#entry.work.delete(done);finish();this.#finishRetirement();};
  try{return Promise.resolve(start()).then(value=>{settled();return value;},error=>{settled();throw error;});}
  catch(error){settled();return Promise.reject(error);}
 }
 /** Synchronous mutation staging also precedes any authority/driver callback.
  * The actual asynchronous write, if started, owns a separate pending entry. */
 runSync<T>(start:()=>T):T{
  this.checkAllowed();let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});this.#entry.work.add(done);
  try{return start();}finally{this.#entry.work.delete(done);finish();this.#finishRetirement();}
 }
 /** Pure in-progress witness for read admission, including callback reentrancy
  * before a caller has assigned its externally visible running promise. */
 hasPendingWork():boolean{return this.#entry.work.size>0;}
 /** Does not connect, retry a save, acknowledge a packet or cancel actual work.
  * The caller pins its epoch and disconnected intent before and after each wait. */
 async wait(check:()=>void):Promise<void>{check();while(this.#entry.work.size){await Promise.all([...this.#entry.work]);check();}check();}
 retire(release:()=>void):void{if(this.#entry.retired)return;this.#entry.retired=true;this.#retired=release;this.#finishRetirement();}
 #finishRetirement():void{if(!this.#entry.retired||this.#entry.work.size)return;this.#state.entries.delete(this.#entry);const release=this.#retired;this.#retired=undefined;release?.();}
}
/** Callback-free SDK owner checks: every entry callback reads private fields
 * only. Validate the complete set before setting the first exclusion flag. */
export interface RelayRecoveryWork{check():void;admit(core:object):RelayWorkAdmission;close():void}
export function reserveRelayRecoveryWork(members:readonly object[],fail:()=>Error):RelayRecoveryWork{
 let selected=members.map(core=>state(core)),byCore=new Map(members.map((core,index)=>[core,selected[index]!]));
 for(const value of selected)if(value.token||[...value.entries].some(entry=>entry.work.size||!entry.idle()))throw fail();
 const token=Object.freeze({});let closed=false;
 const check=()=>{if(closed||selected.some(value=>value.token!==token))throw fail();};
 const result=Object.freeze({check,admit(core:object){check();const value=byCore.get(core);if(!value)throw fail();const admission=Object.freeze({}) as RelayWorkAdmission;admissions.set(admission,Object.freeze({state:value,token}));return admission;},close(){if(closed)return;check();
  // An admitted SDK adapter must actually retire AND drain before either the
  // work exclusion or native flags can be released. A visible Offline is not enough.
  if(selected.some(value=>[...value.entries].some(entry=>entry.admission===token)))throw fail();
  for(const value of selected)if(value.token===token)value.token=undefined;closed=true;selected=[];byCore.clear();}});
 for(const value of selected)value.token=token;return result;
}
/** Genuine tracked adapters have already been disposed by their source. Their
 * late callbacks still own custody; disposal is not an awaited drain. */
export async function waitRetiredRelayWork(core:object,ownedMetadata:readonly object[]=[]):Promise<void>{
 const value=cores.get(core);if(!value){if(ownedMetadata.length)throw Error('Actual metadata work ownership is required');return;}
 const groups=ownedMetadata.map(owner=>ownedGroups.get(owner));if(groups.some(group=>!group||group.state!==value))throw Error('Actual metadata work ownership is required');const owned=new Set(groups.flatMap(group=>[...group!.entries]));
 while(value.entries.size){const entries=[...value.entries];if(entries.some(entry=>!entry.retired&&(!owned.has(entry)||!entry.idle())))throw Error('Dispose borrowed adapters before source cleanup');const pending=entries.flatMap(entry=>[...entry.work]);if(!pending.length)return;await Promise.all(pending);}
}
