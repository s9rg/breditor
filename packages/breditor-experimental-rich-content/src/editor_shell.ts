/**
 * Opt-in editor shell (docs/EDITOR_SHELL.md): a WAI-ARIA menu bar, a keyboard shortcut help dialog and an empty-line
 * block menu. Like the selection toolbar and context menu, every command item is an admitted toolbar control borrowed
 * through RichContextUiHost (one widget, one Rust-derived state, one command path). Nothing here edits document DOM,
 * copies selection or format state, or publishes; the shell only shows, positions and focuses presentation.
 */
import {defaultRichUi,richChromeIsRtl,type RichUiLocale,type RichUiStringKey} from "./ui_locale.js";
import {enabledView,itemOf,liveRange,owned,prepare,rove,mountRichSelectionToolbar} from "./context_ui.js";
import type {RichContextControlView,RichContextUiHost,RichSelectionToolbar} from "./context_ui_types.js";
import {detectRichShortcutPlatform,formatRichShortcut,matchesRichShellShortcut,parseRichShellShortcut,registerRichPresentationShortcut,richActiveShortcuts,richShortcutGroups,type RichShortcutChord,type RichShortcutEntry,type RichShortcutGroup,type RichShortcutPlatform} from "./shortcut_registry.js";
import type {RichBalloonBlockLayout,RichBalloonBlockLayoutOptions,RichFloatingMenu,RichFloatingMenuOptions,RichMenuBar,RichMenuBarMenu,RichMenuBarOptions,RichShortcutHelp,RichShortcutHelpOptions} from "./editor_shell_types.js";

/** Standard menus, filtered to what the editor's toolbar admits; empty menus are dropped. */
export const richMenuBarDefaults:readonly RichMenuBarMenu[]=Object.freeze([
 {id:"edit",controls:["undo","redo","delete-node","remove-node"]},
 {id:"insert",controls:["link","unlink","table","horizontal-rule","page-break","details","table-caption","bookmark","link-bookmark","remove-bookmark"]},
 {id:"format",controls:["bold","italic","underline","strike","code","subscript","superscript","text-color","background-color","text-size","font-family","clear-inline","paragraph","heading","h1","h2","h3","blockquote","unquote","code-block","bullet","numbered","tasks","unlist","indent","outdent","list-numbering","block-alignment","block-direction","block-indent","block-line-height","reset-block-layout"]},
 {id:"table",controls:["row","add-row","row-up","row-down","column","add-column","column-left","column-right","delete-row","delete-column","merge","split","header","column-width"]},
].map(menu=>Object.freeze({...menu,controls:Object.freeze(menu.controls)})));
/** Block insert controls offered at an empty paragraph, when admitted. */
export const richFloatingMenuDefaults:readonly string[]=Object.freeze(["heading","h1","h2","h3","bullet","numbered","tasks","blockquote","code-block","table","horizontal-rule","page-break","details"]);
const menuLabels:Readonly<Record<string,RichUiStringKey>>={edit:"menuEdit",insert:"menuInsert",format:"menuFormat",table:"menuTable",tools:"menuTools",help:"menuHelp"};
export const richEditorShellStyles=`[data-breditor-menubar]{display:flex;flex-wrap:wrap;gap:2px;align-items:center;padding:2px 4px;margin-bottom:4px;border-bottom:1px solid #a5b9af;background:#f7faf8;color:#173d37}[data-breditor-menubar]>.breditor-menubar-menu{position:relative}[data-breditor-menubar] [aria-haspopup=menu]{background:none;border:0;border-radius:4px;padding:4px 10px;font:inherit;color:inherit;cursor:pointer}[data-breditor-menubar] [aria-haspopup=menu]:hover,[data-breditor-menubar] [aria-expanded=true]{background:#e1eee8}[data-breditor-menubar] :focus-visible{outline:2px solid #2f7d68;outline-offset:1px}[data-breditor-menubar] [role=menu]{position:absolute;top:100%;inset-inline-start:0;z-index:1000;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;gap:2px;min-width:200px;max-height:70vh;overflow:auto;padding:4px;background:#fff;border:1px solid #a5b9af;border-radius:6px;box-shadow:0 4px 14px rgba(23,61,55,.18)}[data-breditor-menubar] [role=menu][hidden]{display:none}[data-breditor-menubar] [role=menu] .breditor-inline-control{display:flex}[data-breditor-menubar] [role=menu] .breditor-inline-control[hidden]{display:none}[data-breditor-menubar] [role=menu] button{flex:1;text-align:start}[data-breditor-menubar] [role=menu] [aria-disabled=true]{opacity:.55}[data-breditor-shortcut-help]{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center}[data-breditor-shortcut-help][hidden]{display:none}.breditor-shortcut-help-backdrop{position:absolute;inset:0;background:rgba(23,61,55,.35)}[data-breditor-shortcut-help] [role=dialog]{position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:16px;background:#fff;color:#173d37;border-radius:8px;box-shadow:0 8px 28px rgba(23,61,55,.3)}[data-breditor-shortcut-help] h2{margin:0;font-size:1.25em}[data-breditor-shortcut-help] h3{margin:12px 0 4px;font-size:1em}[data-breditor-shortcut-help] p{margin:0}.breditor-shortcut-help-body{overflow:auto}[data-breditor-shortcut-help] table{border-collapse:collapse;width:100%}[data-breditor-shortcut-help] th{text-align:start;font-weight:normal;padding:3px 8px 3px 0}[data-breditor-shortcut-help] td{text-align:end;white-space:nowrap}[data-breditor-shortcut-help] kbd{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid #a5b9af;border-radius:4px;padding:1px 5px;background:#f2f5ef}[data-breditor-shortcut-help] [data-close]{align-self:flex-end;padding:6px 12px}`;

