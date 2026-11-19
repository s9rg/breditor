/**
 * Opt-in slash-command suggestion session. Browser routing and presentation only:
 * the trigger is read from admitted Rust views, and choosing an item publishes two
 * existing typed commands through the borrowed DOM coordinator. No DOM text is edited.
 */
import type {RichCommand,RichCommandOutcome,RichCoreEditor,RichEditorView,RichSelection,RichSelectionPolicy} from "./core.js";
import type {RichSearchHostState} from "./search_host.js";
import {id,isProse,presentationModel,text,type RichPresentationModel} from "./model.js";
import {filterRichSlashItems,requireRichSlashItems,type RichSlashContext,type RichSlashItem} from "./slash_command_items.js";

/** Structural port satisfied by `RichDomEditor` (local or document scope). */
export interface RichSlashCommandHost {
 readonly surface:HTMLElement;
 /** The existing post-publication read channel; listeners never publish reentrantly. */
 searchState():Pick<RichSearchHostState,"revision"|"closed"|"busy"|"composing"|"readOnly">;
 subscribeSearch(listener:()=>void):()=>void;
 view():RichEditorView<RichSelectionPolicy>;
 execute(command:RichCommand,focus?:boolean,expectedRevision?:string):RichCommandOutcome|"queued";
 focus():void;
}
export type RichSlashCancelReason=
 |"dismissed"|"composition"|"trigger-invalidated"|"selection-left"|"query-ended"|"blur"|"read-only"|"editor-closed"|"disposed";
export interface RichSlashProviderRequest {readonly signal:AbortSignal;readonly revision:string;readonly session:number}
/** Synchronous list (filtered locally) or a cancellable provider. Aborted/stale results are discarded. */
export type RichSlashProvider=readonly RichSlashItem[]|((query:string,request:RichSlashProviderRequest)=>readonly RichSlashItem[]|Promise<readonly RichSlashItem[]>);
export interface RichSlashExecution {readonly item:string;readonly removal:RichCommandOutcome;readonly outcome:RichCommandOutcome|null}
export interface RichSlashCommandOptions {
 items:RichSlashProvider;
 /** Optional owner exposed to item preparation, for controls that check owner binding. */
 core?:RichCoreEditor<RichSelectionPolicy>;
 /** Query length after the slash; longer queries end the session. Default 32, maximum 64. */
 maxQueryLength?:number;
 /** Displayed item limit. Default 10, maximum 50. */
 maxItems?:number;
 label?:string;
 /** Menu parent; defaults to the surface document body. Must be outside the editing surface. */
 container?:HTMLElement;
 onOpen?:(state:RichSlashCommandState)=>void;
 onCancel?:(reason:RichSlashCancelReason)=>void;
 onExecute?:(execution:RichSlashExecution)=>void;
 onError?:(error:unknown)=>void;
}
export interface RichSlashCommandState {
 readonly open:boolean;readonly disposed:boolean;readonly session:number|null;
 readonly trigger:Readonly<{block:string;start:number}>|null;readonly query:string;
 readonly items:readonly Readonly<{id:string;label:string}>[];readonly active:number;readonly loading:boolean;
 readonly error:string|null;readonly lastCancel:RichSlashCancelReason|null;
}
export interface RichSlashCommands {
 state():RichSlashCommandState;
 move(delta:number):void;
 /** Remove the typed trigger, then run the chosen item's existing command. */
 choose(index?:number):RichSlashExecution;
 cancel(reason?:RichSlashCancelReason):void;
 dispose():void;
}
interface Trigger {readonly block:string;readonly start:number;readonly prefix:string}
interface Session {readonly id:number;readonly trigger:Trigger;query:string;items:readonly RichSlashItem[];active:number;loading:boolean;error:string|null;generation:number;abort:AbortController|undefined}
type Check={ok:true;view:RichEditorView<RichSelectionPolicy>;model:RichPresentationModel;caret:number;affinity:"before"|"after";query:string}|{ok:false;reason:RichSlashCancelReason};
const surfaces=new WeakSet<HTMLElement>();
const policyOf=(view:RichEditorView<RichSelectionPolicy>):RichSelectionPolicy=>view.format==="breditor/rich-document-view"?"document-v1":"original";
const space=/\s/;

