import {createRichStyleElement} from "./style_element.js";
import type {RichFullscreenController,RichFullscreenHost,RichFullscreenOptions,RichFullscreenState} from "./fullscreen_types.js";
import {captureFullscreenFocus,restoreFullscreenFocus,type FullscreenFocus} from "./fullscreen_focus.js";
import {defaultRichUi,richUiError,type RichUiLocale} from "./ui_locale.js";
/** @internal Last reported failure per controller, so controls can show catalog text for `state().error`. */
const causes=new WeakMap<RichFullscreenController,unknown>();
export function richFullscreenErrorCause(controller:RichFullscreenController):unknown{return causes.get(controller);}
const targets=new WeakMap<HTMLElement,FullscreenController>(),leases=new WeakMap<Document,FullscreenController>();
function flagged(target:HTMLElement):boolean{try{return currentTarget(target)||target.matches(":fullscreen");}catch{return false;}}
/** @internal Respect retargeting through open or closed shadow roots, without claiming a child on top. */
function currentTarget(target:HTMLElement):boolean {
 let node:Element=target;
 for(let depth=0;depth<64;depth++){
  const root=node.getRootNode() as Document|ShadowRoot;
  if(root.fullscreenElement!==node)return false;
  if(root===target.ownerDocument)return true;
  if(!("host" in root))return false;node=root.host;
 }
 return false;
}
class FullscreenController implements RichFullscreenController {
 readonly target:HTMLElement;readonly surface:HTMLElement;
 readonly #host:RichFullscreenHost;readonly #document:Document;readonly #options:RichFullscreenOptions;readonly #abort:AbortController;readonly #unsubscribe:()=>void;readonly #style:HTMLStyleElement;readonly #marker:string;readonly #previousMarker:string|null;
 readonly #listeners=new Set<()=>void>();#disposed=false;#retiring=false;#notifying=false;#operation:"entering"|"exiting"|null=null;#pending:Promise<void>|null=null;#cleanup:Promise<void>|null=null;#focus:FullscreenFocus|null=null;#error:string|null=null;
 constructor(host:RichFullscreenHost,options:RichFullscreenOptions){
  const target=options.target??host.fullscreenRoot,d=host.surface.ownerDocument,state=host.fullscreenState();
  if(state.closed||!d.defaultView||target.ownerDocument!==d||!target.isConnected||!host.surface.isConnected||!target.contains(host.fullscreenRoot)||!target.contains(host.surface)||target===host.surface||host.surface.contains(target))throw Error("Fullscreen requires an open editor and a connected ancestor outside editable content");
  if(targets.has(target)||flagged(target))throw Error("This fullscreen target is already owned or active");
  if(options.navigationUI!==undefined&&!["auto","show","hide"].includes(options.navigationUI))throw TypeError("Expected fullscreen navigationUI auto, show or hide");
  this.#host=host;this.#document=d;this.target=target;this.surface=host.surface;this.#options={...options};this.#abort=new d.defaultView.AbortController();this.#marker=crypto.randomUUID();this.#previousMarker=target.getAttribute("data-breditor-fullscreen-target");this.#style=createRichStyleElement(d,"");
  this.#style.textContent=`[data-breditor-fullscreen-target="${this.#marker}"]:fullscreen{box-sizing:border-box;overflow:auto;background:#fff;padding:16px}`;
  this.#unsubscribe=host.subscribeFullscreen(()=>{if(host.fullscreenState().closed)void this.dispose().catch(()=>{/* Cleanup failure stays readable/retryable on this controller. */});else this.#emit();});
  try{targets.set(target,this);target.setAttribute("data-breditor-fullscreen-target",this.#marker);const root=target.getRootNode();("host" in root?root:d.head).appendChild(this.#style);
   const signal=this.#abort.signal;
   d.addEventListener("fullscreenchange",()=>{this.#reconcile();this.#emit();if(this.#retiring&&!this.#cleanup)void this.dispose().catch(()=>{/* Retain the lease and explicit retry handle. */});},{signal});
   d.addEventListener("focusin",event=>{const focus=this.#focus,node=event.composedPath()[0];if(focus&&node!==focus.node&&node!==d.body&&node!==d.documentElement&&node!==this.target)focus.moved=true;},{capture:true,signal});
   for(const name of ["pointerdown","keydown","beforeinput"] as const)d.addEventListener(name,()=>{if(this.#focus)this.#focus.moved=true;},{capture:true,signal});
  }catch(error){this.#abort.abort();this.#unsubscribe();this.#style.remove();this.#restoreMarker();targets.delete(target);throw error;}
 }
 #supported():boolean{return this.#document.fullscreenEnabled===true&&typeof this.target.requestFullscreen==="function"&&typeof this.#document.exitFullscreen==="function";}
 #leased():boolean{return leases.get(this.#document)===this;}
 #current():boolean{return this.target.ownerDocument===this.#document&&currentTarget(this.target);}
 #flagged():boolean{return this.target.ownerDocument===this.#document&&flagged(this.target);}
 #reconcile():void{if(this.#leased()&&!this.#flagged()&&this.#operation!=="entering")leases.delete(this.#document);}
 #report(error:unknown):void{this.#error=error instanceof Error?error.message:String(error);causes.set(this,error);try{this.#options.onError?.(error);}catch{/* Reporting cannot transfer native fullscreen or editor ownership. */}}
 #emit():void{if(this.#notifying)return;this.#notifying=true;try{for(const listener of [...this.#listeners])try{listener();}catch(error){this.#report(error);}}finally{this.#notifying=false;}}
 #live():void{if(this.#disposed||this.#retiring)throw Error("Fullscreen controller is retiring or disposed");}
 state():RichFullscreenState {
  const state=this.#host.fullscreenState(),active=this.#leased()&&this.#current(),foreign=(this.#document.fullscreenElement??null)!==null&&!active;
  return Object.freeze({...state,supported:this.#supported(),active,foreign,phase:this.#disposed?"disposed":this.#retiring?"retiring":this.#operation??(active?"active":"idle"),retiring:this.#retiring,disposed:this.#disposed,error:this.#error});
 }
 uiLocale():RichUiLocale{return this.#host.uiLocale?.()??defaultRichUi;}
 subscribe(listener:()=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 /** Calls the browser synchronously, before callbacks/microtasks consume the user gesture. */
 enter(revision=this.#host.fullscreenState().revision):Promise<void> {
  try{this.#live();const state=this.#host.fullscreenState();
   if(state.closed||state.busy||state.composing||state.revision!==revision)throw richUiError("fullscreenErrorIdle");
   if(this.#pending||(this.#document.fullscreenElement??null)!==null||leases.has(this.#document))throw richUiError("fullscreenErrorBusy");
   if(!this.#supported())throw richUiError("fullscreenErrorUnavailable");
   if(this.target.ownerDocument!==this.#document||this.surface.ownerDocument!==this.#document||!this.target.isConnected||!this.target.contains(this.#host.fullscreenRoot)||!this.target.contains(this.surface))throw richUiError("fullscreenErrorDetached");
   leases.set(this.#document,this);this.#operation="entering";this.#error=null;this.#focus=captureFullscreenFocus(this.#host,this.target);
   let native:Promise<void>;try{native=this.target.requestFullscreen({navigationUI:this.#options.navigationUI??"auto"});}catch(error){this.#operation=null;this.#focus=null;this.#reconcile();throw error;}
   return this.#track(native,()=>{if(!this.#current())throw richUiError("fullscreenErrorLost");if(!this.#retiring)restoreFullscreenFocus(this.#host,this.target,this.#focus);});
  }catch(error){this.#report(error);this.#emit();return Promise.reject(error);}
 }
 #track(native:Promise<void>,success:()=>void):Promise<void>{
  const pending=Promise.resolve(native).then(success).catch(error=>{this.#report(error);throw error;}).finally(()=>{this.#pending=null;this.#operation=null;this.#focus=null;this.#reconcile();this.#emit();});this.#pending=pending;this.#emit();return pending;
 }
 #exit(retiring:boolean):Promise<void> {
  if(this.#pending)throw richUiError("fullscreenErrorPending");
  if(!this.#leased()){if(!retiring&&(this.#document.fullscreenElement??null)!==null)throw richUiError("fullscreenErrorForeignExit");return Promise.resolve();}
  if(!this.#flagged()){this.#reconcile();return Promise.resolve();}
  if(!this.#current())throw richUiError("fullscreenErrorAbove");
  this.#operation="exiting";this.#error=null;this.#focus=retiring?null:captureFullscreenFocus(this.#host,this.target);
  let native:Promise<void>;try{native=this.#document.exitFullscreen();}catch(error){this.#operation=null;this.#focus=null;throw error;}
  return this.#track(native,()=>{if(this.#flagged())throw richUiError("fullscreenErrorNotReleased");if(!retiring)restoreFullscreenFocus(this.#host,this.target,this.#focus);});
 }
 exit():Promise<void>{try{this.#live();return this.#exit(false);}catch(error){this.#report(error);this.#emit();return Promise.reject(error);}}
 toggle(revision?:string):Promise<void>{return this.#leased()&&this.#flagged()?this.exit():this.enter(revision);}
 #restoreMarker():void{if(this.target.getAttribute("data-breditor-fullscreen-target")!==this.#marker)return;if(this.#previousMarker===null)this.target.removeAttribute("data-breditor-fullscreen-target");else this.target.setAttribute("data-breditor-fullscreen-target",this.#previousMarker);}
 #finish():void{this.#disposed=true;this.#abort.abort();this.#unsubscribe();this.#style.remove();this.#restoreMarker();if(targets.get(this.target)===this)targets.delete(this.target);if(this.#leased())leases.delete(this.#document);this.#emit();this.#listeners.clear();}
 dispose():Promise<void>{
  if(this.#disposed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;
  this.#retiring=true;this.#focus=null;
  // Rejected entry does not prevent retirement. A late successful entry must be exited.
  const pending=this.#pending,work=(pending?pending.catch(()=>{}):Promise.resolve()).then(()=>this.#exit(true)).then(()=>this.#finish()).catch(error=>{this.#report(error);this.#emit();throw error;}).finally(()=>{this.#cleanup=null;});this.#cleanup=work;this.#emit();return work;
 }
}
export function createRichFullscreen(host:RichFullscreenHost,options:RichFullscreenOptions={}):RichFullscreenController{return new FullscreenController(host,options);}
