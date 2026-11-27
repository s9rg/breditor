/**
 * Opt-in floating selection toolbar and keyboard-reachable context menu. Both borrow the coordinator's admitted
 * toolbar controls through RichContextUiHost: one widget, one Rust-derived read/enabled state, one command path.
 * Nothing here edits document DOM, copies selection state or publishes; it only positions and focuses widgets.
 */
import {createRichStyleElement} from "./style_element.js";
import {defaultRichUi,richChromeIsRtl,type RichUiLocale} from "./ui_locale.js";
import {registerRichPresentationShortcut} from "./shortcut_registry.js";
import type {RichContextControlView,RichContextMenu,RichContextMenuOptions,RichContextUiHost,RichContextUiOptions,RichSelectionToolbar,RichSelectionToolbarOptions} from "./context_ui_types.js";
/** Inline formatting and link controls, when the editor's toolbar admits them. */
export const richSelectionToolbarDefaults:readonly string[]=Object.freeze(["bold","italic","underline","strike","code","link","unlink","clear-inline"]);
/** History, inline, block and table controls, when admitted. Disabled entries are hidden by default. */
export const richContextMenuDefaults:readonly string[]=Object.freeze(["undo","redo","bold","italic","underline","strike","code","link","unlink","clear-inline","paragraph","heading","h1","h2","h3","bullet","numbered","unlist","indent","outdent","row","add-row","column","add-column","delete-row","delete-column","merge","split","header","delete-node","remove-node"]);
/** Scoped to the floating widgets; control appearance comes from the editor's toolbar styles. */
export const richContextUiStyles=`[data-breditor-context-ui]{position:fixed;z-index:1000;box-sizing:border-box;display:flex;gap:4px;align-items:center;padding:4px;background:#fff;color:#173d37;border:1px solid #a5b9af;border-radius:6px;box-shadow:0 4px 14px rgba(23,61,55,.18);max-width:calc(100vw - 16px)}[data-breditor-context-ui][hidden]{display:none}[data-breditor-context-ui=selection-toolbar]{flex-wrap:wrap}[data-breditor-context-ui=menu]{flex-direction:column;align-items:stretch;min-width:180px;max-height:calc(100vh - 16px);overflow:auto}[data-breditor-context-ui=menu] .breditor-inline-control{display:flex}[data-breditor-context-ui=menu] .breditor-inline-control>button{flex:1;text-align:start}[data-breditor-context-ui=menu] .breditor-inline-control[hidden]{display:none}`;
/** @internal */
export type Kind="selection-toolbar"|"menu"|"floating-menu";
const leases=new WeakMap<HTMLElement,Set<Kind>>();
const GAP=8;
/** @internal */
export interface Mounted {ui:RichUiLocale;d:Document;element:HTMLElement;views:readonly RichContextControlView[];ids:readonly string[];abort:AbortController;release():void;report(error:unknown):void}
/** @internal Shared by the editor shell's empty-line block menu. */
export function prepare(host:RichContextUiHost,kind:Kind,options:RichContextUiOptions,defaults:readonly string[]):Mounted{
 if(options.controls!==undefined&&(!Array.isArray(options.controls)||options.controls.some(id=>typeof id!=="string"||!id)||new Set(options.controls).size!==options.controls.length||options.controls.length>64))throw TypeError("Expected unique nonempty context control ids");
 if(options.label!==undefined&&(typeof options.label!=="string"||!options.label||options.label.length>256))throw TypeError("Expected a nonempty bounded context UI label");
 const surface=host.surface,d=surface.ownerDocument;if(host.contextUiState().closed||!d.defaultView)throw Error("Context UI requires an open editor in a browsing context");
 const admitted=host.contextControlIds();
 for(const id of options.controls??[])if(!admitted.includes(id))throw Error(`Toolbar control ${id} is not admitted by this editor`);
 const ids=Object.freeze(options.controls?[...options.controls]:defaults.filter(id=>admitted.includes(id)));
 const root=options.container??surface.closest<HTMLElement>("[data-breditor-rich],[data-breditor-shared]")??surface.parentElement;
 if(!root||root.ownerDocument!==d||root===surface||surface.contains(root))throw Error("Context UI needs a container outside editable content in the editor document");
 const used=leases.get(surface)??new Set<Kind>();if(used.has(kind))throw Error(`This editor already has a ${kind==="menu"?"context menu":kind==="floating-menu"?"block menu":"selection toolbar"}`);
 const abort=new AbortController(),element=d.createElement("div"),style=createRichStyleElement(d,richContextUiStyles),ui=host.uiLocale?.()??defaultRichUi;
 element.dataset["breditorContextUi"]=kind;ui.applyChrome(element);element.hidden=true;element.append(style);
 const report=(error:unknown)=>{try{options.onError?.(error);}catch{/* A host reporter cannot change editor ownership. */}};
 try{const views=ids.map(id=>host.mountContextControl(element,id,abort.signal));used.add(kind);leases.set(surface,used);root.append(element);
  return {ui,d,element,views,ids,abort,report,release:()=>{used.delete(kind);}};
 }catch(error){abort.abort();element.remove();throw error;}
}
/** @internal */
export function itemOf(view:RichContextControlView):HTMLElement{return view.element.tagName==="DETAILS"?view.element.querySelector<HTMLElement>(":scope>summary")??view.button:view.button;}
/** @internal */
export function enabledView(view:RichContextControlView):boolean{const item=itemOf(view);return item===view.button?!view.button.disabled:item.getAttribute("aria-disabled")!=="true";}
/** @internal */
export function liveRange(surface:HTMLElement):Range|null{
 const selection=surface.ownerDocument.getSelection?.();if(!selection||!selection.rangeCount)return null;
 const range=selection.getRangeAt(0);return surface.contains(range.commonAncestorContainer)?range.cloneRange():null;
}
function anchorRect(surface:HTMLElement,range:Range|null):DOMRect{
 if(range&&range.startContainer.isConnected&&surface.contains(range.startContainer)){
  const rect=typeof range.getBoundingClientRect==="function"?range.getBoundingClientRect():null;if(rect&&(rect.width||rect.height))return rect;
  const node=range.startContainer,owner=node.nodeType===1?node as Element:node.parentElement;if(owner){const box=owner.getBoundingClientRect();if(box.width||box.height)return box;}
 }
 return surface.getBoundingClientRect();
}
function offscreen(rect:DOMRect,surface:HTMLElement,height:number):boolean{const box=surface.getBoundingClientRect();return rect.bottom<box.top||rect.top>box.bottom||rect.bottom<0||rect.top>height;}
function place(element:HTMLElement,rect:{left:number;top:number;bottom:number;width:number},prefer:"above"|"below"):void{
 const view=element.ownerDocument.defaultView!,width=element.offsetWidth,height=element.offsetHeight,vw=view.innerWidth,vh=view.innerHeight;
 let top=prefer==="above"?rect.top-height-GAP:rect.bottom+GAP;
 if(prefer==="above"&&top<GAP)top=rect.bottom+GAP;else if(prefer==="below"&&top+height>vh-GAP)top=Math.max(GAP,rect.top-height-GAP);
 // Under right-to-left chrome a menu opens toward inline-start: its right edge meets the anchor.
 const start=prefer==="above"?rect.left+rect.width/2-width/2:richChromeIsRtl(element)?rect.left+rect.width-width:rect.left;
 const left=Math.min(Math.max(GAP,start),Math.max(GAP,vw-width-GAP));
 element.style.top=`${Math.round(top)}px`;element.style.left=`${Math.round(left)}px`;
}
/** @internal */
export function rove(event:KeyboardEvent,views:readonly RichContextControlView[],next:string,previous:string):boolean{
 const items=views.filter(view=>!view.element.hidden&&enabledView(view)).map(itemOf),index=items.indexOf(event.target as HTMLElement);
 if(index<0||!items.length)return false;
 const target=event.key===next?items[(index+1)%items.length]:event.key===previous?items[(index-1+items.length)%items.length]:event.key==="Home"?items[0]:event.key==="End"?items[items.length-1]:undefined;
 if(!target)return false;event.preventDefault();target.focus({preventScroll:true});return true;
}
/** @internal */
export function owned(surface:HTMLElement,element:HTMLElement,node:unknown):boolean{return node instanceof Node&&(node===surface||surface.contains(node)||element.contains(node));}