let sequence=0;
const leases=new WeakMap<HTMLElement,Set<string>>();
function lease(surface:HTMLElement,kind:string,what:string):()=>void{
 const used=leases.get(surface)??new Set<string>();if(used.has(kind))throw Error(`This editor already has a ${what}`);
 used.add(kind);leases.set(surface,used);let held=true;return ()=>{if(held){held=false;used.delete(kind);}};
}
function editorRoot(host:RichContextUiHost):HTMLElement|null{return host.surface.closest<HTMLElement>("[data-breditor-rich],[data-breditor-shared]")??host.surface.parentElement;}
function shellContainer(host:RichContextUiHost,container:HTMLElement|undefined,what:string):HTMLElement{
 const surface=host.surface,d=surface.ownerDocument;if(host.contextUiState().closed||!d.defaultView)throw Error(`${what} requires an open editor in a browsing context`);
 const root=container??editorRoot(host);
 if(!root||root.ownerDocument!==d||root===surface||surface.contains(root))throw Error(`${what} needs a container outside editable content in the editor document`);
 return root;
}
const only=(value:object,allowed:readonly string[],what:string)=>{for(const key of Object.keys(value))if(!allowed.includes(key))throw new TypeError(`Unknown ${what} option ${JSON.stringify(key)}`);};
const label=(value:unknown,what:string):string|undefined=>{if(value===undefined)return undefined;if(typeof value!=="string"||!value.trim()||value.length>256)throw new TypeError(`Expected ${what} to be a nonempty string of at most 256 characters`);return value;};
const reporter=(onError:((error:unknown)=>void)|undefined)=>(error:unknown)=>{try{onError?.(error);}catch{/* A host reporter cannot change editor ownership. */}};
/** Menu-role decoration of a borrowed widget. The shared widget keeps ownership of disabled and aria-pressed. */
function decorateItem(view:RichContextControlView,hideDisabled:boolean):void{
 const item=itemOf(view),enabled=enabledView(view);view.element.hidden=hideDisabled&&!enabled;view.element.setAttribute("role","none");item.tabIndex=-1;
 if(item!==view.button){item.setAttribute("role","menuitem");return;}
 const pressed=item.getAttribute("aria-pressed");
 if(pressed===null){item.setAttribute("role","menuitem");item.removeAttribute("aria-checked");}else{item.setAttribute("role","menuitemcheckbox");item.setAttribute("aria-checked",pressed);}
 if(enabled)item.removeAttribute("aria-disabled");else item.setAttribute("aria-disabled","true");
}
/** First-character typeahead with a short multi-character buffer, as in the WAI-ARIA menu patterns. */
function typeahead(realm:Window){
 let buffer="",timer=0,scope:HTMLElement|undefined;
 return (event:KeyboardEvent,list:readonly HTMLElement[],current:number):boolean=>{
  if([...event.key].length!==1||event.key===" "||event.ctrlKey||event.metaKey||event.altKey||!list.length)return false;
  // A buffer never carries over from the menu bar into a menu (or between menus).
  if(scope!==list[0]){scope=list[0];buffer="";}
  realm.clearTimeout(timer);buffer+=event.key.toLocaleLowerCase();timer=realm.setTimeout(()=>{buffer="";},500);
  const start=buffer.length===1?current+1:Math.max(current,0);
  for(let step=0;step<list.length;step++){const item=list[(start+step)%list.length]!;if((item.textContent??"").trim().toLocaleLowerCase().startsWith(buffer)){event.preventDefault();item.focus({preventScroll:true});return true;}}
  return false;
 };
}

