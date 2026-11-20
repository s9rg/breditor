/** Borrowed counts/outline UI; editable DOM and native ownership remain elsewhere. */
import type {RichWritingToolsRead} from "./writing_tools_types.js";
import type {RichWritingToolsHost} from "./writing_tools_host.js";
import {defaultRichUi,richUiError,type RichUiLocale} from "./ui_locale.js";
import {setRichChromeText} from "./ui_chrome_text.js";
export interface RichWritingToolsPanelOptions {
 /** Heading and accessible name; overrides the editor catalog's `writingLabel`. Other text comes from the host's `uiLocale()`. */
 label?:string;pageSize?:number;debounceMs?:number;onError?:(error:unknown)=>void;
}
export interface RichWritingToolsPanelState {readonly disposed:boolean;readonly busy:boolean;readonly metadata:RichWritingToolsRead|null;readonly page:number;readonly pageSize:number;readonly error:string|null}
export interface RichWritingToolsPanel {refresh():void;selectHeading(index:number,revision?:string):Promise<void>;setPage(page:number):void;state():RichWritingToolsPanelState;dispose():void}
const hosts=new WeakSet<HTMLElement>();
class WritingPanel implements RichWritingToolsPanel {
 readonly #root:HTMLElement;readonly #host:RichWritingToolsHost;readonly #options:RichWritingToolsPanelOptions;
 readonly #element:HTMLElement;readonly #counts:HTMLDListElement;readonly #list:HTMLOListElement;readonly #status:HTMLParagraphElement;readonly #pages:HTMLParagraphElement;readonly #previous:HTMLButtonElement;readonly #next:HTMLButtonElement;readonly #refresh:HTMLButtonElement;readonly #abort:AbortController;readonly #unsubscribe:()=>void;
 readonly #pageSize:number;readonly #delay:number;readonly #ui:RichUiLocale;#page=0;#read:RichWritingToolsRead|undefined;#display:RichWritingToolsRead|undefined;#pending=false;#disposed=false;#error:string|null=null;#shown:string|null=null;#timer:ReturnType<typeof setTimeout>|undefined;
 constructor(root:HTMLElement,host:RichWritingToolsHost,options:RichWritingToolsPanelOptions){
  if(hosts.has(root)||root===host.surface||root.contains(host.surface)||host.surface.contains(root)||root.ownerDocument!==host.surface.ownerDocument)throw Error("Writing controls require an unused separate host outside the editing surface");
  const state=host.writingState();if(state.closed||!state.available)throw Error("Use an open editor with complete native writing capabilities");
  const size=options.pageSize??50,delay=options.debounceMs??120;
  if(!Number.isSafeInteger(size)||size<1||size>100||!Number.isSafeInteger(delay)||delay<0||delay>1000||options.label!==undefined&&(typeof options.label!=="string"||!options.label||options.label.length>256))throw new TypeError("Expected bounded writing-control presentation options");
  this.#root=root;this.#host=host;this.#options={...options};this.#pageSize=size;this.#delay=delay;const ui=this.#ui=host.uiLocale?.()??defaultRichUi;
  const d=root.ownerDocument,realm=d.defaultView as unknown as {AbortController:typeof AbortController};this.#abort=new realm.AbortController();
  this.#element=d.createElement("section");this.#element.dataset["breditorWriting"]="";this.#element.setAttribute("aria-label",options.label??ui.text("writingLabel"));ui.applyChrome(this.#element);
  const style=d.createElement("style");style.textContent=styles;const title=d.createElement("h2");title.textContent=options.label??ui.text("writingLabel");
  this.#counts=d.createElement("dl");this.#counts.dataset["writingCounts"]="";this.#list=d.createElement("ol");this.#list.dataset["writingOutline"]="";this.#list.setAttribute("aria-label",ui.text("writingOutlineLabel"));
  // Outline order is logical (document order), so Up/Down/Home/End are the same under LTR and RTL chrome.
  this.#list.addEventListener("keydown",event=>this.#rove(event),{signal:this.#abort.signal});
  this.#pages=d.createElement("p");this.#pages.dataset["writingPages"]="";this.#status=d.createElement("p");this.#status.dataset["writingStatus"]="";this.#status.setAttribute("role","status");
  const actions=d.createElement("div"),button=(name:string,label:string,run:()=>void)=>{const node=d.createElement("button");node.type="button";node.dataset["writingAction"]=name;node.textContent=label;node.addEventListener("click",run,{signal:this.#abort.signal});actions.append(node);return node;};
  this.#previous=button("previous",ui.text("writingPrevious"),()=>this.#attemptPage(this.#page-1));this.#next=button("next",ui.text("writingNext"),()=>this.#attemptPage(this.#page+1));this.#refresh=button("refresh",ui.text("writingRefresh"),()=>this.refresh());
  this.#element.append(style,title,this.#counts,this.#list,this.#pages,actions,this.#status);
  const unsubscribe=host.subscribeWriting(()=>this.#schedule());this.#unsubscribe=unsubscribe;
  try{hosts.add(root);root.replaceChildren(this.#element);this.refresh();}catch(error){unsubscribe();hosts.delete(root);this.#abort.abort();throw error;}
 }
 #report(error:unknown):void{this.#error=error instanceof Error?error.message:String(error);this.#shown=this.#ui.describe(error,this.#error);try{this.#options.onError?.(error);}catch{/* A reporting callback cannot undo native publication. */}}
 #rove(event:KeyboardEvent):void{
  if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  const buttons=[...this.#list.querySelectorAll<HTMLButtonElement>("button")].filter(node=>!node.disabled),index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0||!buttons.length)return;
  event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:Math.min(buttons.length-1,Math.max(0,index+(event.key==="ArrowDown"?1:-1)));buttons[next]!.focus();
 }
 #schedule():void{if(this.#disposed)return;this.#read=undefined;this.#error=this.#shown=null;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#render(false);this.#timer=setTimeout(()=>{this.#timer=undefined;this.refresh();},this.#delay);}
 #render(repaint:boolean):void {
  if(this.#disposed)return;const state=this.#host.writingState(),blocked=state.closed||state.busy||state.composing||this.#pending||!this.#read;
  if(repaint){
   const d=this.#root.ownerDocument,active=d.activeElement,focused=active instanceof d.defaultView!.HTMLElement&&this.#list.contains(active)?active.dataset["writingBlock"]:undefined;
   this.#counts.replaceChildren();const counts=this.#display?.counts;
   if(counts)for(const [key,label]of [["words","writingCountWords"],["graphemes","writingCountGraphemes"],["unicodeScalars","writingCountScalars"],["utf16Units","writingCountUtf16"],["utf8Bytes","writingCountUtf8"],["textBlocks","writingCountBlocks"]] as const){const term=d.createElement("dt"),value=d.createElement("dd");term.textContent=this.#ui.text(label);value.textContent=counts[key];value.dataset["writingCount"]=key;this.#counts.append(term,value);}
   this.#list.replaceChildren();const read=this.#display;if(read){const start=this.#page*this.#pageSize;for(let i=start;i<Math.min(start+this.#pageSize,read.outline.length);i++){const entry=read.outline[i]!,item=d.createElement("li"),button=d.createElement("button");button.type="button";button.dataset["writingBlock"]=entry.block;button.dataset["writingIndex"]=String(i);button.style.paddingInlineStart=`${(entry.level-1)*12+8}px`;setRichChromeText(button,this.#ui,entry.label?(entry.labelTruncated?"writingHeadingTruncated":"writingHeading"):entry.labelTruncated?"writingHeadingOverBudget":"writingHeadingEmpty",{level:entry.level,label:entry.label},["label"]);button.addEventListener("pointerdown",event=>event.preventDefault(),{signal:this.#abort.signal});button.addEventListener("click",()=>{void this.#select(read,i).catch(()=>{/* The action reports the source failure once. */});},{signal:this.#abort.signal});item.append(button);this.#list.append(item);}}
   if(focused){const replacement=[...this.#list.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.dataset["writingBlock"]===focused);replacement?.focus({preventScroll:true});}
  }
  for(const button of this.#list.querySelectorAll<HTMLButtonElement>("button"))button.disabled=blocked;
  const total=this.#display?.outline.length??0,start=this.#page*this.#pageSize;
  const ui=this.#ui;this.#pages.textContent=total?ui.text("writingPages",{start:start+1,end:Math.min(start+this.#pageSize,total),total}):ui.text("writingNoHeadings");
  this.#previous.disabled=blocked||this.#page===0;this.#next.disabled=blocked||start+this.#pageSize>=total;this.#refresh.disabled=state.closed||state.busy||state.composing||this.#pending;
  this.#element.setAttribute("aria-busy",String(!state.closed&&(state.busy||state.composing||this.#pending||!this.#read)));
  const accepted=this.#read?ui.text("writingAccepted",{revision:this.#read.revision}):"";
  this.#status.textContent=state.closed?ui.text("panelEditorClosed"):this.#error?ui.text("writingCountsUnavailable",{error:this.#shown??this.#error}):state.composing?ui.text("writingComposing"):this.#pending?ui.text("writingPending"):!this.#read?ui.text("writingUpdating"):state.readOnly?ui.text("panelStatusPart",{status:accepted,part:ui.text("panelReadOnly")}):accepted;
 }
 refresh():void {
  if(this.#disposed)return;if(this.#timer!==undefined){clearTimeout(this.#timer);this.#timer=undefined;}
  const state=this.#host.writingState();if(state.closed){this.#read=this.#display=undefined;this.#error=this.#shown=null;this.#render(true);return;}
  if(state.busy||state.composing||this.#pending){this.#read=undefined;this.#render(false);return;}
  this.#read=undefined;this.#error=this.#shown=null;
  try{const read=this.#host.readWritingTools(state.revision),now=this.#host.writingState();if(now.closed||now.busy||now.composing||now.revision!==read.revision)throw richUiError("writingErrorChanged");this.#read=this.#display=read;this.#page=Math.min(this.#page,Math.max(0,Math.ceil(read.outline.length/this.#pageSize)-1));}
  catch(error){this.#report(error);}
  this.#render(true);
 }
 async #select(read:RichWritingToolsRead,index:number):Promise<void> {
  let acquired=false;
  try{if(this.#disposed)throw Error("Writing controls are disposed");const state=this.#host.writingState();if(read!==this.#read||state.revision!==read.revision||state.closed||state.busy||state.composing||this.#pending)throw richUiError("writingErrorStale");this.#pending=true;acquired=true;this.#error=this.#shown=null;this.#render(false);await this.#host.selectWritingHeading(read,index,read.revision);}
  catch(error){if(!this.#disposed){this.#report(error);this.#render(false);}throw error;}
  finally{if(acquired){this.#pending=false;if(!this.#disposed){const error=this.#error,shown=this.#shown;this.refresh();if(error!==null){this.#error=error;this.#shown=shown;this.#render(false);}}}}
 }
 selectHeading(index:number,revision=this.#read?.revision):Promise<void>{const read=this.#read;if(!read||read.revision!==revision){const error=richUiError("writingErrorStale");if(!this.#disposed){this.#report(error);this.#render(false);}return Promise.reject(error);}return this.#select(read,index);}
 #attemptPage(page:number):void{try{this.setPage(page);}catch(error){this.#report(error);this.#render(false);}}
 setPage(page:number):void{if(this.#disposed)throw Error("Writing controls are disposed");if(!this.#read||this.#pending)throw richUiError("writingErrorStale");if(!Number.isSafeInteger(page)||page<0||page>=Math.max(1,Math.ceil(this.#read.outline.length/this.#pageSize)))throw RangeError("Writing outline page is outside this read");this.#page=page;this.#render(true);}
 state():RichWritingToolsPanelState{return Object.freeze({disposed:this.#disposed,busy:this.#pending,metadata:this.#read??null,page:this.#page,pageSize:this.#pageSize,error:this.#error});}
 /** Releases only borrowed UI and notifications; never the editor, native owner or durable writer. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#read=this.#display=undefined;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#abort.abort();this.#unsubscribe();this.#element.remove();hosts.delete(this.#root);}
}
export function mountRichWritingTools(root:HTMLElement,host:RichWritingToolsHost,options:RichWritingToolsPanelOptions={}):RichWritingToolsPanel{return new WritingPanel(root,host,options);}
const styles=`[data-breditor-writing]{padding:12px;border:1px solid #bdcdc5;border-radius:8px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-writing] h2{font-size:16px;margin:0 0 8px}[data-breditor-writing] dl{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:4px 12px;margin:8px 0}[data-breditor-writing] dd{margin:0;font-variant-numeric:tabular-nums}[data-breditor-writing] ol{list-style:none;padding:0;margin:12px 0}[data-breditor-writing] li button{display:block;width:100%;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere}[data-breditor-writing] button{padding:6px 8px;margin:2px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-writing] button:disabled{opacity:.5}[data-breditor-writing] p{font-size:12px;margin:8px 0 0}`;