/** Shows the admitted inline controls over a non-collapsed text selection while the editor (or toolbar) has focus. */
export function mountRichSelectionToolbar(host:RichContextUiHost,options:RichSelectionToolbarOptions={}):RichSelectionToolbar{
 const {ui,d,element,views,ids,abort,release,report}=prepare(host,"selection-toolbar",options,richSelectionToolbarDefaults),surface=host.surface,realm=d.defaultView!,signal=abort.signal;
 element.setAttribute("role","toolbar");element.setAttribute("aria-label",options.label??ui.text("selectionToolbarLabel"));element.setAttribute("aria-orientation","horizontal");
 let disposed=false,visible=false,dragging=false,composing=false,dismissed:string|null=null,range:Range|null=null,unsubscribe=()=>{};
 const hide=(restore:boolean)=>{const inside=element.contains(d.activeElement);element.hidden=true;visible=false;if(restore&&inside&&!host.contextUiState().closed)host.focus();};
 const update=()=>{
  if(disposed)return;
  try{
   const state=host.contextUiState();if(state.closed){dispose();return;}
   const active=d.activeElement,inSurface=!!active&&(active===surface||surface.contains(active)),inside=!!active&&element.contains(active);
   if(dismissed!==null&&dismissed!==state.revision)dismissed=null;
   if(inSurface)range=liveRange(surface);
   const show=views.length>0&&!state.composing&&!composing&&!state.readOnly&&state.selection==="text"&&(inSurface||inside)&&!dragging&&dismissed===null;
   const rect=show?anchorRect(surface,range):null;
   if(!rect||offscreen(rect,surface,realm.innerHeight)){hide(true);return;}
   element.hidden=false;visible=true;place(element,rect,"above");
  }catch(error){report(error);}
 };
 const first=()=>views.find(view=>enabledView(view));
 const dismiss=()=>{if(disposed)return;dismissed=host.contextUiState().revision;hide(true);};
 const later=()=>realm.setTimeout(update,0);
 const shortcuts=[registerRichPresentationShortcut(surface,{id:"ui:selection-toolbar",group:"interface",label:ui.text("shortcutFocusToolbar"),keys:[{key:"F10",alt:true}]}),registerRichPresentationShortcut(surface,{id:"ui:escape",group:"interface",label:ui.text("shortcutLeaveUi"),keys:[{key:"Escape"}]})];
 function dispose():void{if(disposed)return;disposed=true;unsubscribe();abort.abort();element.remove();release();for(const free of shortcuts)free();}
 try{
  unsubscribe=host.subscribeContextUi(update);
  d.addEventListener("selectionchange",update,{signal});
  d.addEventListener("focusin",update,{capture:true,signal});
  d.addEventListener("focusout",event=>{if(!owned(surface,element,event.relatedTarget))later();},{capture:true,signal});
  surface.addEventListener("pointerdown",()=>{dragging=true;update();},{signal});
  d.addEventListener("pointerup",()=>{if(dragging){dragging=false;update();}},{capture:true,signal});
  d.addEventListener("pointercancel",()=>{if(dragging){dragging=false;update();}},{capture:true,signal});
  surface.addEventListener("compositionstart",()=>{composing=true;update();},{signal});
  surface.addEventListener("compositionend",()=>{composing=false;update();},{signal});
  realm.addEventListener("scroll",update,{capture:true,passive:true,signal});
  realm.addEventListener("resize",update,{signal});
  surface.addEventListener("keydown",event=>{
   if(event.isComposing||composing)return;
   if(event.altKey&&event.key==="F10"&&visible){const item=first();if(item){event.preventDefault();itemOf(item).focus({preventScroll:true});}}
   else if(event.key==="Escape"&&visible&&!event.defaultPrevented)dismiss();
  },{signal});
  element.addEventListener("keydown",event=>{if(event.isComposing)return;if(event.key==="Escape"){event.preventDefault();dismiss();return;}if(richChromeIsRtl(element))rove(event,views,"ArrowLeft","ArrowRight");else rove(event,views,"ArrowRight","ArrowLeft");},{signal});
  // Background clicks must not blur the editor; control widgets own their own pointer policy.
  element.addEventListener("pointerdown",event=>{if(event.target===element)event.preventDefault();},{signal});
  update();
 }catch(error){dispose();throw error;}
 return {element,
  state:()=>Object.freeze({visible:visible&&!disposed,disposed,controls:ids}),
  focus(){if(disposed)return false;update();const item=visible?first():undefined;if(!item)return false;itemOf(item).focus({preventScroll:true});return true;},
  dismiss,refresh:update,dispose};
}