function resolveMenus(input:readonly RichMenuBarMenu[]|undefined,admitted:readonly string[],ui:RichUiLocale,help:boolean):{id:string;label:string;controls:readonly string[]}[]{
 if(input===undefined){
  const menus=richMenuBarDefaults.map(menu=>({id:menu.id,label:ui.text(menuLabels[menu.id]!),controls:Object.freeze(menu.controls.filter(id=>admitted.includes(id)))})).filter(menu=>menu.controls.length);
  if(help)menus.push({id:"help",label:ui.text("menuHelp"),controls:Object.freeze([])});
  if(!menus.length)throw Error("The editor admits no control for the standard menus; pass explicit menus");
  return menus;
 }
 if(!Array.isArray(input)||!input.length||input.length>12)throw new TypeError("Expected one to twelve menus");
 const ids=new Set<string>(),used=new Set<string>();
 return input.map(menu=>{
  if(menu===null||typeof menu!=="object")throw new TypeError("Expected a menu object");only(menu,["id","label","controls"],"menu");
  if(typeof menu.id!=="string"||!/^[a-z][a-z0-9-]{0,31}$/.test(menu.id)||ids.has(menu.id))throw new TypeError("Expected unique lowercase menu ids");ids.add(menu.id);
  const text=label(menu.label,`menu ${menu.id} label`)??(menuLabels[menu.id]?ui.text(menuLabels[menu.id]!):undefined);if(text===undefined)throw new TypeError(`Menu ${menu.id} needs a label`);
  if(!Array.isArray(menu.controls)||menu.controls.length>64)throw new TypeError(`Expected menu ${menu.id} controls to be an array of at most 64 ids`);
  for(const id of menu.controls){
   if(typeof id!=="string"||!id)throw new TypeError("Expected nonempty control ids");
   if(used.has(id))throw new TypeError(`Control ${id} appears in more than one menu`);used.add(id);
   if(!admitted.includes(id))throw Error(`Toolbar control ${id} is not admitted by this editor`);
  }
  if(!menu.controls.length&&!(help&&menu.id==="help"))throw new TypeError(`Menu ${menu.id} has no controls`);
  return {id:menu.id,label:text,controls:Object.freeze([...menu.controls])};
 });
}

