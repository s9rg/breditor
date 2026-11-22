/** Borrowed counts/outline UI; editable DOM and native ownership remain elsewhere. */
import type {RichWritingHeading,RichWritingToolsRead} from "./writing_tools_types.js";
import type {RichWritingToolsHost} from "./writing_tools_host.js";
import {defaultRichUi,richUiError,type RichUiLocale} from "./ui_locale.js";
import {setRichChromeText} from "./ui_chrome_text.js";
import {headingHierarchy,type HeadingBranch} from "./heading_hierarchy.js";
export interface RichWritingToolsPanelOptions {
 /** Heading and accessible name; overrides the editor catalog's `writingLabel`. Other text comes from the host's `uiLocale()`. */
 label?:string;pageSize?:number;debounceMs?:number;onError?:(error:unknown)=>void;
 /** Show a navigation landmark with a nested heading list in place of the statistics panel. */
 presentation?:"contents";
 /** Contents scrollport. Defaults to the browser viewport. */
 scrollContainer?:HTMLElement;
}
export interface RichWritingToolsPanelState {readonly disposed:boolean;readonly busy:boolean;readonly metadata:RichWritingToolsRead|null;readonly page:number;readonly pageSize:number;readonly error:string|null}
export interface RichWritingToolsPanel {refresh():void;selectHeading(index:number,revision?:string):Promise<void>;setPage(page:number):void;state():RichWritingToolsPanelState;dispose():void}
const hosts=new WeakSet<HTMLElement>();
type IndexedHeading=RichWritingHeading&{readonly index:number};

function visibleHeadings(surface:HTMLElement):Map<string,HTMLElement>{
 const headings=new Map<string,HTMLElement>();
 for(const heading of surface.querySelectorAll<HTMLElement>(":is(h1,h2,h3,h4,h5,h6)[data-rich-text]")){
  const closed=heading.closest("details:not([open])");
  if(!closed||!surface.contains(closed))headings.set(heading.dataset["richText"]!,heading);
 }
 return headings;
}