/** Right click, Shift+F10 or the ContextMenu key in the editor; arrow keys rove between controls. */
export function mountRichContextMenu(host:RichContextUiHost,options:RichContextMenuOptions={}):RichContextMenu{
 if(options.hideDisabled!==undefined&&typeof options.hideDisabled!=="boolean")throw TypeError("Expected boolean hideDisabled");
 const {ui,d,element,views,ids,abort,release,report}=prepare(host,"menu",options,richContextMenuDefaults),surface=host.surface,realm=d.defaultView!,signal=abort.signal,hideDisabled=options.hideDisabled!==false;
 element.setAttribute("role","menu");element.setAttribute("aria-label",options.label??ui.text("contextMenuLabel"));element.setAttribute("aria-orientation","vertical");
 let disposed=false,open=false,anchor:{dx:number;dy:number}|{range:Range|null}|null=null,unsubscribe=()=>{};
 const decorate=()=>{
  for(const view of views){
   const item=itemOf(view),enabled=enabledView(view);view.element.hidden=hideDisabled&&!enabled;item.tabIndex=-1;
   if(item!==view.button){item.setAttribute("role","menuitem");continue;}
   // The shared widget owns aria-pressed on every refresh; mirror it into menu semantics without taking it over.
   const pressed=item.getAttribute("aria-pressed");
   if(pressed===null){item.setAttribute("role","menuitem");item.removeAttribute("aria-checked");}else{item.setAttribute("role","menuitemcheckbox");item.setAttribute("aria-checked",pressed);}
  }
 };
 const items=()=>views.filter(view=>!view.element.hidden&&enabledView(view)).map(itemOf);
 const position=()=>{
  if(!anchor)return;const box=surface.getBoundingClientRect();
  if("dx" in anchor){const x=box.left+anchor.dx,y=box.top+anchor.dy;place(element,{left:x,top:y,bottom:y,width:0},"below");}
  else place(element,anchorRect(surface,anchor.range??liveRange(surface)),"below");
 };
 const close=(returnFocus=true)=>{
  if(!open)return;open=false;anchor=null;const inside=element.contains(d.activeElement);
  for(const panel of element.querySelectorAll("details"))panel.open=false;
  element.hidden=true;if(returnFocus&&inside&&!host.contextUiState().closed)host.focus();
 };
 const openMenu=(point?:{readonly x:number;readonly y:number}):boolean=>{
  if(disposed)return false;
  if(point!==undefined&&(typeof point!=="object"||point===null||!Number.isFinite(point.x)||!Number.isFinite(point.y)))throw TypeError("Expected a finite viewport point");
  const state=host.contextUiState();if(state.closed||state.busy||state.composing||state.readOnly)return false;
  decorate();const list=items();if(!list.length)return false;
  const box=surface.getBoundingClientRect();anchor=point?{dx:point.x-box.left,dy:point.y-box.top}:{range:liveRange(surface)};
  open=true;element.hidden=false;position();list[0]!.focus({preventScroll:true});return true;
 };
 const update=()=>{
  if(disposed)return;
  try{
   const state=host.contextUiState();if(state.closed){dispose();return;}
   if(!open)return;if(state.composing||state.readOnly){close(true);return;}
   const active=d.activeElement,hadFocus=!!active&&element.contains(active);decorate();const list=items();
   if(!list.length){close(true);return;}
   if(hadFocus&&!list.includes(active as HTMLElement)&&!(active as HTMLElement).closest("details"))list[0]!.focus({preventScroll:true});
   position();
  }catch(error){report(error);}
 };
 const shortcuts=[registerRichPresentationShortcut(surface,{id:"ui:context-menu",group:"interface",label:ui.text("shortcutContextMenu"),keys:[{key:"F10",shift:true},{key:"ContextMenu"}]}),registerRichPresentationShortcut(surface,{id:"ui:escape",group:"interface",label:ui.text("shortcutLeaveUi"),keys:[{key:"Escape"}]})];
 function dispose():void{if(disposed)return;close(true);disposed=true;unsubscribe();abort.abort();element.remove();release();for(const free of shortcuts)free();}
 try{
  unsubscribe=host.subscribeContextUi(update);
  surface.addEventListener("contextmenu",event=>{
   // Shift+right-click keeps the browser's own menu (spelling suggestions, native clipboard, inspection).
   if(event.defaultPrevented||event.shiftKey&&(event.clientX||event.clientY))return;
   // Keyboard-invoked context menus report no pointer position; anchor those to the selection.
   const point=event.clientX||event.clientY?{x:event.clientX,y:event.clientY}:undefined;
   try{if(openMenu(point))event.preventDefault();}catch(error){report(error);}
  },{signal});
  surface.addEventListener("keydown",event=>{
   if(event.defaultPrevented||event.isComposing||!(event.shiftKey&&event.key==="F10"||event.key==="ContextMenu"))return;
   try{if(openMenu())event.preventDefault();}catch(error){report(error);}
  },{signal});
  element.addEventListener("keydown",event=>{
   if(event.isComposing)return;
   if(event.key==="Tab"&&element.contains((event.target as HTMLElement).closest("details[open]")))return;
   if(event.key==="Escape"||event.key==="Tab"){event.preventDefault();close(true);return;}
   rove(event,views,"ArrowDown","ArrowUp");
  },{signal});
  // A command closes the menu once its control ran and returned focus to the editor; refused forms stay open.
  element.addEventListener("click",event=>{if(views.some(view=>view.button===event.target)&&!element.contains(d.activeElement))close(false);},{signal});
  element.addEventListener("focusout",event=>{if(!owned(element,element,event.relatedTarget))realm.setTimeout(()=>{if(open&&!element.contains(d.activeElement))close(false);},0);},{signal});
  d.addEventListener("pointerdown",event=>{if(open&&!element.contains(event.target as Node))close(false);},{capture:true,signal});
  realm.addEventListener("scroll",()=>{if(open)position();},{capture:true,passive:true,signal});
  realm.addEventListener("resize",()=>{if(open)position();},{signal});
 }catch(error){dispose();throw error;}
 return {element,
  state:()=>Object.freeze({open:open&&!disposed,disposed,controls:ids}),
  open:openMenu,close,dispose};
}