/** WAI-ARIA menu bar of admitted controls. Alt+F9 (configurable) focuses it; Escape returns to the editor. */
export function mountRichMenuBar(host:RichContextUiHost,options:RichMenuBarOptions={}):RichMenuBar{
 if(options===null||typeof options!=="object")throw new TypeError("Expected menu bar options");
 only(options,["menus","container","label","focusShortcut","hideDisabled","help","onError"],"menu bar");
 if(options.hideDisabled!==undefined&&typeof options.hideDisabled!=="boolean")throw new TypeError("Expected boolean hideDisabled");
 if(options.help!==undefined&&(options.help===null||typeof options.help.open!=="function"))throw new TypeError("Expected help to be a mounted shortcut help dialog");
 const ui=host.uiLocale?.()??defaultRichUi,container=shellContainer(host,options.container,"Menu bar"),surface=host.surface,d=surface.ownerDocument,realm=d.defaultView!;
 const name=label(options.label,"menu bar label")??ui.text("menuBarLabel"),hideDisabled=options.hideDisabled===true,help=options.help;
 const focusKey=options.focusShortcut===null?null:parseRichShellShortcut(options.focusShortcut??"Alt+F9","menu bar focusShortcut");
 const menus=resolveMenus(options.menus,host.contextControlIds(),ui,!!help);
 const release=lease(surface,"menubar","menu bar"),abort=new AbortController(),signal=abort.signal,report=reporter(options.onError),prefix=`breditor-menubar-${++sequence}`;
 const element=d.createElement("div"),style=d.createElement("style");
 element.dataset["breditorMenubar"]="";element.setAttribute("role","menubar");element.setAttribute("aria-label",name);element.setAttribute("aria-orientation","horizontal");ui.applyChrome(element);
 style.textContent=richEditorShellStyles;element.append(style);
 interface Menu {readonly id:string;readonly top:HTMLButtonElement;readonly popup:HTMLElement;readonly views:readonly RichContextControlView[];readonly extra:readonly HTMLButtonElement[]}
 let built:Menu[]=[];
 try{
  built=menus.map((menu,index)=>{
   const wrapper=d.createElement("div"),top=d.createElement("button"),popup=d.createElement("div");
   wrapper.className="breditor-menubar-menu";wrapper.setAttribute("role","none");wrapper.dataset["menu"]=menu.id;
   top.type="button";top.id=`${prefix}-${menu.id}`;top.textContent=menu.label;top.setAttribute("role","menuitem");top.setAttribute("aria-haspopup","menu");top.setAttribute("aria-expanded","false");top.setAttribute("aria-controls",`${prefix}-${menu.id}-menu`);top.tabIndex=index===0?0:-1;
   popup.id=`${prefix}-${menu.id}-menu`;popup.setAttribute("role","menu");popup.setAttribute("aria-labelledby",top.id);popup.setAttribute("aria-orientation","vertical");popup.hidden=true;
   wrapper.append(top,popup);element.append(wrapper);
   const views=menu.controls.map(id=>host.mountContextControl(popup,id,signal)),extra:HTMLButtonElement[]=[];
   if(help&&menu.id==="help"){const item=d.createElement("button");item.type="button";item.textContent=ui.text("menuKeyboardShortcuts");item.setAttribute("role","menuitem");item.tabIndex=-1;item.dataset["menuAction"]="keyboard-shortcuts";popup.append(item);extra.push(item);}
   return {id:menu.id,top,popup,views,extra};
  });
  container.insertBefore(element,container.querySelector(":scope>[role=toolbar]")??container.firstChild);
 }catch(error){abort.abort();element.remove();release();throw error;}
 const shortcuts=[...(focusKey?[registerRichPresentationShortcut(surface,{id:"ui:menubar",group:"interface",label:ui.text("shortcutFocusMenuBar"),keys:[focusKey]})]:[]),registerRichPresentationShortcut(surface,{id:"ui:escape",group:"interface",label:ui.text("shortcutLeaveUi"),keys:[{key:"Escape"}]})];
 let disposed=false,open:Menu|null=null,current=0,unsubscribe=()=>{};
 const find=typeahead(realm);
 const decorate=()=>{for(const menu of built)for(const view of menu.views)decorateItem(view,hideDisabled);};
 const items=(menu:Menu):HTMLElement[]=>[...menu.views.filter(view=>!view.element.hidden&&enabledView(view)).map(itemOf),...menu.extra];
 const tabbable=(index:number)=>{current=index;built.forEach((menu,i)=>{menu.top.tabIndex=i===index?0:-1;});};
 const closeMenu=(focus:"editor"|"top"|"none")=>{
  const menu=open;if(menu){open=null;for(const panel of menu.popup.querySelectorAll("details"))panel.open=false;menu.popup.hidden=true;menu.top.setAttribute("aria-expanded","false");}
  if(focus==="top")built[current]?.top.focus({preventScroll:true});else if(focus==="editor"&&!host.contextUiState().closed)host.focus();
 };
 const openMenu=(index:number,focus:"first"|"last"|"top"):boolean=>{
  if(disposed||host.contextUiState().closed)return false;const menu=built[index];if(!menu)return false;
  if(open!==menu)closeMenu("none");decorate();tabbable(index);menu.popup.hidden=false;menu.top.setAttribute("aria-expanded","true");open=menu;
  const list=items(menu),target=focus==="first"?list[0]:focus==="last"?list[list.length-1]:undefined;(target??menu.top).focus({preventScroll:true});return true;
 };
 const focusBar=():boolean=>{if(disposed||host.contextUiState().closed)return false;decorate();built[current]!.top.focus({preventScroll:true});return true;};
 const update=()=>{
  if(disposed)return;
  try{
   if(host.contextUiState().closed){dispose();return;}
   decorate();if(!open)return;
   const active=d.activeElement as HTMLElement|null,list=items(open);
   if(active&&open.popup.contains(active)&&!list.includes(active)&&!active.closest("details"))(list[0]??open.top).focus({preventScroll:true});
  }catch(error){report(error);}
 };
 function dispose():void{if(disposed)return;closeMenu("none");disposed=true;unsubscribe();abort.abort();element.remove();release();for(const free of shortcuts)free();}
 try{
  unsubscribe=host.subscribeContextUi(update);decorate();
  element.addEventListener("keydown",event=>{
   if(event.isComposing||event.defaultPrevented)return;
   const target=event.target as HTMLElement,rtl=richChromeIsRtl(element),next=rtl?"ArrowLeft":"ArrowRight",previous=rtl?"ArrowRight":"ArrowLeft",count=built.length;
   const top=built.findIndex(menu=>menu.top===target);
   if(top>=0){
    const move=(index:number)=>{event.preventDefault();const wasOpen=open!==null;if(wasOpen)openMenu(index,"top");else{tabbable(index);built[index]!.top.focus({preventScroll:true});}};
    if(event.key===next)move((top+1)%count);else if(event.key===previous)move((top-1+count)%count);
    else if(event.key==="Home")move(0);else if(event.key==="End")move(count-1);
    else if(event.key==="ArrowDown"||event.key==="Enter"||event.key===" "){event.preventDefault();openMenu(top,"first");}
    else if(event.key==="ArrowUp"){event.preventDefault();openMenu(top,"last");}
    else if(event.key==="Escape"){event.preventDefault();closeMenu("editor");}
    else if(event.key==="Tab")closeMenu("none");
    else if(find(event,built.map(menu=>menu.top),top)){const index=built.findIndex(menu=>menu.top===d.activeElement);if(index>=0){if(open)openMenu(index,"top");else tabbable(index);}}
    return;
   }
   const owner=built.findIndex(menu=>menu.popup.contains(target));if(owner<0)return;
   const menu=built[owner]!,list=items(menu),index=list.indexOf(target);
   if(event.key==="Escape"){event.preventDefault();closeMenu("top");return;}
   if(event.key==="Tab"){
    // The summary and fields in an open borrowed form need their native tab sequence.
    if(!menu.popup.contains(target.closest("details[open]")))closeMenu("none");
    return;
   }
   // Keys inside a borrowed field form (inputs, selects, its Apply button) keep their own meaning.
   if(index<0)return;
   const go=(item:HTMLElement|undefined)=>{event.preventDefault();item?.focus({preventScroll:true});};
   if(event.key==="ArrowDown")go(list[(index+1)%list.length]);else if(event.key==="ArrowUp")go(list[(index-1+list.length)%list.length]);
   else if(event.key==="Home")go(list[0]);else if(event.key==="End")go(list[list.length-1]);
   else if(event.key===next||event.key===previous){if(target.tagName==="SUMMARY"&&(target.parentElement as HTMLDetailsElement).open)return;event.preventDefault();openMenu((owner+(event.key===next?1:-1)+count)%count,"first");}
   else find(event,list,index);
  },{signal});
  for(const [index,menu] of built.entries()){
   // On a menu item, Escape belongs to the menu (back to its bar item) before the borrowed widget's own Escape,
   // which would otherwise return focus straight to the editor. Inside a field form the widget keeps Escape.
   menu.popup.addEventListener("keydown",event=>{if(event.key!=="Escape"||event.isComposing||!items(menu).includes(event.target as HTMLElement))return;event.preventDefault();event.stopPropagation();closeMenu("top");},{capture:true,signal});
   menu.top.addEventListener("click",()=>{if(open===menu)closeMenu("top");else openMenu(index,"top");},{signal});
   menu.top.addEventListener("pointerenter",()=>{if(open&&open!==menu)openMenu(index,"top");},{signal});
   for(const item of menu.extra)item.addEventListener("click",()=>{closeMenu("top");help?.open();},{signal});
   // A command closes the menu once its control ran and returned focus to the editor; refused forms stay open.
   menu.popup.addEventListener("click",event=>{if(menu.views.some(view=>view.button===event.target)&&!element.contains(d.activeElement))closeMenu("none");},{signal});
  }
  element.addEventListener("focusout",event=>{if(!owned(element,element,event.relatedTarget))realm.setTimeout(()=>{if(open&&!element.contains(d.activeElement))closeMenu("none");},0);},{signal});
  d.addEventListener("pointerdown",event=>{if(open&&!element.contains(event.target as Node))closeMenu("none");},{capture:true,signal});
  if(focusKey)(editorRoot(host)??surface).addEventListener("keydown",event=>{if(event.defaultPrevented||!matchesRichShellShortcut(event,focusKey))return;event.preventDefault();try{focusBar();}catch(error){report(error);}},{signal});
 }catch(error){dispose();throw error;}
 return {element,
  state:()=>Object.freeze({open:disposed?null:open?.id??null,disposed,menus:Object.freeze(menus.map(menu=>Object.freeze({...menu})))}),
  focus:focusBar,
  open(id){if(typeof id!=="string")throw new TypeError("Expected a menu id");const index=built.findIndex(menu=>menu.id===id);if(index<0)throw Error(`Unknown menu ${id}`);return openMenu(index,"first");},
  close(returnFocus=false){if(!disposed)closeMenu(returnFocus?"editor":"none");},
  dispose};
}

