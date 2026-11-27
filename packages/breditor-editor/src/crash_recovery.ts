/** Opt-in local crash recovery: restart a crashed native owner from its last exact checkpoint.
 *
 * The supervisor never reads in-memory state after a crash. It restarts only from the last
 * checkpoint returned by a successful exact read (`checkpointJson()`, including autosave reads),
 * or the startup checkpoint, and only after that checkpoint restores and re-exports byte-for-byte
 * in a fresh headless owner. See docs/CRASH_RECOVERY.md. */
import type {RichCommandOutcome} from "@breditor/experimental-rich-content";

/** Why an owner is considered crashed. Ordinary typed refusals (stale revision, read-only, policy) never are. */
export type CrashReason="wasm-trap"|"poisoned-owner"|"invariant";
/** Why the supervisor stopped restarting and stays in the read-only failed state. */
export type CrashFailure="budget"|"verification"|"reopen";
/** `initial` is the checkpoint read right after opening; `exact` is a later successful `checkpointJson()` read. */
export type CrashCheckpointSource="initial"|"exact";
export type CrashRecoveryPhase="running"|"restarting"|"failed"|"disposed";
/** Content-free crash report. It never carries an error message, document text, IDs or the checkpoint. */
export interface CrashDiagnostic {
 readonly format:"breditor/crash-diagnostic";readonly formatVersion:1;
 readonly reason:CrashReason;
 /** `name` of the thrown value (for example `RuntimeError`), never its message. */
 readonly errorName:string;
 /** `api` for a call on the editor object, `input` for the editor's own command/input path (`onError`). */
 readonly source:"api"|"input";
 /** Restarts already used in the current budget window, before handling this crash. */
 readonly restartsInWindow:number;
 /** Content-changing outcomes (content, typing, undo, redo) published after the kept checkpoint. */
 readonly editsLost:number;
 readonly checkpoint:CrashCheckpointSource;
}
export interface CrashRestartedDiagnostic extends CrashDiagnostic {readonly restarts:number}
export interface CrashFailedDiagnostic extends CrashDiagnostic {readonly failure:CrashFailure}
export interface CrashRecoveryOptions {
 /** Restarts allowed per `windowMs` (integer 0..100, default 3). 0 fails on the first crash. */
 readonly maxRestarts?:number;
 /** Budget window in milliseconds (integer 1..86400000, default 60000). */
 readonly windowMs?:number;
 /** A crash was detected; input is frozen. Called before any restart work. */
 readonly onCrash?:(diagnostic:CrashDiagnostic)=>void;
 /** A fresh owner from the kept checkpoint is mounted in the same host. Re-mount borrowed panels and autosave here. */
 readonly onRestarted?:(diagnostic:CrashRestartedDiagnostic)=>void;
 /** The error event: no restart will happen; the editor stays frozen and read-only until disposed. */
 readonly onFailed?:(diagnostic:CrashFailedDiagnostic)=>void;
}
/** Read-only supervisor state. `checkpointJson` is deliberately absent; use `verifiedCheckpointJson()`. */
export interface CrashRecoveryState {
 readonly phase:CrashRecoveryPhase;
 /** Successful restarts over this editor's lifetime. */
 readonly restarts:number;
 /** Content-changing outcomes published since the kept checkpoint; lost if the owner crashes now. */
 readonly editsSinceCheckpoint:number;
 readonly checkpoint:CrashCheckpointSource;
}
/** Extra surface of an editor opened with `crashRecovery`. */
export interface CrashRecoveryHost {
 recovery():CrashRecoveryState;
 /** The kept checkpoint, readable in every phase (also `failed`), so durable data is never lost. */
 verifiedCheckpointJson():string;
}
export class CrashRecoveryError extends Error {
 readonly code:"restarting"|"failed"|"disposed";
 constructor(code:"restarting"|"failed"|"disposed"){super(code==="restarting"?"The editor is restarting after a crash":code==="failed"?"The editor crashed and could not be restarted":"The editor is disposed");this.name="CrashRecoveryError";this.code=code;}
}
interface ResolvedOptions {maxRestarts:number;windowMs:number;onCrash:CrashRecoveryOptions["onCrash"];onRestarted:CrashRecoveryOptions["onRestarted"];onFailed:CrashRecoveryOptions["onFailed"]}
/** Strict validation before any runtime work. */
export function checkCrashRecoveryOptions(value:unknown):ResolvedOptions{
 if(typeof value!=="object"||value===null||Array.isArray(value))throw new TypeError("crashRecovery must be an options object");
 const options=value as CrashRecoveryOptions,known=new Set(["maxRestarts","windowMs","onCrash","onRestarted","onFailed"]);
 for(const key of Object.keys(options))if(!known.has(key))throw new TypeError(`Unknown crashRecovery option ${key}`);
 const maxRestarts=options.maxRestarts??3,windowMs=options.windowMs??60_000;
 if(!Number.isInteger(maxRestarts)||maxRestarts<0||maxRestarts>100)throw new TypeError("crashRecovery.maxRestarts must be an integer from 0 to 100");
 if(!Number.isInteger(windowMs)||windowMs<1||windowMs>86_400_000)throw new TypeError("crashRecovery.windowMs must be an integer from 1 to 86400000");
 for(const key of ["onCrash","onRestarted","onFailed"] as const)if(options[key]!==undefined&&typeof options[key]!=="function")throw new TypeError(`crashRecovery.${key} must be a function`);
 return {maxRestarts,windowMs,onCrash:options.onCrash,onRestarted:options.onRestarted,onFailed:options.onFailed};
}
// wasm-bindgen reports a Rust object left borrowed or freed by an aborted call with these messages.
const poisoned=/recursive use of an object detected|null pointer passed to rust|attempted to take ownership of Rust value while it was borrowed/i;
/** Classify a thrown value. Only crash-class failures restart; every other error is an ordinary refusal. */
export function classifyCrash(error:unknown):CrashReason|undefined{
 if(typeof WebAssembly!=="undefined"&&error instanceof WebAssembly.RuntimeError)return "wasm-trap";
 if(!(error instanceof Error))return undefined;
 if(poisoned.test(error.message))return "poisoned-owner";
 // The SDK's own boundary invariant: the native result was absent or malformed.
 if((error as {code?:unknown}).code==="breditor_rich.boundary")return "invariant";
 return undefined;
}
function errorName(error:unknown):string{
 const name=error instanceof Error?error.name:typeof error;
 return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)?name:"Error";
}
/** The minimum the supervisor needs from a local owner. */
export interface SupervisedOwner {
 readonly surface:HTMLElement;
 checkpointJson():string;view():{readonly selection:unknown};
 execute(command:never,focus?:boolean):unknown;
 focus():void;setPlaceholderLabel(label:string|null):void;dispose():void;
}
export interface SupervisorHooks<O extends SupervisedOwner> {
 readonly host:HTMLElement;
 /** Open one owner with the supervisor's callbacks; `checkpointJson` is undefined only for the first opening. */
 open(callbacks:{onChange:(view:{readonly selection:unknown},outcome:RichCommandOutcome)=>void;onError:(error:unknown)=>void},restart:{checkpointJson:string;signal:AbortSignal}|undefined):Promise<O>;
 /** Reapply live host policy that the opening options cannot carry; a throw fails the restart. */
 reapply?(owner:O):void;
 /** Restore the checkpoint in a fresh headless owner and require a byte-exact re-export. */
 verify(checkpointJson:string):Promise<boolean>;
 /** Host callbacks to forward. */
 readonly onChange:((view:never,outcome:RichCommandOutcome)=>void)|undefined;
 readonly onError:((error:unknown)=>void)|undefined;
 readonly options:ResolvedOptions;
}
const editOutcomes=new Set<RichCommandOutcome>(["content","typing","undo","redo"]);
const frozenAttribute="data-breditor-recovery";
/** Owns the current owner, the kept checkpoint and the restart budget for one host. */
export class CrashSupervisor<O extends SupervisedOwner> {
 #hooks:SupervisorHooks<O>;#owner:O|undefined;#last!:O;
 #phase:CrashRecoveryPhase="running";#checkpoint="";#source:CrashCheckpointSource="initial";
 #edits=0;#restarts=0;#window:number[]=[];#abort:AbortController|undefined;
 #placeholder:{label:string|null}|undefined;#selection:unknown;
 #quiet=false;#inert:{had:boolean;busy:string|null}|undefined;
 private constructor(hooks:SupervisorHooks<O>){this.#hooks=hooks;}
 /** Open, then read the startup checkpoint. A crash before that point fails the opening. */
 static async open<O extends SupervisedOwner>(hooks:SupervisorHooks<O>):Promise<CrashSupervisor<O>>{
  const supervisor=new CrashSupervisor(hooks);
  const owner=await hooks.open(supervisor.#callbacks(),undefined);
  try{supervisor.#checkpoint=owner.checkpointJson();supervisor.#selection=owner.view().selection;}catch(error){try{owner.dispose();}catch{/* Report the first failure. */}throw error;}
  supervisor.#owner=owner;supervisor.#last=owner;return supervisor;
 }
 get last():O{return this.#last;}
 state():CrashRecoveryState{return {phase:this.#phase,restarts:this.#restarts,editsSinceCheckpoint:this.#edits,checkpoint:this.#source};}
 verifiedCheckpointJson():string{return this.#checkpoint;}
 /** Run one call on the live owner; a crash-class throw starts recovery and is rethrown. */
 call<T>(work:(owner:O)=>T):T{
  const owner=this.#live();
  try{return work(owner);}catch(error){this.#crash(error,"api");throw error;}
 }
 async callAsync<T>(work:(owner:O)=>Promise<T>):Promise<T>{
  const owner=this.#live();
  try{return await work(owner);}catch(error){this.#crash(error,"api");throw error;}
 }
 /** Successful exact read: this becomes the kept checkpoint. */
 checkpointJson():string{const json=this.call(owner=>owner.checkpointJson());this.#checkpoint=json;this.#source="exact";this.#edits=0;return json;}
 view<T>(work:(owner:O)=>T&{readonly selection:unknown}):T{const view=this.call(work);this.#selection=view.selection;return view;}
 setPlaceholderLabel(label:string|null):void{this.call(owner=>owner.setPlaceholderLabel(label));this.#placeholder={label};}
 dispose():void{
  if(this.#phase==="disposed")return;
  const broken=this.#phase!=="running";this.#phase="disposed";this.#abort?.abort();this.#thaw();
  const owner=this.#owner;this.#owner=undefined;
  if(!owner)return;
  try{owner.dispose();}catch(error){if(!broken)throw error;/* A crashed native owner may fail to free; its host is already cleared. */}
 }
 #live():O{
  if(this.#phase==="running"&&this.#owner)return this.#owner;
  throw new CrashRecoveryError(this.#phase==="running"?"restarting":this.#phase);
 }
 #callbacks():{onChange:(view:{readonly selection:unknown},outcome:RichCommandOutcome)=>void;onError:(error:unknown)=>void}{
  return {
   onChange:(view,outcome)=>{
    if(this.#phase!=="running")return;
    if(editOutcomes.has(outcome))this.#edits++;
    this.#selection=view.selection;
    this.#hooks.onChange?.(view as never,outcome);
   },
   onError:error=>{
    if(this.#quiet)return;
    try{this.#hooks.onError?.(error);}finally{this.#crash(error,"input");}
   },
  };
 }
 #diagnostic(reason:CrashReason,error:unknown,source:"api"|"input"):CrashDiagnostic{
  return {format:"breditor/crash-diagnostic",formatVersion:1,reason,errorName:errorName(error),source,restartsInWindow:this.#window.length,editsLost:this.#edits,checkpoint:this.#source};
 }
 #crash(error:unknown,source:"api"|"input"):void{
  if(this.#phase!=="running")return;
  const reason=classifyCrash(error);if(!reason)return;
  this.#phase="restarting";this.#freeze();
  const now=Date.now();this.#window=this.#window.filter(time=>now-time<this.#hooks.options.windowMs);
  const diagnostic=this.#diagnostic(reason,error,source),root=this.#hooks.host.getRootNode() as Document|ShadowRoot,active=root.activeElement??null;
  const focused=active!==null&&this.#hooks.host.contains(active);
  emit(this.#hooks.options.onCrash,diagnostic);
  if(this.#phase!=="restarting")return;// Disposed by the host from onCrash.
  if(this.#window.length>=this.#hooks.options.maxRestarts){this.#fail(diagnostic,"budget");return;}
  this.#window.push(now);
  void this.#restart(diagnostic,focused);
 }
 async #restart(diagnostic:CrashDiagnostic,focused:boolean):Promise<void>{
  // Leave the failing call stack before touching the owner.
  await Promise.resolve();
  if(this.#phase!=="restarting")return;
  const checkpointJson=this.#checkpoint;
  let verified=false;try{verified=await this.#hooks.verify(checkpointJson);}catch{verified=false;}
  if(this.#phase!=="restarting")return;
  // Keep the frozen broken owner on screen: no restart from a checkpoint that does not reproduce exactly.
  if(!verified){this.#fail(diagnostic,"verification");return;}
  const broken=this.#owner;this.#owner=undefined;
  try{broken?.dispose();}catch{/* The DOM is released before native free; a poisoned free cannot block the restart. */}
  const abort=new AbortController();this.#abort=abort;
  let next:O;
  try{next=await this.#hooks.open(this.#callbacks(),{checkpointJson,signal:abort.signal});}
  catch{if(this.#phase==="restarting")this.#fail(diagnostic,"reopen");return;}
  finally{if(this.#abort===abort)this.#abort=undefined;}
  if(this.#phase!=="restarting"){try{next.dispose();}catch{/* Disposed during restart. */}return;}
  try{this.#hooks.reapply?.(next);}catch{try{next.dispose();}catch{/* Policy could not be restored. */}this.#fail(diagnostic,"reopen");return;}
  this.#owner=next;this.#last=next;this.#edits=0;this.#restarts++;
  this.#quiet=true;
  try{
   if(this.#placeholder)next.setPlaceholderLabel(this.#placeholder.label);
   const selection=this.#selection;
   // The checkpoint carries its own selection; reapply a later one only when it still resolves.
   if(isPlainSelection(selection)&&JSON.stringify(next.view().selection)!==JSON.stringify(selection))next.execute({kind:"setSelection",selection} as never,false);
  }catch{/* Cheap best effort: the restored checkpoint selection stays. */}
  finally{this.#quiet=false;}
  if(this.#phase!=="restarting")return;
  this.#phase="running";this.#thaw();
  if(focused)try{next.focus();}catch{/* Focus is cosmetic. */}
  try{this.#selection=next.view().selection;}catch{/* Classified on the next call. */}
  emit(this.#hooks.options.onRestarted,{...diagnostic,restarts:this.#restarts});
 }
 #fail(diagnostic:CrashDiagnostic,failure:CrashFailure):void{
  this.#phase="failed";this.#hooks.host.setAttribute(frozenAttribute,"failed");
  emit(this.#hooks.options.onFailed,{...diagnostic,failure});
 }
 #freeze():void{
  const host=this.#hooks.host;
  if(!this.#inert)this.#inert={had:host.hasAttribute("inert"),busy:host.getAttribute("aria-busy")};
  host.setAttribute("inert","");host.setAttribute("aria-busy","true");host.setAttribute(frozenAttribute,"restarting");
 }
 #thaw():void{
  const host=this.#hooks.host,saved=this.#inert;this.#inert=undefined;host.removeAttribute(frozenAttribute);
  if(!saved)return;
  if(!saved.had)host.removeAttribute("inert");
  if(saved.busy===null)host.removeAttribute("aria-busy");else host.setAttribute("aria-busy",saved.busy);
 }
}
function isPlainSelection(value:unknown):boolean{
 return typeof value==="object"&&value!==null&&["text","node","grid"].includes((value as {kind?:unknown}).kind as string);
}
function emit<T>(listener:((value:T)=>void)|undefined,value:T):void{
 try{listener?.(Object.freeze(value));}catch{/* A host listener cannot change recovery. */}
}
