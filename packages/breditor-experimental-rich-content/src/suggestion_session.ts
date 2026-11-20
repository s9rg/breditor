/**
 * Shared opt-in typed-trigger suggestion session (slash commands, candidate V4 mentions).
 * Browser routing and presentation only: the trigger is read from admitted Rust views, the menu
 * is an accessible listbox that never takes focus, providers may be asynchronous and are
 * cancelled through an AbortSignal (stale results are discarded), and choosing an item
 * publishes typed Rust commands through the borrowed DOM coordinator. No DOM text is edited.
 */
import type {RichCommand,RichCommandOutcome,RichCoreEditor,RichEditorView,RichSelectionPolicy} from "./core.js";
import type {RichSearchHostState} from "./search_host.js";
import {id,isProse,presentationModel,text,type RichPresentationModel} from "./model.js";
import {defaultRichUi,richChromeIsRtl,type RichUiLocale,type RichUiStringKey} from "./ui_locale.js";
import type {ActionContext} from "./actions.js";

/** Structural port satisfied by `RichDomEditor` (local or document scope). */
export interface RichSuggestionHost {
 readonly surface:HTMLElement;
 /** The existing post-publication read channel; listeners never publish reentrantly. */
 searchState():Pick<RichSearchHostState,"revision"|"closed"|"busy"|"composing"|"readOnly">;
 subscribeSearch(listener:()=>void):()=>void;
 view():RichEditorView<RichSelectionPolicy>;
 execute(command:RichCommand,focus?:boolean,expectedRevision?:string):RichCommandOutcome|"queued";
 focus():void;
 /** Optional chrome catalog: menu strings, item labels and the menu's `dir`/`lang`. */
 uiLocale?():RichUiLocale;
 /** Optional native capability probe: `replaceTriggerThen` (trigger removal + command as one Undo step). */
 supportsTriggerComposite?():boolean;
}
export type RichSuggestionCancelReason=
 |"dismissed"|"composition"|"trigger-invalidated"|"selection-left"|"query-ended"|"blur"|"read-only"|"editor-closed"|"disposed";