/** Modal keyboard shortcut reference built from the editor's active registry. Alt+0 (configurable) opens it. */
export function mountRichShortcutHelp(host:RichContextUiHost,options:RichShortcutHelpOptions={}):RichShortcutHelp{
 if(options===null||typeof options!=="object")throw new TypeError("Expected shortcut help options");
 only(options,["shortcut","platform","container","label","onError"],"shortcut help");
 if(options.platform!==undefined&&!["auto","apple","other"].includes(options.platform))throw new TypeError("Expected platform auto, apple or other");
 const ui=host.uiLocale?.()??defaultRichUi,container=shellContainer(host,options.container,"Shortcut help"),surface=host.surface,d=surface.ownerDocument,realm=d.defaultView!;
 const title=label(options.label,"shortcut help label")??ui.text("shortcutHelpTitle");
 const openKey:RichShortcutChord|null=options.shortcut===null?null:parseRichShellShortcut(options.shortcut??"Alt+0","shortcut help shortcut");
 const platform:RichShortcutPlatform=options.platform==="apple"||options.platform==="other"?options.platform:detectRichShortcutPlatform(realm);
 const release=lease(surface,"help","shortcut help dialog"),abort=new AbortController(),signal=abort.signal,report=reporter(options.onError),prefix=`breditor-shortcut-help-${++sequence}`;
 const element=d.createElement("div"),style=d.createElement("style"),backdrop=d.createElement("div"),dialog=d.createElement("div"),heading=d.createElement("h2"),intro=d.createElement("p"),body=d.createElement("div"),close=d.createElement("button");
 element.dataset["breditorShortcutHelp"]="";element.hidden=true;ui.applyChrome(element);style.textContent=richEditorShellStyles;backdrop.className="breditor-shortcut-help-backdrop";
 dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.tabIndex=-1;dialog.setAttribute("aria-labelledby",`${prefix}-title`);dialog.setAttribute("aria-describedby",`${prefix}-intro`);
 heading.id=`${prefix}-title`;heading.textContent=title;intro.id=`${prefix}-intro`;intro.textContent=ui.text("shortcutHelpIntro");
 body.className="breditor-shortcut-help-body";body.tabIndex=0;body.setAttribute("role","group");body.setAttribute("aria-labelledby",heading.id);
 close.type="button";close.dataset["close"]="";close.textContent=ui.text("shortcutHelpClose");
 dialog.append(heading,intro,body,close);element.append(style,backdrop,dialog);
 const groupLabels:Readonly<Record<RichShortcutGroup,RichUiStringKey>>={history:"shortcutGroupHistory",formatting:"shortcutGroupFormatting",blocks:"shortcutGroupBlocks",navigation:"shortcutGroupNavigation",commands:"shortcutGroupCommands",interface:"shortcutGroupInterface"};
 const shortcuts=[...(openKey?[registerRichPresentationShortcut(surface,{id:"ui:help",group:"interface",label:ui.text("shortcutOpenHelp"),keys:[openKey]})]:[]),registerRichPresentationShortcut(surface,{id:"ui:escape",group:"interface",label:ui.text("shortcutLeaveUi"),keys:[{key:"Escape"}]})];
 let disposed=false,isOpen=false,previous:HTMLElement|null=null,unsubscribe=()=>{};
 const entries=()=>richActiveShortcuts(host);
 const render=()=>{
  const list=entries();body.replaceChildren();
  if(!list.length){const empty=d.createElement("p");empty.textContent=ui.text("shortcutHelpEmpty");body.append(empty);return;}
  for(const group of richShortcutGroups){
   const members=list.filter(entry=>entry.group===group);if(!members.length)continue;
   const section=d.createElement("section"),title=d.createElement("h3"),table=d.createElement("table"),rows=d.createElement("tbody");
   section.dataset["group"]=group;title.id=`${prefix}-${group}`;title.textContent=ui.text(groupLabels[group]);section.setAttribute("aria-labelledby",title.id);
   for(const entry of members){
    const row=d.createElement("tr"),name=d.createElement("th"),keys=d.createElement("td");row.dataset["shortcut"]=entry.id;name.scope="row";name.textContent=entry.label;
    entry.keys.forEach((key,index)=>{
     if(index){const or=d.createElement("span");or.textContent=` ${ui.text("shortcutHelpOr")} `;keys.append(or);}
     const shown=formatRichShortcut(key,platform,ui),kbd=d.createElement("kbd");kbd.textContent=shown.text;kbd.setAttribute("aria-label",shown.label);keys.append(kbd);
    });
    row.append(name,keys);rows.append(row);
   }
   table.append(rows);section.append(title,table);body.append(section);
  }
 };
 const focusables=():HTMLElement[]=>[body,close];
 const closeDialog=()=>{
  if(!isOpen)return;isOpen=false;element.hidden=true;const target=previous;previous=null;
  if(host.contextUiState().closed)return;
  if(target&&target.isConnected&&target!==d.body&&target!==surface&&!surface.contains(target))target.focus({preventScroll:true});else host.focus();
 };
 const openDialog=():boolean=>{
  if(disposed||host.contextUiState().closed)return false;if(isOpen)return true;
  const active=d.activeElement;previous=active instanceof realm.HTMLElement&&!element.contains(active)?active:null;
  render();isOpen=true;element.hidden=false;dialog.focus({preventScroll:true});return true;
 };
 function dispose():void{if(disposed)return;closeDialog();disposed=true;unsubscribe();abort.abort();element.remove();release();for(const free of shortcuts)free();}
 try{
  container.append(element);
  unsubscribe=host.subscribeContextUi(()=>{if(!disposed&&host.contextUiState().closed)dispose();});
  dialog.addEventListener("keydown",event=>{
   if(event.isComposing)return;
   if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeDialog();return;}
   if(event.key!=="Tab")return;
   const list=focusables(),index=list.indexOf(d.activeElement as HTMLElement);event.preventDefault();
   list[event.shiftKey?(index<=0?list.length-1:index-1):(index+1)%list.length]!.focus({preventScroll:true});
  },{signal});
  close.addEventListener("click",()=>closeDialog(),{signal});
  backdrop.addEventListener("click",()=>closeDialog(),{signal});
  // Focus trap: focus that escapes the open modal (for example by a pointer) is brought back.
  d.addEventListener("focusin",event=>{if(isOpen&&!element.contains(event.target as Node))dialog.focus({preventScroll:true});},{capture:true,signal});
  if(openKey)(editorRoot(host)??surface).addEventListener("keydown",event=>{if(event.defaultPrevented||!matchesRichShellShortcut(event,openKey))return;event.preventDefault();try{openDialog();}catch(error){report(error);}},{signal});
 }catch(error){dispose();throw error;}
 return {element,
  state:()=>Object.freeze({open:isOpen&&!disposed,disposed,platform,shortcut:openKey?`Alt+${openKey.shift?"Shift+":""}${openKey.key}`:null}),
  entries,open:openDialog,close:closeDialog,dispose};
}

