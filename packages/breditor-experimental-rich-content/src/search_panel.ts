/** Borrowed native search UI. Only the editor's named, queued intents can select or replace text. */
import type {RichSearchQuery,RichSearchReplacement,RichSearchResults} from "./core.js";
import type {RichSearchHost} from "./search_host.js";
import {RichSearchOverlay} from "./search_overlay.js";
export interface RichSearchPanelOptions {
 initialQuery?:RichSearchQuery;initialReplacement?:RichSearchReplacement;wrap?:boolean;
 decorations?:boolean;debounceMs?:number;label?:string;onError?:(error:unknown)=>void;onClose?:()=>void;
}
export interface RichSearchPanelState {readonly open:boolean;readonly disposed:boolean;readonly busy:boolean;readonly count:string;readonly active:string|null;readonly query:Readonly<RichSearchQuery>;readonly replacement:Readonly<RichSearchReplacement>;readonly error:string|null}
export interface RichSearchPanel {refresh():void;focus():void;close():void;next(direction?:"next"|"previous"):Promise<void>;replaceOne():Promise<void>;replaceAll():Promise<void>;state():RichSearchPanelState;dispose():void}
const hosts=new WeakSet<HTMLElement>();
class SearchPanel<R extends RichSearchResults> implements RichSearchPanel {
 readonly #root:HTMLElement;readonly #host:RichSearchHost<R>;readonly #options:RichSearchPanelOptions;readonly #element:HTMLDivElement;readonly #abort:AbortController;
 readonly #pattern:HTMLInputElement;readonly #regex:HTMLInputElement;readonly #case:HTMLInputElement;readonly #words:HTMLInputElement;readonly #wrap:HTMLInputElement;readonly #replacement:HTMLInputElement;readonly #captures:HTMLInputElement;readonly #status:HTMLParagraphElement;
 readonly #next:HTMLButtonElement;readonly #previous:HTMLButtonElement;readonly #one:HTMLButtonElement;readonly #all:HTMLButtonElement;
 readonly #unsubscribe:()=>void;readonly #overlay:RichSearchOverlay<R>|undefined;readonly #delay:number;
 #results:R|undefined;#key="";#active:string|null=null;#error:string|null=null;#pending=false;#open=true;#disposed=false;#scheduled=false;#queryComposing=false;#clipped=false;#timer:ReturnType<typeof setTimeout>|undefined;
 constructor(root:HTMLElement,host:RichSearchHost<R>,options:RichSearchPanelOptions){
  if(hosts.has(root)||root===host.surface||root.contains(host.surface)||host.surface.contains(root)||root.ownerDocument!==host.surface.ownerDocument)throw Error("Search controls require an unused separate host outside the editing surface");
  const initial=host.searchState();if(initial.closed||!initial.available)throw Error("Use an open editor with complete native search capabilities");
  const query=JSON.parse(JSON.stringify(options.initialQuery??{pattern:"",mode:"literal",caseSensitive:false,wholeWords:false})) as RichSearchQuery,replacement=JSON.parse(JSON.stringify(options.initialReplacement??{text:"",mode:"literal"})) as RichSearchReplacement;
  if(typeof query.pattern!=="string"||(query.mode!=="literal"&&query.mode!=="regex")||typeof query.caseSensitive!=="boolean"||typeof query.wholeWords!=="boolean"||typeof replacement.text!=="string"||(replacement.mode!=="literal"&&replacement.mode!=="captures"))throw new TypeError("Expected explicit search and replacement options");
  const delay=options.debounceMs??120;if(!Number.isSafeInteger(delay)||delay<0||delay>1000||options.wrap!==undefined&&typeof options.wrap!=="boolean"||options.decorations!==undefined&&typeof options.decorations!=="boolean")throw new TypeError("Expected a bounded search delay and Boolean presentation options");
  this.#root=root;this.#host=host;this.#options={...options};this.#delay=delay;
  const d=root.ownerDocument,realm=d.defaultView as unknown as {AbortController:typeof AbortController};this.#abort=new realm.AbortController();this.#element=d.createElement("div");this.#element.dataset["breditorSearch"]="";this.#element.setAttribute("role","search");this.#element.setAttribute("aria-label",options.label??"Find and replace");
  const style=d.createElement("style");style.textContent=styles;this.#element.append(style);
  const field=(name:string,label:string,value:string)=>{const wrapper=d.createElement("label"),input=d.createElement("input");wrapper.textContent=label;input.dataset["searchField"]=name;input.type="text";input.value=value;wrapper.append(input);this.#element.append(wrapper);return input;};
  const check=(name:string,label:string,value:boolean)=>{const wrapper=d.createElement("label"),input=d.createElement("input");input.dataset["searchField"]=name;input.type="checkbox";input.checked=value;wrapper.append(input,d.createTextNode(label));this.#element.append(wrapper);return input;};
  this.#pattern=field("pattern","Find",query.pattern);this.#regex=check("regex","Regular expression",query.mode==="regex");this.#case=check("case","Match case",query.caseSensitive);this.#words=check("words","Whole words",query.wholeWords);this.#wrap=check("wrap","Wrap",options.wrap??true);
  this.#replacement=field("replacement","Replace with",replacement.text);this.#captures=check("captures","Expand captures",replacement.mode==="captures");
  const button=(name:string,label:string,run:()=>void)=>{const node=d.createElement("button");node.type="button";node.dataset["searchAction"]=name;node.textContent=label;node.addEventListener("click",run,{signal:this.#abort.signal});this.#element.append(node);return node;};
  const action=(run:()=>Promise<void>)=>{void run().catch(()=>{/* Operation already reports its guarded failure. */});};
  this.#previous=button("previous","Previous",()=>action(()=>this.next("previous")));this.#next=button("next","Next",()=>action(()=>this.next()));this.#one=button("replaceOne","Replace",()=>action(()=>this.replaceOne()));this.#all=button("replaceAll","Replace all",()=>action(()=>this.replaceAll()));button("close","Close",()=>this.close());
  this.#status=d.createElement("p");this.#status.dataset["searchStatus"]="";this.#status.setAttribute("role","status");this.#element.append(this.#status);
  this.#element.addEventListener("input",()=>{this.#error=null;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#overlay?.set(undefined,null);if(!this.#queryComposing)this.#timer=setTimeout(()=>{this.#timer=undefined;this.refresh();},this.#delay);},{signal:this.#abort.signal});
  this.#element.addEventListener("change",()=>this.refresh(),{signal:this.#abort.signal});
  this.#element.addEventListener("compositionstart",()=>{this.#queryComposing=true;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#overlay?.set(undefined,null);this.#controls();},{signal:this.#abort.signal});
  this.#element.addEventListener("compositionend",()=>{this.#queryComposing=false;this.refresh();},{signal:this.#abort.signal});
  this.#element.addEventListener("keydown",event=>{if(event.isComposing||this.#queryComposing)return;if(event.key==="Escape"){event.preventDefault();this.close();}else if(event.key==="Enter"&&event.target===this.#pattern){event.preventDefault();action(()=>this.next(event.shiftKey?"previous":"next"));}},{signal:this.#abort.signal});
  let unsubscribe:(()=>void)|undefined,overlay:RichSearchOverlay<R>|undefined;
  try{unsubscribe=host.subscribeSearch(()=>this.#schedule());overlay=options.decorations===false?undefined:new RichSearchOverlay(host,clipped=>{this.#clipped=clipped;this.#controls();});this.#unsubscribe=unsubscribe;this.#overlay=overlay;hosts.add(root);root.replaceChildren(this.#element);this.refresh();}
  catch(error){unsubscribe?.();overlay?.dispose();hosts.delete(root);this.#abort.abort();throw error;}
 }
 #query():RichSearchQuery{return{pattern:this.#pattern.value,mode:this.#regex.checked?"regex":"literal",caseSensitive:this.#case.checked,wholeWords:this.#words.checked};}
 #replacementValue():RichSearchReplacement{return{text:this.#replacement.value,mode:this.#captures.checked?"captures":"literal"};}
 #schedule():void{if(this.#disposed||this.#scheduled)return;this.#scheduled=true;queueMicrotask(()=>{this.#scheduled=false;this.refresh();});}
 #clearResults():void{const result=this.#results;this.#results=undefined;this.#active=null;this.#key="";this.#overlay?.set(undefined,null);result?.dispose();}
 #report(error:unknown):void{this.#error=error instanceof Error?error.message:String(error);this.#controls();try{this.#options.onError?.(error);}catch{/* Reporting cannot rewind publication. */}}
 #controls():void{
  if(this.#disposed)return;const state=this.#host.searchState(),count=this.#results?.metadata().count??"0",blocked=state.closed||state.busy||state.composing||this.#queryComposing||this.#pending||!this.#open,read=blocked||count==="0"||!state.available;
  this.#next.disabled=this.#previous.disabled=read;this.#one.disabled=this.#all.disabled=read||!state.canReplace;
  for(const field of [this.#pattern,this.#regex,this.#case,this.#words,this.#wrap,this.#replacement,this.#captures])field.disabled=state.closed||this.#pending;
  this.#status.textContent=state.closed?"Editor closed":state.composing?"Finish composing in the editor to search":this.#queryComposing?"Finish entering the search text":this.#pending?"Applying guarded search action":this.#error??`${this.#active===null?`${count} matches`:`${Number(this.#active)+1} of ${count}`}${state.readOnly?" · Read-only":!state.canReplace?" · Replacement requires search-enabled recovery":""}${this.#clipped?" · Decoration paint limit reached; every result remains navigable":""}`;
 }
 refresh():void{
  if(this.#disposed)return;const state=this.#host.searchState();
  if(state.closed||!this.#open){this.#clearResults();this.#controls();return;}
  if(state.busy||state.composing||this.#queryComposing||this.#pending){this.#overlay?.set(undefined,null);this.#controls();return;}
  const query=this.#query(),key=JSON.stringify(query);let valid=this.#key===key&&this.#results!==undefined;
  if(valid)try{this.#host.checkSearchResults(this.#results!,state.revision);}catch{valid=false;}
  if(!valid){this.#clearResults();this.#error=null;if(query.pattern)try{this.#results=this.#host.findText(query,state.revision);this.#key=key;}catch(error){this.#report(error);}}
  this.#controls();this.#overlay?.set(this.#results,this.#active);
 }
 async #action(kind:"next"|"previous"|"one"|"all"):Promise<void>{
  let acquired=false;
  try{
   if(this.#disposed||!this.#open)throw Error("Search controls are closed");this.refresh();const state=this.#host.searchState(),results=this.#results;
   if(this.#pending||state.closed||state.busy||state.composing||this.#queryComposing)throw Error("Search actions wait for the current editor operation or composition");
   if(!results||results.metadata().count==="0")return;if((kind==="one"||kind==="all")&&!state.canReplace)throw Error("Replacement requires an editable search-enabled owner");
   const index=kind==="next"||kind==="previous"?results.navigate(this.#active,kind,this.#wrap.checked):this.#active??"0";if(index===null)return;
   this.#pending=true;acquired=true;this.#error=null;this.#controls();
   if(kind==="next"||kind==="previous"){await this.#host.selectSearchMatch(results,index,state.revision);if(this.#results===results&&this.#open)this.#active=index;}
   else if(kind==="one")await this.#host.replaceSearchOne(results,index,this.#replacementValue(),state.revision);
   else await this.#host.replaceSearchAll(results,this.#replacementValue(),state.revision);
  }catch(error){if(!this.#disposed)this.#report(error);throw error;}
  finally{if(acquired){this.#pending=false;if(!this.#disposed){const error=this.#error;this.refresh();if(error!==null){this.#error=error;this.#controls();}}}}
 }
 next(direction:"next"|"previous"="next"):Promise<void>{return this.#action(direction);}
 replaceOne():Promise<void>{return this.#action("one");}
 replaceAll():Promise<void>{return this.#action("all");}
 state():RichSearchPanelState{return Object.freeze({open:this.#open,disposed:this.#disposed,busy:this.#pending,count:this.#results?.metadata().count??"0",active:this.#active,query:Object.freeze(this.#query()),replacement:Object.freeze(this.#replacementValue()),error:this.#error});}
 focus():void{if(this.#disposed)throw Error("Search controls are disposed");this.#open=true;this.#element.hidden=false;this.refresh();this.#pattern.focus();}
 close():void{if(this.#disposed||!this.#open)return;this.#open=false;this.#element.hidden=true;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#clearResults();if(!this.#host.searchState().closed)this.#host.focus();try{this.#options.onClose?.();}catch(error){this.#report(error);}}
 /** Release this panel and its reads/paint only. The editor, native history and durable writers remain owned elsewhere. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#open=false;this.#abort.abort();this.#unsubscribe();if(this.#timer!==undefined)clearTimeout(this.#timer);this.#overlay?.dispose();this.#clearResults();this.#element.remove();hosts.delete(this.#root);}
}
export function mountRichSearchPanel<R extends RichSearchResults>(root:HTMLElement,host:RichSearchHost<R>,options:RichSearchPanelOptions={}):RichSearchPanel{return new SearchPanel(root,host,options);}
const styles=`[data-breditor-search]{display:flex;flex-wrap:wrap;align-items:end;gap:8px;border:1px solid #bdcdc5;border-radius:8px;padding:12px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-search][hidden]{display:none}[data-breditor-search] label{display:flex;align-items:center;gap:5px}[data-breditor-search] input[type=text]{min-width:100px;padding:6px;border:1px solid #aabbb3;border-radius:4px}[data-breditor-search] button{padding:6px 9px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-search] button:disabled{opacity:.5}[data-breditor-search] [data-search-status]{flex-basis:100%;margin:0;font-size:12px}`;