export interface RichSuggestionProviderRequest {readonly signal:AbortSignal;readonly revision:string;readonly session:number}
export type RichSuggestionContext=ActionContext<RichSelectionPolicy>;
export interface RichSuggestionState {
 readonly open:boolean;readonly disposed:boolean;readonly session:number|null;
 readonly trigger:Readonly<{block:string;start:number}>|null;readonly query:string;
 readonly items:readonly Readonly<{id:string;label:string}>[];readonly active:number;readonly loading:boolean;
 readonly error:string|null;readonly lastCancel:RichSuggestionCancelReason|null;
}
/** Common options of every trigger session. */
export interface RichSuggestionOptions<I,E> {
 /** Synchronous list (filtered locally) or a cancellable provider. Aborted/stale results are discarded. */
 items:readonly I[]|((query:string,request:RichSuggestionProviderRequest)=>readonly I[]|Promise<readonly I[]>);
 core?:RichCoreEditor<RichSelectionPolicy>;
 maxQueryLength?:number;maxItems?:number;label?:string;container?:HTMLElement;
 onOpen?:(state:RichSuggestionState)=>void;
 onCancel?:(reason:RichSuggestionCancelReason)=>void;
 onExecute?:(execution:E)=>void;
 onError?:(error:unknown)=>void;
}
/** One open session's validated trigger and caret, read from the newest Rust view. */
export interface RichSuggestionCheck {readonly view:RichEditorView<RichSelectionPolicy>;readonly model:RichPresentationModel;readonly caret:number;readonly affinity:"before"|"after";readonly query:string}
/** What a concrete menu (slash, mention) plugs into the shared session. */
export interface RichSuggestionSpec<I extends {readonly id:string;readonly label:string;readonly description?:string},E> {
 /** One trigger character typed at a block start or after whitespace. */
 readonly trigger:string;
 /** Dataset keys: menu root, status line, option index and option identity. */
 readonly attributes:{readonly root:string;readonly status:string;readonly index:string;readonly item:string};
 /** DOM id prefix of the listbox and its options. */
 readonly idPrefix:string;
 /** One registry per menu kind: a surface may carry one menu of each kind. */
 readonly surfaces:WeakSet<HTMLElement>;
 readonly strings:{readonly label:RichUiStringKey;readonly loading:RichUiStringKey;readonly countOne:RichUiStringKey;readonly count:RichUiStringKey;readonly empty:RichUiStringKey};
 /** Exact host-facing error messages (kept stable per menu kind). */
 readonly messages:{readonly live:string;readonly duplicate:string;readonly limits:string;readonly container:string;readonly closed:string;readonly disposed:string;readonly none:string;readonly loading:string;readonly choose:string;readonly busy:string;readonly invalid:string};
 /** Validate provider output (throws on malformed items) and apply catalog presentation. */
 admit(items:unknown,ui:RichUiLocale):readonly I[];
 /** Local ranking of a static list. */
 filter(items:readonly I[],query:string):readonly I[];
 enabled(item:I,context:RichSuggestionContext):boolean;
 /** Unavailable-item message (shown when `enabled` is false at choose time). */
 unavailable(item:I,ui:RichUiLocale):string;
 /** Publish the chosen item; the session has already ended. */
 execute(item:I,run:RichSuggestionRun):E;
 /** Extra problem to report after execution, if any. */
 report?(item:I,execution:E,ui:RichUiLocale):Error|undefined;
}
/** Everything an execution needs: the trigger range, fresh contexts and the host. */
export interface RichSuggestionRun {
 readonly host:RichSuggestionHost;readonly check:RichSuggestionCheck;readonly trigger:Readonly<{block:string;start:number}>;
 allocate(kind:string):string;
 context(view:RichEditorView<RichSelectionPolicy>):RichSuggestionContext;
}
interface Trigger {readonly block:string;readonly start:number;readonly prefix:string}
interface Session<I> {readonly id:number;readonly trigger:Trigger;query:string;items:readonly I[];active:number;loading:boolean;error:string|null;generation:number;abort:AbortController|undefined}
type Check=({ok:true}&RichSuggestionCheck)|{ok:false;reason:RichSuggestionCancelReason};
const policyOf=(view:RichEditorView<RichSelectionPolicy>):RichSelectionPolicy=>view.format==="breditor/rich-document-view"?"document-v1":"original";
const space=/\s/;