function caretBox(surface:HTMLElement,range:Range|null):{left:number;top:number;bottom:number}|null{
 if(!range||!range.startContainer.isConnected||!surface.contains(range.startContainer))return null;
 const rects=typeof range.getClientRects==="function"?[...range.getClientRects()]:[],rect=rects.find(r=>r.height)??(typeof range.getBoundingClientRect==="function"?range.getBoundingClientRect():null);
 if(rect&&rect.height)return {left:rect.left,top:rect.top,bottom:rect.bottom};
 // An empty block often exposes no caret rect: use its inline-start edge and first line.
 const node=range.startContainer,owner=(node.nodeType===1?node as Element:node.parentElement)?.closest("[data-rich-block],[data-rich-text]")??(node.nodeType===1?node as Element:node.parentElement);
 const own=owner?.getBoundingClientRect(),box=own&&(own.width||own.height)?own:surface.getBoundingClientRect();
 const line=Number.parseFloat(surface.ownerDocument.defaultView?.getComputedStyle(owner??surface).lineHeight??"")||Math.min(box.height,24);
 return {left:box.left,top:box.top,bottom:Math.min(box.bottom,box.top+line)};
}
/** Tiptap FloatingMenu equivalent: block insert controls beside the caret of an empty paragraph. Never takes focus on its own. */
export function mountRichFloatingMenu(host:RichContextUiHost,options:RichFloatingMenuOptions={}):RichFloatingMenu{
 if(options.hideDisabled!==undefined&&typeof options.hideDisabled!=="boolean")throw new TypeError("Expected boolean hideDisabled");
 const {ui,d,element,views,ids,abort,release,report}=prepare(host,"floating-menu",options,richFloatingMenuDefaults),surface=host.surface,realm=d.defaultView!,signal=abort.signal,hideDisabled=options.hideDisabled!==false;
 element.setAttribute("role","toolbar");element.setAttribute("aria-label",options.label??ui.text("floatingMenuLabel"));element.setAttribute("aria-orientation","horizontal");
 const shortcuts=[registerRichPresentationShortcut(surface,{id:"ui:floating-menu",group:"interface",label:ui.text("shortcutFocusBlockMenu"),keys:[{key:"F10",alt:true}]}),registerRichPresentationShortcut(surface,{id:"ui:escape",group:"interface",label:ui.text("shortcutLeaveUi"),keys:[{key:"Escape"}]})];
 let disposed=false,visible=false,composing=false,dismissed:string|null=null,range:Range|null=null,unsubscribe=()=>{};
 const enabled=()=>views.filter(view=>!view.element.hidden&&enabledView(view));
 const hide=(restore:boolean)=>{const inside=element.contains(d.activeElement);element.hidden=true;visible=false;if(restore&&inside&&!host.contextUiState().closed)host.focus();};
 const update=()=>{
  if(disposed)return;
  try{
   const state=host.contextUiState();if(state.closed){dispose();return;}
   for(const view of views)view.element.hidden=hideDisabled&&!enabledView(view);
   const active=d.activeElement,inSurface=!!active&&(active===surface||surface.contains(active)),inside=!!active&&element.contains(active);
   if(dismissed!==null&&dismissed!==state.revision)dismissed=null;
   if(inSurface)range=liveRange(surface);
   const show=enabled().length>0&&!state.composing&&!composing&&!state.readOnly&&state.selection==="caret"&&state.emptyParagraph===true&&(inSurface||inside)&&dismissed===null;
   const box=show?caretBox(surface,range):null,bounds=surface.getBoundingClientRect();
   if(!box||box.bottom<bounds.top||box.top>bounds.bottom||box.bottom<0||box.top>realm.innerHeight){hide(true);return;}
   element.hidden=false;visible=true;
   const width=element.offsetWidth,height=element.offsetHeight,gap=16,rtl=richChromeIsRtl(element);
   const left=Math.min(Math.max(8,rtl?box.left-width-gap:box.left+gap),Math.max(8,realm.innerWidth-width-8)),top=Math.min(Math.max(8,(box.top+box.bottom)/2-height/2),Math.max(8,realm.innerHeight-height-8));
   element.style.left=`${Math.round(left)}px`;element.style.top=`${Math.round(top)}px`;
  }catch(error){report(error);}
 };
 const first=()=>enabled()[0];
 const dismiss=()=>{if(disposed)return;dismissed=host.contextUiState().revision;hide(true);};
 function dispose():void{if(disposed)return;disposed=true;unsubscribe();abort.abort();element.remove();release();for(const free of shortcuts)free();}
 try{
  unsubscribe=host.subscribeContextUi(update);
  d.addEventListener("selectionchange",update,{signal});
  d.addEventListener("focusin",update,{capture:true,signal});
  d.addEventListener("focusout",event=>{if(!owned(surface,element,event.relatedTarget))realm.setTimeout(update,0);},{capture:true,signal});
  surface.addEventListener("compositionstart",()=>{composing=true;update();},{signal});
  surface.addEventListener("compositionend",()=>{composing=false;update();},{signal});
  realm.addEventListener("scroll",update,{capture:true,passive:true,signal});
  realm.addEventListener("resize",update,{signal});
  surface.addEventListener("keydown",event=>{
   if(event.isComposing||composing)return;
   if(event.altKey&&event.key==="F10"&&visible){const item=first();if(item){event.preventDefault();itemOf(item).focus({preventScroll:true});}}
   else if(event.key==="Escape"&&visible&&!event.defaultPrevented)dismiss();
  },{signal});
  element.addEventListener("keydown",event=>{if(event.isComposing||event.defaultPrevented)return;if(event.key==="Escape"){event.preventDefault();dismiss();return;}if(richChromeIsRtl(element))rove(event,views,"ArrowLeft","ArrowRight");else rove(event,views,"ArrowRight","ArrowLeft");},{signal});
  // Background presses never move focus out of the text; control widgets own their own pointer policy.
  element.addEventListener("pointerdown",event=>{if(event.target===element)event.preventDefault();},{signal});
  update();
 }catch(error){dispose();throw error;}
 return {element,
  state:()=>Object.freeze({visible:visible&&!disposed,disposed,controls:ids}),
  focus(){if(disposed)return false;update();const item=visible?first():undefined;if(!item)return false;itemOf(item).focus({preventScroll:true});return true;},
  dismiss,refresh:update,dispose};
}