class WritingPanel implements RichWritingToolsPanel {
 readonly #root:HTMLElement;readonly #host:RichWritingToolsHost;readonly #options:RichWritingToolsPanelOptions;
 readonly #element:HTMLElement;readonly #counts:HTMLDListElement;readonly #list:HTMLOListElement;readonly #status:HTMLParagraphElement;readonly #pages:HTMLParagraphElement;readonly #previous:HTMLButtonElement;readonly #next:HTMLButtonElement;readonly #refresh:HTMLButtonElement;readonly #abort:AbortController;readonly #unsubscribe:()=>void;
 readonly #pageSize:number;readonly #delay:number;readonly #ui:RichUiLocale;#page=0;#read:RichWritingToolsRead|undefined;#display:RichWritingToolsRead|undefined;#pending=false;#disposed=false;#error:string|null=null;#shown:string|null=null;#timer:ReturnType<typeof setTimeout>|undefined;
 readonly #contents:boolean;readonly #actions:HTMLDivElement;#visibleIndexes:readonly number[]|undefined;
 readonly #scrollContainer:HTMLElement|undefined;#headings:ReadonlyMap<string,HTMLElement>=new Map();
 #scrollFrame:number|undefined;
 constructor(root:HTMLElement,host:RichWritingToolsHost,options:RichWritingToolsPanelOptions){
  if(hosts.has(root)||root===host.surface||root.contains(host.surface)||host.surface.contains(root)||root.ownerDocument!==host.surface.ownerDocument)throw Error("Writing controls require an unused separate host outside the editing surface");
  const state=host.writingState();if(state.closed||!state.available)throw Error("Use an open editor with complete native writing capabilities");
  const size=options.pageSize??50,delay=options.debounceMs??120;
  if(!Number.isSafeInteger(size)||size<1||size>100||!Number.isSafeInteger(delay)||delay<0||delay>1000||options.label!==undefined&&(typeof options.label!=="string"||!options.label||options.label.length>256))throw new TypeError("Expected bounded writing-control presentation options");
  if(options.presentation!==undefined&&options.presentation!=="contents")throw new TypeError("Expected contents presentation");
  this.#contents=options.presentation==="contents";
  const scroll=options.scrollContainer,window=root.ownerDocument.defaultView!;
  if(scroll!==undefined&&(!this.#contents||!(scroll instanceof window.HTMLElement)||!scroll.contains(host.surface)))throw new TypeError("The contents scroll container must contain the editing surface");
  this.#scrollContainer=scroll;
  this.#root=root;this.#host=host;this.#options={...options};this.#pageSize=size;this.#delay=delay;const ui=this.#ui=host.uiLocale?.()??defaultRichUi;
  const d=root.ownerDocument,realm=d.defaultView as unknown as {AbortController:typeof AbortController};this.#abort=new realm.AbortController();
  const label=options.label??ui.text(this.#contents?"writingOutlineLabel":"writingLabel");
  this.#element=d.createElement(this.#contents?"nav":"section");this.#element.dataset["breditorWriting"]="";this.#element.toggleAttribute("data-breditor-contents",this.#contents);this.#element.setAttribute("aria-label",label);ui.applyChrome(this.#element);
  const style=d.createElement("style");style.textContent=styles+(this.#contents?contentsStyles:"");const title=d.createElement("h2");title.textContent=label;
  this.#counts=d.createElement("dl");this.#counts.dataset["writingCounts"]="";this.#list=d.createElement("ol");this.#list.dataset["writingOutline"]="";this.#list.setAttribute("aria-label",ui.text("writingOutlineLabel"));
  // Outline order is logical (document order), so Up/Down/Home/End are the same under LTR and RTL chrome.
  this.#list.addEventListener("keydown",event=>this.#rove(event),{signal:this.#abort.signal});
  this.#pages=d.createElement("p");this.#pages.dataset["writingPages"]="";this.#status=d.createElement("p");this.#status.dataset["writingStatus"]="";this.#status.setAttribute("role","status");
  const actions=this.#actions=d.createElement("div"),button=(name:string,label:string,run:()=>void)=>{const node=d.createElement("button");node.type="button";node.dataset["writingAction"]=name;node.textContent=label;node.addEventListener("click",run,{signal:this.#abort.signal});actions.append(node);return node;};
  this.#previous=button("previous",ui.text("writingPrevious"),()=>this.#attemptPage(this.#page-1));this.#next=button("next",ui.text("writingNext"),()=>this.#attemptPage(this.#page+1));this.#refresh=button("refresh",ui.text("writingRefresh"),()=>this.refresh());
  this.#element.append(style,title);
  if(!this.#contents)this.#element.append(this.#counts);
  this.#element.append(this.#list,this.#pages,actions,this.#status);
  const unsubscribe=host.subscribeWriting(()=>this.#schedule());this.#unsubscribe=unsubscribe;
  if(this.#contents){
   window.addEventListener("scroll",()=>this.#scheduleCurrentHeading(),{passive:true,signal:this.#abort.signal});
   window.addEventListener("resize",()=>this.#scheduleCurrentHeading(),{passive:true,signal:this.#abort.signal});
   scroll?.addEventListener("scroll",()=>this.#scheduleCurrentHeading(),{passive:true,signal:this.#abort.signal});
  }
  try{hosts.add(root);root.replaceChildren(this.#element);this.refresh();}catch(error){unsubscribe();hosts.delete(root);this.#abort.abort();throw error;}
 }
 #report(error:unknown):void{this.#error=error instanceof Error?error.message:String(error);this.#shown=this.#ui.describe(error,this.#error);try{this.#options.onError?.(error);}catch{/* A reporting callback cannot undo native publication. */}}
 #rove(event:KeyboardEvent):void{
  if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  const buttons=[...this.#list.querySelectorAll<HTMLButtonElement>("button")].filter(node=>!node.disabled&&node.getAttribute("aria-disabled")!=="true"),index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0||!buttons.length)return;
  event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:Math.min(buttons.length-1,Math.max(0,index+(event.key==="ArrowDown"?1:-1)));buttons[next]!.focus();
 }
 #schedule():void{if(this.#disposed)return;this.#read=undefined;this.#error=this.#shown=null;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#render(false);this.#timer=setTimeout(()=>{this.#timer=undefined;this.refresh();},this.#delay);}
 #total():number{return this.#visibleIndexes?.length??this.#display?.outline.length??0;}
 #scheduleCurrentHeading():void{
  if(!this.#contents||this.#disposed||this.#scrollFrame!==undefined)return;
  const window=this.#root.ownerDocument.defaultView!;
  this.#scrollFrame=window.requestAnimationFrame(()=>{
   this.#scrollFrame=undefined;
   const current=this.#currentHeading();
   for(const button of this.#list.querySelectorAll<HTMLButtonElement>("button[data-writing-block]")){
    if(button.dataset["writingBlock"]===current)button.setAttribute("aria-current","location");
    else button.removeAttribute("aria-current");
   }
  });
 }
 #currentHeading():string|undefined{
  const read=this.#read,indexes=this.#visibleIndexes;
  if(!read||!indexes?.length)return undefined;
  const document=this.#root.ownerDocument,window=document.defaultView!;
  const scroll=this.#scrollContainer,frame=scroll?.getBoundingClientRect();
  const top=frame?Math.max(0,frame.top+scroll!.clientTop):0;
  const bottom=frame?Math.min(window.innerHeight,frame.top+scroll!.clientTop+scroll!.clientHeight):window.innerHeight;
  const surface=this.#host.surface.getBoundingClientRect();
  if(top>=bottom||surface.bottom<=top||surface.top>=bottom)return undefined;
  const padding=Math.min(40,(bottom-top)/8),scroller=scroll??document.scrollingElement;
  const atEnd=!!scroller&&scroller.scrollHeight>scroller.clientHeight&&
   scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<=1;
  let preceding:string|undefined,firstVisible:string|undefined,lastVisible:string|undefined;
  let precedingTop=-Infinity,firstTop=Infinity,lastTop=-Infinity;
  const first=this.#page*this.#pageSize;
  // One neighbor on either side lets a different contents page own the active position.
  for(let offset=Math.max(0,first-1);offset<Math.min(indexes.length,first+this.#pageSize+1);offset++){
   const entry=read.outline[indexes[offset]!]!,element=this.#headings.get(entry.block);
   if(!element?.isConnected)continue;
   const rect=element.getBoundingClientRect();
   if(rect.height<=0)continue;
   if(rect.top<=top+padding&&rect.top>=precedingTop){precedingTop=rect.top;preceding=entry.block;}
   if(rect.bottom<=top||rect.top>=bottom)continue;
   if(rect.top<firstTop){firstTop=rect.top;firstVisible=entry.block;}
   if(rect.top>=lastTop){lastTop=rect.top;lastVisible=entry.block;}
  }
  return (atEnd?lastVisible:preceding)??preceding??firstVisible;
 }
 #headingItem(read:RichWritingToolsRead,entry:IndexedHeading):HTMLLIElement {
  const d=this.#root.ownerDocument,item=d.createElement("li"),button=d.createElement("button");
  button.type="button";button.dataset["writingBlock"]=entry.block;button.dataset["writingIndex"]=String(entry.index);
  if(!this.#contents)button.style.paddingInlineStart=`${(entry.level-1)*12+8}px`;
  if(this.#contents&&entry.label){
   const label=d.createElement("bdi");label.textContent=entry.label+(entry.labelTruncated?" …":"");button.append(label);
  }else setRichChromeText(button,this.#ui,entry.label?(entry.labelTruncated?"writingHeadingTruncated":"writingHeading"):entry.labelTruncated?"writingHeadingOverBudget":"writingHeadingEmpty",{level:entry.level,label:entry.label},["label"]);
  button.addEventListener("pointerdown",event=>event.preventDefault(),{signal:this.#abort.signal});
  button.addEventListener("click",()=>{
   if(button.getAttribute("aria-disabled")==="true")return;
   void this.#select(read,entry.index).catch(()=>{/* The action reports the source failure once. */});
  },{signal:this.#abort.signal});
  item.append(button);return item;
 }
 #appendContents(read:RichWritingToolsRead,branches:readonly HeadingBranch<IndexedHeading>[],list:HTMLOListElement):void{
  for(const {heading,children} of branches){
   const item=this.#headingItem(read,heading);
   if(children.length){
    const nested=this.#root.ownerDocument.createElement("ol");
    this.#appendContents(read,children,nested);item.append(nested);
   }
   list.append(item);
  }
 }
 #renderOutline():void{
  this.#list.replaceChildren();
  const read=this.#display;if(!read)return;
  const entries:IndexedHeading[]=[];
  const start=this.#page*this.#pageSize,end=Math.min(start+this.#pageSize,this.#total());
  for(let offset=start;offset<end;offset++){
   const index=this.#visibleIndexes?.[offset]??offset;
   entries.push({...read.outline[index]!,index});
  }
  if(this.#contents)this.#appendContents(read,headingHierarchy(entries),this.#list);
  else for(const entry of entries)this.#list.append(this.#headingItem(read,entry));
 }
 #render(repaint:boolean):void {
  if(this.#disposed)return;const state=this.#host.writingState(),blocked=state.closed||state.busy||state.composing||this.#pending||!this.#read;
  if(repaint){
   const d=this.#root.ownerDocument,active=d.activeElement,focused=active instanceof d.defaultView!.HTMLElement&&this.#list.contains(active)?active.dataset["writingBlock"]:undefined;
   this.#counts.replaceChildren();const counts=this.#display?.counts;
   if(counts&&!this.#contents)for(const [key,label]of [["words","writingCountWords"],["graphemes","writingCountGraphemes"],["unicodeScalars","writingCountScalars"],["utf16Units","writingCountUtf16"],["utf8Bytes","writingCountUtf8"],["textBlocks","writingCountBlocks"]] as const){const term=d.createElement("dt"),value=d.createElement("dd");term.textContent=this.#ui.text(label);value.textContent=counts[key];value.dataset["writingCount"]=key;this.#counts.append(term,value);}
   this.#renderOutline();
   this.#scheduleCurrentHeading();
   if(focused){const replacement=[...this.#list.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.dataset["writingBlock"]===focused);replacement?.focus({preventScroll:true});}
  }
  for(const button of this.#list.querySelectorAll<HTMLButtonElement>("button")){
   // Keep a contents entry focusable while a peer edit briefly invalidates its navigation target.
   if(this.#contents)button.setAttribute("aria-disabled",String(blocked));
   else button.disabled=blocked;
  }
  const total=this.#total(),start=this.#page*this.#pageSize;
  if(this.#contents){
   this.#actions.hidden=total<=this.#pageSize&&!this.#error;
   this.#pages.hidden=total>0&&total<=this.#pageSize;
  }
  const ui=this.#ui;this.#pages.textContent=total?ui.text("writingPages",{start:start+1,end:Math.min(start+this.#pageSize,total),total}):ui.text("writingNoHeadings");
  this.#previous.disabled=blocked||this.#page===0;this.#next.disabled=blocked||start+this.#pageSize>=total;this.#refresh.disabled=state.closed||state.busy||state.composing||this.#pending;
  this.#element.setAttribute("aria-busy",String(!state.closed&&(state.busy||state.composing||this.#pending||!this.#read)));
  const accepted=this.#read?ui.text("writingAccepted",{revision:this.#read.revision}):"";
  this.#status.textContent=state.closed?ui.text("panelEditorClosed"):this.#error?ui.text("writingCountsUnavailable",{error:this.#shown??this.#error}):state.composing?ui.text("writingComposing"):this.#pending?ui.text("writingPending"):!this.#read?ui.text("writingUpdating"):state.readOnly?ui.text("panelStatusPart",{status:accepted,part:ui.text("panelReadOnly")}):accepted;
 }
 refresh():void {
  if(this.#disposed)return;if(this.#timer!==undefined){clearTimeout(this.#timer);this.#timer=undefined;}
  const state=this.#host.writingState();if(state.closed){this.#read=this.#display=this.#visibleIndexes=undefined;this.#headings=new Map();this.#error=this.#shown=null;this.#render(true);return;}
  if(state.busy||state.composing||this.#pending){this.#read=undefined;this.#render(false);return;}
  this.#read=undefined;this.#error=this.#shown=null;
  try{
   const read=this.#host.readWritingTools(state.revision),now=this.#host.writingState();
   if(now.closed||now.busy||now.composing||now.revision!==read.revision)throw richUiError("writingErrorChanged");
   if(this.#contents){
    this.#headings=visibleHeadings(this.#host.surface);
    this.#visibleIndexes=read.outline.flatMap((heading,index)=>this.#headings.has(heading.block)?[index]:[]);
   }
   this.#read=this.#display=read;this.#page=Math.min(this.#page,Math.max(0,Math.ceil(this.#total()/this.#pageSize)-1));
  }
  catch(error){this.#report(error);}
  this.#render(true);
 }
 async #select(read:RichWritingToolsRead,index:number):Promise<void> {
  let acquired=false;
  try{
   if(this.#disposed)throw Error("Writing controls are disposed");
   const state=this.#host.writingState();
   if(read!==this.#read||state.revision!==read.revision||state.closed||state.busy||state.composing||this.#pending)throw richUiError("writingErrorStale");
   const entry=read.outline[index],target=this.#contents&&entry?visibleHeadings(this.#host.surface).get(entry.block):undefined;
   if(this.#contents&&!target)throw richUiError("writingErrorStale");
   this.#pending=true;acquired=true;this.#error=this.#shown=null;this.#render(false);
   await this.#host.selectWritingHeading(read,index,read.revision);
   if(!this.#disposed&&target?.isConnected)target.scrollIntoView?.({block:"start"});
  }
  catch(error){if(!this.#disposed){this.#report(error);this.#render(false);}throw error;}
  finally{if(acquired){this.#pending=false;if(!this.#disposed){const error=this.#error,shown=this.#shown;this.refresh();if(error!==null){this.#error=error;this.#shown=shown;this.#render(false);}}}}
 }
 selectHeading(index:number,revision=this.#read?.revision):Promise<void>{const read=this.#read;if(!read||read.revision!==revision){const error=richUiError("writingErrorStale");if(!this.#disposed){this.#report(error);this.#render(false);}return Promise.reject(error);}return this.#select(read,index);}
 #attemptPage(page:number):void{try{this.setPage(page);}catch(error){this.#report(error);this.#render(false);}}
 setPage(page:number):void{if(this.#disposed)throw Error("Writing controls are disposed");if(!this.#read||this.#pending)throw richUiError("writingErrorStale");if(!Number.isSafeInteger(page)||page<0||page>=Math.max(1,Math.ceil(this.#total()/this.#pageSize)))throw RangeError("Writing outline page is outside this read");this.#page=page;this.#render(true);}
 state():RichWritingToolsPanelState{return Object.freeze({disposed:this.#disposed,busy:this.#pending,metadata:this.#read??null,page:this.#page,pageSize:this.#pageSize,error:this.#error});}
 /** Releases only borrowed UI and notifications; never the editor, native owner or durable writer. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#read=this.#display=this.#visibleIndexes=undefined;this.#headings=new Map();if(this.#timer!==undefined)clearTimeout(this.#timer);if(this.#scrollFrame!==undefined)this.#root.ownerDocument.defaultView!.cancelAnimationFrame(this.#scrollFrame);this.#abort.abort();this.#unsubscribe();this.#element.remove();hosts.delete(this.#root);}
}
export function mountRichWritingTools(root:HTMLElement,host:RichWritingToolsHost,options:RichWritingToolsPanelOptions={}):RichWritingToolsPanel{return new WritingPanel(root,host,options);}
const styles=`[data-breditor-writing]{padding:12px;border:1px solid #bdcdc5;border-radius:8px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-writing] h2{font-size:16px;margin:0 0 8px}[data-breditor-writing] dl{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:4px 12px;margin:8px 0}[data-breditor-writing] dd{margin:0;font-variant-numeric:tabular-nums}[data-breditor-writing] ol{list-style:none;padding:0;margin:12px 0}[data-breditor-writing] li button{display:block;width:100%;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere}[data-breditor-writing] button{padding:6px 8px;margin:2px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-writing] button:disabled{opacity:.5}[data-breditor-writing] p{font-size:12px;margin:8px 0 0}`;
const contentsStyles=`[data-breditor-writing][data-breditor-contents] ol{list-style:decimal;padding-inline-start:1.5em;margin-block:4px}[data-breditor-writing][data-breditor-contents] li button{display:inline;width:auto;padding:3px 2px;margin:0;border:0;background:transparent;text-decoration:underline;text-underline-offset:.18em}[data-breditor-writing][data-breditor-contents] li button[aria-current="location"]{background:#dcece4;font-weight:650;text-decoration-thickness:2px}[data-breditor-writing][data-breditor-contents] li button[aria-disabled=true]{opacity:.5}`;