export class RichSuggestionSession<I extends {readonly id:string;readonly label:string;readonly description?:string},E> {
 readonly #host:RichSuggestionHost;readonly #options:RichSuggestionOptions<I,E>;readonly #spec:RichSuggestionSpec<I,E>;readonly #abort:AbortController;
 readonly #root:HTMLDivElement;readonly #list:HTMLDivElement;readonly #status:HTMLParagraphElement;readonly #prefix:string;
 readonly #unsubscribe:()=>void;readonly #maxQuery:number;readonly #maxItems:number;readonly #namespace:string;
 readonly #aria=new Map<string,string|null>();readonly #ui:RichUiLocale;
 #session:Session<I>|undefined;#counter=0;#allocated=0n;#armed:{documentJson:string}|undefined;#disposed=false;#lastCancel:RichSuggestionCancelReason|null=null;
 constructor(host:RichSuggestionHost,options:RichSuggestionOptions<I,E>,spec:RichSuggestionSpec<I,E>){
  const surface=host.surface,document=surface.ownerDocument,window=document.defaultView,messages=spec.messages,attributes=spec.attributes;
  if(!window)throw Error(messages.live);
  if(spec.surfaces.has(surface))throw Error(messages.duplicate);
  const maxQuery=options.maxQueryLength??32,maxItems=options.maxItems??10;
  if(!Number.isSafeInteger(maxQuery)||maxQuery<1||maxQuery>64||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>50)throw new TypeError(messages.limits);
  this.#ui=host.uiLocale?.()??defaultRichUi;
  if(typeof options.items!=="function")spec.admit(options.items,this.#ui);
  const container=options.container??document.body;
  if(container===surface||surface.contains(container)||container.ownerDocument!==document)throw Error(messages.container);
  const state=host.searchState();if(state.closed)throw Error(messages.closed);
  this.#host=host;this.#options={...options};this.#spec=spec;this.#maxQuery=maxQuery;this.#maxItems=maxItems;
  const realm=window as unknown as {AbortController:typeof AbortController};this.#abort=new realm.AbortController();
  const unique=globalThis.crypto.randomUUID();this.#prefix=`${spec.idPrefix}-${unique.slice(0,8)}`;this.#namespace=`br:${unique}`;
  this.#root=document.createElement("div");this.#root.dataset[attributes.root]="";this.#ui.applyChrome(this.#root);this.#root.hidden=true;
  this.#root.style.cssText="position:fixed;z-index:20;min-width:200px;max-width:320px;max-height:280px;overflow:auto;border:1px solid #aabbb3;border-radius:6px;background:#fff;color:#173d37;box-shadow:0 4px 16px #0002;font:14px system-ui,sans-serif;padding:4px";
  this.#list=document.createElement("div");this.#list.id=`${this.#prefix}-list`;this.#list.setAttribute("role","listbox");this.#list.setAttribute("aria-label",options.label??this.#ui.text(spec.strings.label));
  this.#status=document.createElement("p");this.#status.dataset[attributes.status]="";this.#status.setAttribute("role","status");this.#status.setAttribute("aria-live","polite");this.#status.style.cssText="margin:4px;font-size:12px;color:#4a615b";
  this.#root.append(this.#list,this.#status);
  // Options never take focus: the caret and native selection stay in the editor.
  this.#root.addEventListener("pointerdown",event=>event.preventDefault(),{signal:this.#abort.signal});
  this.#root.addEventListener("mousedown",event=>event.preventDefault(),{signal:this.#abort.signal});
  const indexSelector=`[data-${attributes.index.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}]`;
  this.#root.addEventListener("click",event=>{const option=(event.target as Element|null)?.closest?.(indexSelector);if(!option||!this.#session)return;event.preventDefault();this.#attempt(()=>this.choose(Number((option as HTMLElement).dataset[attributes.index])));},{signal:this.#abort.signal});
  // Capture on the document runs before the coordinator's own surface listeners.
  const owned=(target:EventTarget|null):boolean=>target instanceof window.Node&&(target===surface||surface.contains(target));
  document.addEventListener("beforeinput",event=>{const input=event as InputEvent;if(!owned(input.target)||input.isComposing||this.#session||input.inputType!=="insertText"||!input.data?.endsWith(spec.trigger))return;this.#arm();},{capture:true,signal:this.#abort.signal});
  document.addEventListener("keydown",event=>this.#key(event),{capture:true,signal:this.#abort.signal});
  document.addEventListener("compositionstart",event=>{if(owned(event.target))this.cancel("composition");},{capture:true,signal:this.#abort.signal});
  surface.addEventListener("focusout",event=>{const next=event.relatedTarget;if(next instanceof window.Node&&this.#root.contains(next))return;this.cancel("blur");},{signal:this.#abort.signal});
  let unsubscribe:(()=>void)|undefined;
  try{unsubscribe=host.subscribeSearch(()=>this.#published());container.append(this.#root);spec.surfaces.add(surface);this.#unsubscribe=unsubscribe;}
  catch(error){unsubscribe?.();this.#abort.abort();this.#root.remove();throw error;}
 }
 #arm():void{
  try{const armed={documentJson:this.#host.view().documentJson};this.#armed=armed;setTimeout(()=>{if(this.#armed===armed)this.#armed=undefined;},0);}catch{this.#armed=undefined;}
 }
 #attempt(work:()=>void):void{try{work();}catch(error){this.#report(error);}}
 #report(error:unknown):void{
  const session=this.#session;if(session){session.error=error instanceof Error?error.message:String(error);this.#render();}
  try{this.#options.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}
 }
 #context(model:RichPresentationModel,revision:string):RichSuggestionContext{
  return {...(this.#options.core?{core:this.#options.core}:{}),model,allocate:(kind:string)=>`${this.#namespace}:${kind}:${this.#allocated++}`,stamp:()=>({replica:"1",counter:String(this.#allocated++),lamport:revision})};
 }
 /** Rust-view validation; the trigger is identified by block id, trigger offset and the exact text before it. */
 #check(trigger:Trigger):Check{
  const state=this.#host.searchState(),mark=this.#spec.trigger;
  if(state.closed)return {ok:false,reason:"editor-closed"};if(state.composing)return {ok:false,reason:"composition"};if(state.readOnly)return {ok:false,reason:"read-only"};
  const view=this.#host.view(),model=presentationModel(view,policyOf(view)),node=model.nodes.get(trigger.block);
  if(!node||!isProse(node)||model.parents.get(trigger.block)?.type==="breditor/image")return {ok:false,reason:"trigger-invalidated"};
  const value=text(node);if(value.slice(0,trigger.start)!==trigger.prefix||value[trigger.start]!==mark)return {ok:false,reason:"trigger-invalidated"};
  const selection=view.selection;
  if(selection?.kind!=="text"||selection.anchor.block!==trigger.block||selection.focus.block!==trigger.block||selection.anchor.offset!==selection.focus.offset)return {ok:false,reason:"selection-left"};
  const caret=Number(selection.focus.offset);if(!Number.isSafeInteger(caret)||caret<=trigger.start||caret>value.length)return {ok:false,reason:"selection-left"};
  const query=value.slice(trigger.start+1,caret);if(query.length>this.#maxQuery||space.test(query)||query.includes(mark))return {ok:false,reason:"query-ended"};
  return {ok:true,view,model,caret,affinity:selection.focus.affinity,query};
 }
 #published():void{
  if(this.#disposed)return;
  try{
   const session=this.#session;
   if(session){
    const check=this.#check(session.trigger);if(!check.ok){this.cancel(check.reason);return;}
    // A changed query always re-requests. Unrelated publications (including remote edits) only re-filter a
    // static list; a provider is not called again for the same query, so remote typing cannot flood it.
    if(check.query!==session.query||typeof this.#options.items!=="function"&&!session.loading)this.#request(session,check);
    return;
   }
   const armed=this.#armed;if(!armed)return;
   const state=this.#host.searchState();if(state.closed||state.busy||state.composing||state.readOnly)return;
   const view=this.#host.view();if(view.documentJson===armed.documentJson)return;
   this.#armed=undefined;this.#open(view);
  }catch(error){this.#report(error);}
 }
 #open(view:RichEditorView<RichSelectionPolicy>):void{
  const selection=view.selection;if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset)return;
  const model=presentationModel(view,policyOf(view)),node=model.nodes.get(selection.focus.block);
  if(!node||!isProse(node)||model.parents.get(id(node))?.type==="breditor/image")return;
  const value=text(node),caret=Number(selection.focus.offset),start=caret-1;
  if(!Number.isSafeInteger(caret)||start<0||value[start]!==this.#spec.trigger||start>0&&!space.test(value[start-1]!))return;
  const session:Session<I>={id:++this.#counter,trigger:Object.freeze({block:id(node),start,prefix:value.slice(0,start)}),query:"",items:[],active:0,loading:false,error:null,generation:0,abort:undefined};
  this.#session=session;this.#lastCancel=null;this.#setAria(true);
  const check=this.#check(session.trigger);if(!check.ok){this.cancel(check.reason);return;}
  this.#request(session,check);
  if(this.#session===session)try{this.#options.onOpen?.(this.state());}catch(error){this.#report(error);}
 }
 #request(session:Session<I>,check:Extract<Check,{ok:true}>):void{
  session.abort?.abort();session.query=check.query;session.error=null;
  const generation=++session.generation,provider=this.#options.items,spec=this.#spec;
  const realm=this.#host.surface.ownerDocument.defaultView as unknown as {AbortController:typeof AbortController};const abort=new realm.AbortController();session.abort=abort;
  const live=():boolean=>this.#session===session&&session.generation===generation&&!abort.signal.aborted&&!this.#disposed;
  // Provider output is admitted here; a static list was admitted before local filtering.
  const apply=(items:unknown,filtered=false):void=>{
   const admitted=filtered?items as readonly I[]:spec.admit(items,this.#ui);
   // Enablement is re-read from the newest Rust view, not the one the provider started from.
   const current=this.#check(session.trigger);if(!current.ok){this.cancel(current.reason);return;}
   const context=this.#context(current.model,current.view.revision);
   session.items=admitted.filter(item=>{try{return spec.enabled(item,context);}catch{return false;}}).slice(0,this.#maxItems);
   session.active=Math.min(session.active,Math.max(0,session.items.length-1));session.loading=false;this.#render();
  };
  let result:unknown;
  try{result=typeof provider==="function"?provider(check.query,Object.freeze({signal:abort.signal,revision:check.view.revision,session:session.id})):spec.filter(spec.admit(provider,this.#ui),check.query);}
  catch(error){session.loading=false;session.items=[];this.#report(error);return;}
  if(result&&typeof (result as Promise<unknown>).then==="function"){
   session.loading=true;this.#render();
   (result as Promise<unknown>).then(items=>{if(!live())return;try{apply(items);}catch(error){session.loading=false;session.items=[];this.#report(error);}},error=>{if(!live())return;session.loading=false;session.items=[];this.#report(error);});
   return;
  }
  try{apply(result,typeof provider!=="function");}catch(error){session.items=[];this.#report(error);}
 }
 #key(event:KeyboardEvent):void{
  const session=this.#session,surface=this.#host.surface;
  if(!session||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||!(event.target instanceof surface.ownerDocument.defaultView!.Node)||!(event.target===surface||surface.contains(event.target)))return;
  const consume=():void=>{event.preventDefault();event.stopImmediatePropagation();};
  if(event.key==="ArrowDown"||event.key==="ArrowUp"){consume();this.move(event.key==="ArrowDown"?1:-1);return;}
  if(event.key==="Escape"){consume();this.cancel("dismissed");return;}
  if((event.key==="Enter"&&!event.shiftKey||event.key==="Tab"&&!event.shiftKey)&&session.items.length&&!session.loading){consume();this.#attempt(()=>{this.choose();});}
 }
 move(delta:number):void{
  const session=this.#session;if(!session||!session.items.length)return;
  const size=session.items.length;session.active=((session.active+Math.trunc(delta))%size+size)%size;this.#render();
 }
 choose(index?:number):E{
  const messages=this.#spec.messages;
  if(this.#disposed)throw Error(messages.disposed);
  const session=this.#session;if(!session)throw Error(messages.none);
  if(session.loading)throw Error(messages.loading);
  const item=session.items[index??session.active];if(!item)throw Error(messages.choose);
  const state=this.#host.searchState();if(state.busy)throw Error(messages.busy);
  const check=this.#check(session.trigger);if(!check.ok){this.cancel(check.reason);throw Error(messages.invalid);}
  if(!this.#spec.enabled(item,this.#context(check.model,check.view.revision)))throw Error(this.#spec.unavailable(item,this.#ui));
  // End the session first: the following publications are this execution, not invalidations.
  this.#end("executed");
  const execution=this.#spec.execute(item,Object.freeze({host:this.#host,check,trigger:Object.freeze({block:session.trigger.block,start:session.trigger.start}),
   allocate:(kind:string)=>`${this.#namespace}:${kind}:${this.#allocated++}`,
   context:(view:RichEditorView<RichSelectionPolicy>)=>this.#context(presentationModel(view,policyOf(view)),view.revision)}));
  const problem=this.#spec.report?.(item,execution,this.#ui);if(problem)this.#report(problem);
  try{this.#options.onExecute?.(execution);}catch(error){this.#report(error);}
  return execution;
 }
 #end(reason:RichSuggestionCancelReason|"executed"):boolean{
  const session=this.#session;if(!session)return false;
  this.#session=undefined;session.abort?.abort();session.generation++;this.#armed=undefined;
  if(reason!=="executed")this.#lastCancel=reason;
  this.#setAria(false);this.#root.hidden=true;this.#list.replaceChildren();this.#status.textContent="";
  return true;
 }
 cancel(reason:RichSuggestionCancelReason="dismissed"):void{
  if(!this.#end(reason))return;
  try{this.#options.onCancel?.(reason);}catch(error){this.#report(error);}
 }
 #setAria(open:boolean):void{
  const surface=this.#host.surface,names=["aria-autocomplete","aria-controls","aria-expanded","aria-activedescendant"];
  if(open){for(const name of names)if(!this.#aria.has(name))this.#aria.set(name,surface.getAttribute(name));surface.setAttribute("aria-autocomplete","list");surface.setAttribute("aria-controls",this.#list.id);surface.setAttribute("aria-expanded","true");return;}
  for(const [name,value] of this.#aria)if(value===null)surface.removeAttribute(name);else surface.setAttribute(name,value);this.#aria.clear();
 }
 #render():void{
  const session=this.#session;if(!session||this.#disposed)return;
  const document=this.#list.ownerDocument,surface=this.#host.surface,{attributes,strings}=this.#spec;
  const options=session.items.map((item,index)=>{const option=document.createElement("div");option.id=`${this.#prefix}-option-${index}`;option.setAttribute("role","option");option.dataset[attributes.index]=String(index);option.dataset[attributes.item]=item.id;option.setAttribute("aria-selected",String(index===session.active));option.textContent=item.label;option.style.cssText=`padding:6px 8px;border-radius:4px;cursor:pointer;${index===session.active?"background:#dcebe5;":""}`;if(item.description){const detail=document.createElement("span");detail.textContent=` ${item.description}`;detail.style.cssText="color:#4a615b;font-size:12px";option.append(detail);}return option;});
  this.#list.replaceChildren(...options);this.#list.setAttribute("aria-busy",String(session.loading));
  const active=options[session.active];if(active&&!session.loading)surface.setAttribute("aria-activedescendant",active.id);else surface.removeAttribute("aria-activedescendant");
  this.#status.textContent=session.error??(session.loading?this.#ui.text(strings.loading):session.items.length===1?this.#ui.text(strings.countOne):session.items.length?this.#ui.text(strings.count,{count:session.items.length}):this.#ui.text(strings.empty));
  this.#root.hidden=false;this.#position();active?.scrollIntoView?.({block:"nearest"});
 }
 #position():void{
  const surface=this.#host.surface,window=surface.ownerDocument.defaultView!;let rect:{left:number;bottom:number;width?:number}=surface.getBoundingClientRect();
  try{const selection=surface.ownerDocument.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;if(range&&surface.contains(range.startContainer)&&typeof range.getClientRects==="function"){const first=range.getClientRects()[0];if(first)rect=first;}}catch{/* Layout is presentation only. */}
  // Under right-to-left chrome the menu extends toward inline-start from the caret.
  const start=richChromeIsRtl(this.#root)?rect.left+(rect.width??0)-(this.#root.offsetWidth||200):rect.left;
  const left=Math.max(0,Math.min(start,(window.innerWidth||0)-200)),top=Math.max(0,rect.bottom+4);
  this.#root.style.left=`${left}px`;this.#root.style.top=`${top}px`;
 }
 state():RichSuggestionState{
  const session=this.#session;
  return Object.freeze({open:!!session,disposed:this.#disposed,session:session?.id??null,trigger:session?Object.freeze({block:session.trigger.block,start:session.trigger.start}):null,query:session?.query??"",items:Object.freeze((session?.items??[]).map(item=>Object.freeze({id:item.id,label:item.label}))),active:session?.active??0,loading:session?.loading??false,error:session?.error??null,lastCancel:this.#lastCancel});
 }
 /** Release the menu and listeners only. The editor, its history and native owner remain borrowed. */
 dispose():void{
  if(this.#disposed)return;this.cancel("disposed");this.#disposed=true;this.#abort.abort();this.#unsubscribe();this.#root.remove();this.#spec.surfaces.delete(this.#host.surface);
 }
}