/**
 * Balloon-block preset: the floating selection toolbar for text ranges, the empty-line block menu for new blocks and
 * the shortcut help, with the coordinator's fixed toolbar hidden (its controls stay admitted and borrowed). Add the
 * block drag handle (`mountRichBlockDrag` / `mountSharedBlockDrag`) for the CKEditor balloon-block handle.
 */
export function mountRichBalloonBlockLayout(host:RichContextUiHost,options:RichBalloonBlockLayoutOptions={}):RichBalloonBlockLayout{
 if(options===null||typeof options!=="object")throw new TypeError("Expected balloon layout options");
 only(options,["selectionToolbar","floatingMenu","help","hideToolbar"],"balloon layout");
 if(options.hideToolbar!==undefined&&typeof options.hideToolbar!=="boolean")throw new TypeError("Expected boolean hideToolbar");
 const mounted:{dispose():void}[]=[];let selectionToolbar:RichSelectionToolbar|null=null,floatingMenu:RichFloatingMenu|null=null,help:RichShortcutHelp|null=null;
 try{
  if(options.selectionToolbar!==false){selectionToolbar=mountRichSelectionToolbar(host,options.selectionToolbar??{});mounted.push(selectionToolbar);}
  if(options.floatingMenu!==false){floatingMenu=mountRichFloatingMenu(host,options.floatingMenu??{});mounted.push(floatingMenu);}
  if(options.help!==false){help=mountRichShortcutHelp(host,options.help??{});mounted.push(help);}
 }catch(error){for(const item of mounted.reverse())item.dispose();throw error;}
 // The coordinator's toolbar styles set `display`, so `hidden` alone would not hide it.
 const toolbar=options.hideToolbar===false?null:editorRoot(host)?.querySelector<HTMLElement>(":scope>[role=toolbar]")??null,wasHidden=toolbar?.hidden??false,display=toolbar?.style.getPropertyValue("display")??"",priority=toolbar?.style.getPropertyPriority("display")??"";
 if(toolbar){toolbar.hidden=true;toolbar.style.setProperty("display","none","important");}
 let disposed=false;
 return {selectionToolbar,floatingMenu,help,dispose(){if(disposed)return;disposed=true;for(const item of [...mounted].reverse())item.dispose();if(toolbar&&toolbar.isConnected){toolbar.hidden=wasHidden;if(display)toolbar.style.setProperty("display",display,priority);else toolbar.style.removeProperty("display");}}};
}