class SlashCommands implements RichSlashCommands {
 readonly #host:RichSlashCommandHost;readonly #options:RichSlashCommandOptions;readonly #abort:AbortController;
 readonly #root:HTMLDivElement;readonly #list:HTMLDivElement;readonly #status:HTMLParagraphElement;readonly #prefix:string;
 readonly #unsubscribe:()=>void;readonly #maxQuery:number;readonly #maxItems:number;readonly #namespace:string;
 readonly #aria=new Map<string,string|null>();
 #session:Session|undefined;#counter=0;#allocated=0n;#armed:{documentJson:string}|undefined;#disposed=false;#lastCancel:RichSlashCancelReason|null=null;
 constructor(host:RichSlashCommandHost,options:RichSlashCommandOptions){
  const surface=host.surface,document=surface.ownerDocument,window=document.defaultView;
  if(!window)throw Error("Slash commands require a live document");
  if(surfaces.has(surface))throw Error("This editing surface already has slash commands");
  const maxQuery=options.maxQueryLength??32,maxItems=options.maxItems??10;
  if(!Number.isSafeInteger(maxQuery)||maxQuery<1||maxQuery>64||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>50)throw new TypeError("Expected bounded slash-command query and item limits");
  if(typeof options.items!=="function")requireRichSlashItems(options.items,Number.MAX_SAFE_INTEGER);
  const container=options.container??document.body;
  if(container===surface||surface.contains(container)||container.ownerDocument!==document)throw Error("Slash-command menus must be mounted outside the editing surface");
  const state=host.searchState();if(state.closed)throw Error("Use an open editor for slash commands");
  this.#host=host;this.#options={...options};this.#maxQuery=maxQuery;this.#maxItems=maxItems;
  const realm=window as unknown as {AbortController:typeof AbortController};this.#abort=new realm.AbortController();
  const unique=globalThis.crypto.randomUUID();this.#prefix=`breditor-slash-${unique.slice(0,8)}`;this.#namespace=`br:${unique}`;
  this.#root=document.createElement("div");this.#root.dataset["breditorSlash"]="";this.#root.hidden=true;
  this.#root.style.cssText="position:fixed;z-index:20;min-width:200px;max-width:320px;max-height:280px;overflow:auto;border:1px solid #aabbb3;border-radius:6px;background:#fff;color:#173d37;box-shadow:0 4px 16px #0002;font:14px system-ui,sans-serif;padding:4px";
  this.#list=document.createElement("div");this.#list.id=`${this.#prefix}-list`;this.#list.setAttribute("role","listbox");this.#list.setAttribute("aria-label",options.label??"Commands");
  this.#status=document.createElement("p");this.#status.dataset["slashStatus"]="";this.#status.setAttribute("role","status");this.#status.setAttribute("aria-live","polite");this.#status.style.cssText="margin:4px;font-size:12px;color:#4a615b";
  this.#root.append(this.#list,this.#status);
  // Options never take focus: the caret and native selection stay in the editor.
  this.#root.addEventListener("pointerdown",event=>event.preventDefault(),{signal:this.#abort.signal});
  this.#root.addEventListener("mousedown",event=>event.preventDefault(),{signal:this.#abort.signal});
  this.#root.addEventListener("click",event=>{const option=(event.target as Element|null)?.closest?.("[data-slash-index]");if(!option||!this.#session)return;event.preventDefault();this.#attempt(()=>this.choose(Number((option as HTMLElement).dataset["slashIndex"])));},{signal:this.#abort.signal});
  // Capture on the document runs before the coordinator's own surface listeners.
  const owned=(target:EventTarget|null):boolean=>target instanceof window.Node&&(target===surface||surface.contains(target));
  document.addEventListener("beforeinput",event=>{const input=event as InputEvent;if(!owned(input.target)||input.isComposing||this.#session||input.inputType!=="insertText"||!input.data?.endsWith("/"))return;this.#arm();},{capture:true,signal:this.#abort.signal});
  document.addEventListener("keydown",event=>this.#key(event),{capture:true,signal:this.#abort.signal});
  document.addEventListener("compositionstart",event=>{if(owned(event.target))this.cancel("composition");},{capture:true,signal:this.#abort.signal});
  surface.addEventListener("focusout",event=>{const next=event.relatedTarget;if(next instanceof window.Node&&this.#root.contains(next))return;this.cancel("blur");},{signal:this.#abort.signal});
  let unsubscribe:(()=>void)|undefined;
  try{unsubscribe=host.subscribeSearch(()=>this.#published());container.append(this.#root);surfaces.add(surface);this.#unsubscribe=unsubscribe;}
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
 #context(model:RichPresentationModel,revision:string):RichSlashContext{
  return {...(this.#options.core?{core:this.#options.core}:{}),model,allocate:(kind:string)=>`${this.#namespace}:${kind}:${this.#allocated++}`,stamp:()=>({replica:"1",counter:String(this.#allocated++),lamport:revision})};
 }
 /** Rust-view validation; the trigger is identified by block id, slash offset and the exact text before it. */
 #check(trigger:Trigger):Check{
  const state=this.#host.searchState();
  if(state.closed)return {ok:false,reason:"editor-closed"};if(state.composing)return {ok:false,reason:"composition"};if(state.readOnly)return {ok:false,reason:"read-only"};
  const view=this.#host.view(),model=presentationModel(view,policyOf(view)),node=model.nodes.get(trigger.block);
  if(!node||!isProse(node)||model.parents.get(trigger.block)?.type==="breditor/image")return {ok:false,reason:"trigger-invalidated"};
  const value=text(node);if(value.slice(0,trigger.start)!==trigger.prefix||value[trigger.start]!=="/")return {ok:false,reason:"trigger-invalidated"};
  const selection=view.selection;
  if(selection?.kind!=="text"||selection.anchor.block!==trigger.block||selection.focus.block!==trigger.block||selection.anchor.offset!==selection.focus.offset)return {ok:false,reason:"selection-left"};
  const caret=Number(selection.focus.offset);if(!Number.isSafeInteger(caret)||caret<=trigger.start||caret>value.length)return {ok:false,reason:"selection-left"};
  const query=value.slice(trigger.start+1,caret);if(query.length>this.#maxQuery||space.test(query)||query.includes("/"))return {ok:false,reason:"query-ended"};
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
  if(!Number.isSafeInteger(caret)||start<0||value[start]!=="/"||start>0&&!space.test(value[start-1]!))return;
  const session:Session={id:++this.#counter,trigger:Object.freeze({block:id(node),start,prefix:value.slice(0,start)}),query:"",items:[],active:0,loading:false,error:null,generation:0,abort:undefined};
  this.#session=session;this.#lastCancel=null;this.#setAria(true);
  const check=this.#check(session.trigger);if(!check.ok){this.cancel(check.reason);return;}
  this.#request(session,check);
  if(this.#session===session)try{this.#options.onOpen?.(this.state());}catch(error){this.#report(error);}
 }
 #request(session:Session,check:Extract<Check,{ok:true}>):void{
  session.abort?.abort();session.query=check.query;session.error=null;
  const generation=++session.generation,provider=this.#options.items;
  const realm=this.#host.surface.ownerDocument.defaultView as unknown as {AbortController:typeof AbortController};const abort=new realm.AbortController();session.abort=abort;
  const live=():boolean=>this.#session===session&&session.generation===generation&&!abort.signal.aborted&&!this.#disposed;
  const apply=(items:unknown):void=>{
   const admitted=requireRichSlashItems(items,Number.MAX_SAFE_INTEGER);
   // Enablement is re-read from the newest Rust view, not the one the provider started from.
   const current=this.#check(session.trigger);if(!current.ok){this.cancel(current.reason);return;}
   const context=this.#context(current.model,current.view.revision);
   session.items=admitted.filter(item=>{try{return item.enabled(context);}catch{return false;}}).slice(0,this.#maxItems);
   session.active=Math.min(session.active,Math.max(0,session.items.length-1));session.loading=false;this.#render();
  };
  let result:unknown;
  try{result=typeof provider==="function"?provider(check.query,Object.freeze({signal:abort.signal,revision:check.view.revision,session:session.id})):filterRichSlashItems(provider,check.query);}
  catch(error){session.loading=false;session.items=[];this.#report(error);return;}
  if(result&&typeof (result as Promise<unknown>).then==="function"){
   session.loading=true;this.#render();
   (result as Promise<unknown>).then(items=>{if(!live())return;try{apply(items);}catch(error){session.loading=false;session.items=[];this.#report(error);}},error=>{if(!live())return;session.loading=false;session.items=[];this.#report(error);});
   return;
  }
  try{apply(result);}catch(error){session.items=[];this.#report(error);}
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
 choose(index?:number):RichSlashExecution{
  if(this.#disposed)throw Error("Slash commands are disposed");
  const session=this.#session;if(!session)throw Error("No slash-command session is open");
  if(session.loading)throw Error("Slash-command suggestions are still loading");
  const item=session.items[index??session.active];if(!item)throw Error("Choose an available slash command");
  const state=this.#host.searchState();if(state.busy)throw Error("Slash commands wait for the current editor operation");
  const check=this.#check(session.trigger);if(!check.ok){this.cancel(check.reason);throw Error("The slash-command trigger is no longer valid");}
  if(!item.enabled(this.#context(check.model,check.view.revision)))throw Error(`${item.label} is not available here`);
  // End the session first: the following publications are this execution, not invalidations.
  this.#end("executed");
  const block=session.trigger.block,selection:Extract<RichSelection,{kind:"text"}>={kind:"text",anchor:{block,offset:String(session.trigger.start),affinity:"after"},focus:{block,offset:String(check.caret),affinity:check.affinity}};
  const removal:RichCommand=check.view.rangeEditing==="general-v1"?{kind:"replaceGeneralRangePlainText",data:{selection,text:"",prefix:`${this.#namespace}:range:${this.#allocated++}`}}:{kind:"replaceTextRange",data:{selection,text:""}};
  const removed=this.#host.execute(removal,true,check.view.revision);
  if(removed==="queued")throw Error("The slash trigger removal was queued; its command was not run");
  const after=this.#host.view(),command=item.command(this.#context(presentationModel(after,policyOf(after)),after.revision));
  let outcome:RichCommandOutcome|null=null;
  if(command){const result=this.#host.execute(command,true,after.revision);if(result==="queued")throw Error("The slash command was queued after its trigger was removed");outcome=result;}
  const execution=Object.freeze({item:item.id,removal:removed,outcome});
  if(!command)this.#report(Error(`${item.label} is no longer applicable; only the typed trigger was removed`));
  try{this.#options.onExecute?.(execution);}catch(error){this.#report(error);}
  return execution;
 }
 #end(reason:RichSlashCancelReason|"executed"):boolean{
  const session=this.#session;if(!session)return false;
  this.#session=undefined;session.abort?.abort();session.generation++;this.#armed=undefined;
  if(reason!=="executed")this.#lastCancel=reason;
  this.#setAria(false);this.#root.hidden=true;this.#list.replaceChildren();this.#status.textContent="";
  return true;
 }
 cancel(reason:RichSlashCancelReason="dismissed"):void{
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
  const document=this.#list.ownerDocument,surface=this.#host.surface;
  const options=session.items.map((item,index)=>{const option=document.createElement("div");option.id=`${this.#prefix}-option-${index}`;option.setAttribute("role","option");option.dataset["slashIndex"]=String(index);option.dataset["slashItem"]=item.id;option.setAttribute("aria-selected",String(index===session.active));option.textContent=item.label;option.style.cssText=`padding:6px 8px;border-radius:4px;cursor:pointer;${index===session.active?"background:#dcebe5;":""}`;if(item.description){const detail=document.createElement("span");detail.textContent=` ${item.description}`;detail.style.cssText="color:#4a615b;font-size:12px";option.append(detail);}return option;});
  this.#list.replaceChildren(...options);this.#list.setAttribute("aria-busy",String(session.loading));
  const active=options[session.active];if(active&&!session.loading)surface.setAttribute("aria-activedescendant",active.id);else surface.removeAttribute("aria-activedescendant");
  this.#status.textContent=session.error??(session.loading?"Loading commands…":session.items.length?`${session.items.length} command${session.items.length===1?"":"s"} available`:"No matching commands");
  this.#root.hidden=false;this.#position();active?.scrollIntoView?.({block:"nearest"});
 }
 #position():void{
  const surface=this.#host.surface,window=surface.ownerDocument.defaultView!;let rect:{left:number;bottom:number}=surface.getBoundingClientRect();
  try{const selection=surface.ownerDocument.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;if(range&&surface.contains(range.startContainer)&&typeof range.getClientRects==="function"){const first=range.getClientRects()[0];if(first)rect=first;}}catch{/* Layout is presentation only. */}
  const left=Math.max(0,Math.min(rect.left,(window.innerWidth||0)-200)),top=Math.max(0,rect.bottom+4);
  this.#root.style.left=`${left}px`;this.#root.style.top=`${top}px`;
 }
 state():RichSlashCommandState{
  const session=this.#session;
  return Object.freeze({open:!!session,disposed:this.#disposed,session:session?.id??null,trigger:session?Object.freeze({block:session.trigger.block,start:session.trigger.start}):null,query:session?.query??"",items:Object.freeze((session?.items??[]).map(item=>Object.freeze({id:item.id,label:item.label}))),active:session?.active??0,loading:session?.loading??false,error:session?.error??null,lastCancel:this.#lastCancel});
 }
 /** Release the menu and listeners only. The editor, its history and native owner remain borrowed. */
 dispose():void{
  if(this.#disposed)return;this.cancel("disposed");this.#disposed=true;this.#abort.abort();this.#unsubscribe();this.#root.remove();surfaces.delete(this.#host.surface);
 }
}
/** Mount one opt-in slash-command controller for a borrowed DOM coordinator. */
export function mountRichSlashCommands(host:RichSlashCommandHost,options:RichSlashCommandOptions):RichSlashCommands{return new SlashCommands(host,options);}
