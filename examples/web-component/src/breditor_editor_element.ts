import type {LocalEditor,LocalEditorOptions,RichView} from "@breditor/editor";
/** The outcome type `onChange` receives (not re-exported by the package root). */
type RichCommandOutcome=Parameters<NonNullable<LocalEditorOptions["onChange"]>>[1];

/**
 * Framework-neutral `<breditor-editor>` wrapper around the vanilla local owner.
 *
 * This is example code, not a stable SDK export. It exercises the lifecycle contract
 * documented in `packages/breditor-editor/README.md` ("Lifecycle contract for adapters").
 *
 * Attributes and properties:
 * - `initial-document` / `initialDocument`: canonical document JSON used as the seed when
 *   the element opens an editor. Like an input's `defaultValue`, changing it never replaces
 *   a live owner. The element keeps its exact checkpoint across a reconnect; set
 *   `initialDocument` while disconnected to discard that checkpoint and reseed.
 * - `read-only` / `readOnly`: live policy. Applied through `setReadOnly`, never a re-mount.
 * - `label`: accessible label, read when an editor opens.
 *
 * Events (`CustomEvent`, not bubbling or composed):
 * - `breditor-ready` (`detail.editor`), once per opened owner.
 * - `breditor-change` (`detail.view`, `detail.outcome`) after native Rust published a change.
 * - `breditor-error` (`detail.error`) for startup failures and owner-reported errors.
 *   Cancellation by disconnect is not an error and is never reported.
 *
 * The prefixed names avoid the native `change` event that bubbles from toolbar fields.
 * The element owns its light-DOM children: frameworks must render it empty.
 */
export type BreditorEditorPhase="idle"|"starting"|"ready"|"failed";
export interface BreditorReadyDetail {readonly editor:LocalEditor}
export interface BreditorChangeDetail {readonly view:RichView;readonly outcome:RichCommandOutcome}
export interface BreditorErrorDetail {readonly error:unknown}
/** The subset of `openLocalEditor` the element relies on; tests may substitute a fake. */
export type OpenLocalEditor=(options:LocalEditorOptions)=>Promise<LocalEditor>;
export interface BreditorEditorElementOptions {
 /** Usually `openLocalEditor` from `@breditor/editor`. */
 open:OpenLocalEditor;
 /** Extra initial options for every owner, for example `richLanguage` or `history`. */
 defaults?:Omit<LocalEditorOptions,"host"|"signal"|"initial"|"readOnly"|"label"|"onChange"|"onError">;
}
export interface BreditorEditorElement extends HTMLElement {
 initialDocument:string|null;readOnly:boolean;label:string|null;
 readonly phase:BreditorEditorPhase;
 /** The live owner, or `null` before readiness, after failure and while disconnected. */
 readonly editor:LocalEditor|null;
 checkpointJson():string|null;
 /** Restart a failed opening. It never resets a live owner. */
 retry():void;
}

const observed=["initial-document","read-only","label"] as const;

/** Create the element class. Register it with `customElements.define(name, ...)` once. */
export function createBreditorEditorElement(options:BreditorEditorElementOptions):{new():BreditorEditorElement;readonly observedAttributes:readonly string[]} {
 const {open,defaults}=options;
 return class BreditorEditorElementImpl extends HTMLElement implements BreditorEditorElement {
  static get observedAttributes():readonly string[]{return observed;}
  #initialDocument:string|null=null;#label:string|null=null;
  #host:HTMLDivElement|null=null;#editor:LocalEditor|null=null;#phase:BreditorEditorPhase="idle";
  /** Exact checkpoint captured on teardown, so a reconnected element keeps content and Undo/Redo. */
  #checkpoint:string|null=null;
  #controller:AbortController|null=null;
  /** Each opening waits for the previous one to settle (and restore its host) before claiming. */
  #lane:Promise<void>=Promise.resolve();
  #generation=0;#teardownPending=false;

  get initialDocument():string|null{return this.#initialDocument;}
  set initialDocument(value:string|null){
   if(value!==null&&typeof value!=="string")throw new TypeError("initialDocument must be a string or null");
   this.#initialDocument=value;
   // An explicit new seed replaces the retained checkpoint for the next opening only.
   if(this.#editor===null&&this.#phase!=="starting")this.#checkpoint=null;
  }
  get readOnly():boolean{return this.hasAttribute("read-only");}
  set readOnly(value:boolean){this.toggleAttribute("read-only",Boolean(value));}
  get label():string|null{return this.#label;}
  set label(value:string|null){if(value===null)this.removeAttribute("label");else this.setAttribute("label",String(value));}
  get phase():BreditorEditorPhase{return this.#phase;}
  get editor():LocalEditor|null{return this.#editor;}
  checkpointJson():string|null{return this.#editor?.checkpointJson()??this.#checkpoint;}
  override focus(options?:FocusOptions):void{if(this.#editor)this.#editor.focus();else super.focus(options);}
  retry():void{if(this.#phase==="failed"&&this.isConnected)this.#start();}

  attributeChangedCallback(name:string,_old:string|null,value:string|null):void{
   if(name==="initial-document")this.initialDocument=value;
   else if(name==="label")this.#label=value;
   else if(name==="read-only"&&this.#editor){
    try{this.#editor.setReadOnly(value!==null);}catch(error){this.#report(error);}
   }
  }
  connectedCallback():void{
   // Properties assigned before the element was upgraded shadow the accessors; replay them.
   for(const key of ["initialDocument","readOnly","label"] as const){
    if(Object.prototype.hasOwnProperty.call(this,key)){const own=this as unknown as Record<string,unknown>,value=own[key];delete own[key];own[key]=value;}
   }
   if(this.#teardownPending){this.#teardownPending=false;return;}// A synchronous move keeps the live owner.
   if(this.#phase==="idle")this.#start();
  }
  disconnectedCallback():void{
   // Defer teardown by one microtask: insertBefore/append moves disconnect and reconnect
   // synchronously, and the editor's DOM and listeners survive a same-document move.
   this.#teardownPending=true;
   queueMicrotask(()=>{if(this.#teardownPending&&!this.isConnected){this.#teardownPending=false;this.#stop();}});
  }
  adoptedCallback():void{
   // A new document needs new document-level listeners: always restart after adoption.
   if(this.#teardownPending){this.#teardownPending=false;this.#stop();}
  }

  #setPhase(phase:BreditorEditorPhase):void{
   this.#phase=phase;this.dataset["breditorPhase"]=phase;
   if(phase==="starting")this.setAttribute("aria-busy","true");else this.removeAttribute("aria-busy");
  }
  #emit<T>(type:string,detail:T):void{this.dispatchEvent(new CustomEvent<T>(type,{detail}));}
  #report(error:unknown):void{this.#emit<BreditorErrorDetail>("breditor-error",{error});}
  #ensureHost():HTMLDivElement{
   if(this.#host?.parentNode===this)return this.#host;
   // Children are created on connection, never in the constructor (custom element rules).
   const host=this.ownerDocument.createElement("div");host.className="breditor-editor-host";
   this.replaceChildren(host);this.#host=host;return host;
  }
  #start():void{
   const generation=++this.#generation,controller=new AbortController(),host=this.#ensureHost();
   this.#controller=controller;this.#setPhase("starting");
   const checkpoint=this.#checkpoint,seed=this.#initialDocument;
   const opening=this.#lane.then(async()=>{
    if(controller.signal.aborted)return;
    const readOnly=this.readOnly;let editor:LocalEditor;
    try{
     editor=await open({...defaults,host,signal:controller.signal,
      initial:checkpoint!==null?{kind:"checkpoint",checkpointJson:checkpoint}:seed!==null?{kind:"document",documentJson:seed}:{kind:"empty"},
      ...(readOnly?{readOnly:true}:{}),...(this.#label!==null?{label:this.#label}:{}),
      onChange:(view,outcome)=>{if(generation===this.#generation)this.#emit<BreditorChangeDetail>("breditor-change",{view,outcome});},
      onError:error=>{if(generation===this.#generation)this.#report(error);}});
    }catch(error){
     if(controller.signal.aborted||generation!==this.#generation)return;// Cancellation is silent.
     this.#controller=null;this.#setPhase("failed");this.#report(error);return;
    }
    // An opener that ignored the signal, or a disconnect between resolution and here.
    if(controller.signal.aborted||generation!==this.#generation){editor.dispose();return;}
    try{if(this.readOnly!==readOnly)editor.setReadOnly(this.readOnly);}
    catch(error){editor.dispose();this.#controller=null;this.#setPhase("failed");this.#report(error);return;}
    this.#editor=editor;this.#checkpoint=null;this.#controller=null;this.#setPhase("ready");
    this.#emit<BreditorReadyDetail>("breditor-ready",{editor});
   });
   this.#lane=opening.catch(error=>this.#report(error));
  }
  #stop():void{
   this.#generation++;this.#controller?.abort();this.#controller=null;
   const editor=this.#editor;this.#editor=null;
   if(editor){
    try{this.#checkpoint=editor.checkpointJson();}catch(error){this.#report(error);}
    editor.dispose();// Idempotent; releases the host for the next opening.
   }
   this.#setPhase("idle");
  }
 };
}

/** Register `<breditor-editor>` (or another name) unless that name is already defined. */
export function defineBreditorEditorElement(options:BreditorEditorElementOptions,name="breditor-editor"):void{
 if(!customElements.get(name))customElements.define(name,createBreditorEditorElement(options));
}

declare global {
 interface HTMLElementEventMap {
  "breditor-ready":CustomEvent<BreditorReadyDetail>;
  "breditor-change":CustomEvent<BreditorChangeDetail>;
  "breditor-error":CustomEvent<BreditorErrorDetail>;
 }
}
