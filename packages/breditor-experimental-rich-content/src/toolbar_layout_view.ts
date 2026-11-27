/**
 * DOM arrangement for a validated toolbar layout (docs/TOOLBAR_LAYOUT.md): rows, separators, dropdown
 * groups and the opt-in "Show more items" overflow, with one WAI-ARIA toolbar roving tab stop.
 *
 * It only moves and focuses the widgets `mountToolbarControl` built. Commands, readings, gating and focus
 * return stay with each widget and its coordinator; a group's state is aggregated from its members' last
 * Rust-derived readings, never computed independently.
 */
import {richChromeIsRtl,type RichUiLocale} from "./ui_locale.js";
import type {RichControlView} from "./toolbar_control_view.js";
import type {RichToolbarPlan} from "./toolbar_layout.js";

/** Aggregated activation of a dropdown group, derived from its members. */
export type RichToolbarGroupActivation="active"|"mixed"|"inactive"|"stateless";
export interface RichToolbarLayoutState {
 /** Open popup: a group id, `"more"` for the overflow menu, or null. */
 readonly open:string|null;
 /** Top-level item keys (control ids, group ids) currently moved into the overflow menu, in order. */
 readonly overflow:readonly string[];
 readonly groups:Readonly<Record<string,Readonly<{enabled:boolean;activation:RichToolbarGroupActivation}>>>;
}
/** @internal Owned by one coordinator; listeners end with the coordinator's abort signal. */
export interface RichToolbarLayoutView {
 /** Re-applies roving tab stops and group state after the coordinator refreshed its controls. */
 update():void;
 /** Re-measures the single row and moves trailing items into or out of the overflow menu. */
 arrange():void;
 state():RichToolbarLayoutState;
}
/** Scoped to laid-out coordinator toolbars. */
export const richToolbarLayoutStyles=`:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-toolbar-layout]{display:block}:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-toolbar-measure]{display:block;height:0;overflow:hidden}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-row{display:flex;flex-wrap:wrap;align-items:end;gap:6px;min-width:0}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-row+.breditor-toolbar-row{margin-top:6px}:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-toolbar-layout=group-when-full]>.breditor-toolbar-row{flex-wrap:nowrap}:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-toolbar-layout=group-when-full]>.breditor-toolbar-row>*{flex:none}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-separator{align-self:stretch;width:1px;min-height:1.5em;background:#a5b9af;margin:0 2px}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-popup>.breditor-toolbar-separator{width:auto;min-height:0;height:1px;margin:2px 0}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-popup>.breditor-toolbar-separator:first-child{display:none}:is([data-breditor-rich],[data-breditor-shared]) :is(.breditor-toolbar-group,.breditor-toolbar-overflow){position:relative}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-overflow[hidden]{display:none}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-popup{position:absolute;top:100%;inset-inline-start:0;z-index:20;display:flex;flex-direction:column;align-items:stretch;gap:4px;margin-top:4px;padding:6px;min-width:max-content;background:#fff;color:#173d37;border:1px solid #a5b9af;border-radius:6px;box-shadow:0 4px 14px rgba(23,61,55,.18)}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-overflow>.breditor-toolbar-popup{inset-inline-start:auto;inset-inline-end:0}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-popup .breditor-toolbar-popup{position:static;margin:4px 0 0;box-shadow:none}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-popup[hidden]{display:none}:is([data-breditor-rich],[data-breditor-shared]) .breditor-toolbar-popup .breditor-inline-control>button{flex:1;text-align:start}:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-group-state=active]{background:#cde9dd}:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-group-state=mixed]{border-style:dashed}:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-toolbar-group-button]::after,:is([data-breditor-rich],[data-breditor-shared]) [data-breditor-toolbar-more]::after{content:" \\25BE"}`;

interface Popup {readonly key:string;readonly wrapper:HTMLElement;readonly button:HTMLButtonElement;readonly popup:HTMLElement;readonly members:readonly RichControlView<unknown>[]}
let instances=0;

/** @internal Builds the laid-out toolbar inside `toolbar` (the coordinator's `role="toolbar"` element). */
export function arrangeRichToolbar<C>(o:{
 toolbar:HTMLElement;plan:RichToolbarPlan;ui:RichUiLocale;signal:AbortSignal;
 mount:(container:HTMLElement,id:string)=>RichControlView<C>;
 focusEditor:()=>void;
}):RichToolbarLayoutView{
 const {toolbar,plan,ui,signal}=o,d=toolbar.ownerDocument,realm=d.defaultView,prefix=`breditor-toolbar-${++instances}`;
 const keys=new Map<HTMLElement,string>(),popups:Popup[]=[],rows:HTMLElement[]=[];
 toolbar.dataset["breditorToolbarLayout"]=plan.groupWhenFull?"group-when-full":"rows";toolbar.setAttribute("aria-orientation","horizontal");
 const measure=d.createElement("div");measure.dataset["breditorToolbarMeasure"]="";measure.setAttribute("aria-hidden","true");toolbar.append(measure);
 const disclosure=(key:string,label:string,kind:"group"|"more"):{wrapper:HTMLElement;button:HTMLButtonElement;popup:HTMLElement}=>{
  const wrapper=d.createElement("div"),button=d.createElement("button"),popup=d.createElement("div"),id=`${prefix}-${kind}-${key}`;
  button.type="button";button.id=id;button.textContent=label;button.setAttribute("aria-expanded","false");button.setAttribute("aria-controls",`${id}-popup`);
  popup.id=`${id}-popup`;popup.className="breditor-toolbar-popup";popup.setAttribute("role","group");popup.setAttribute("aria-labelledby",id);popup.hidden=true;
  wrapper.append(button,popup);return {wrapper,button,popup};
 };
 const separator=()=>{const element=d.createElement("span");element.className="breditor-toolbar-separator";element.setAttribute("role","separator");element.setAttribute("aria-orientation","vertical");return element;};
 for(const items of plan.rows){
  const row=d.createElement("div");row.className="breditor-toolbar-row";rows.push(row);toolbar.append(row);
  for(const item of items){
   if(item.kind==="separator"){row.append(separator());continue;}
   if(item.kind==="control"){const view=o.mount(row,item.id),element=view.button.parentElement as HTMLElement;keys.set(element,item.id);continue;}
   const {wrapper,button,popup}=disclosure(item.id,item.label,"group");
   wrapper.className="breditor-toolbar-group";wrapper.dataset["breditorToolbarGroup"]=item.id;button.dataset["breditorToolbarGroupButton"]=item.id;row.append(wrapper);keys.set(wrapper,item.id);
   const members=item.items.map(id=>{const view=o.mount(popup,id);keys.set(view.button.parentElement as HTMLElement,id);return view as RichControlView<unknown>;});
   popups.push({key:item.id,wrapper,button,popup,members});
  }
 }
 let more:Popup|undefined;
 if(plan.groupWhenFull){
  const label=ui.text("toolbarShowMoreItems"),{wrapper,button,popup}=disclosure("more",label,"more");
  wrapper.className="breditor-toolbar-overflow";wrapper.hidden=true;button.dataset["breditorToolbarMore"]="";rows[0]!.append(wrapper);
  more={key:"more",wrapper,button,popup,members:[]};popups.push(more);
 }
 const popupOf=(wrapper:Element):Popup|undefined=>popups.find(item=>item.wrapper===wrapper);
 /** The one focusable element that represents an item in a roving sequence. */
 const stopOf=(element:Element):HTMLElement|undefined=>{
  if(!(element instanceof HTMLElement)||element.hidden)return undefined;
  const popup=popupOf(element);if(popup)return popup.button;
  if(!keys.has(element))return undefined;
  if(element.tagName==="DETAILS")return element.querySelector<HTMLElement>(":scope>summary")??undefined;
  const field=element.querySelector<HTMLElement>(":scope>label>input,:scope>label>select");if(field)return field;
  const button=element.querySelector<HTMLButtonElement>(":scope>button");return button&&!button.hidden?button:undefined;
 };
 const enabled=(stop:HTMLElement)=>!(stop as HTMLButtonElement).disabled&&stop.getAttribute("aria-disabled")!=="true";
 const stopsIn=(parent:Element)=>[...parent.children].map(stopOf).filter((stop):stop is HTMLElement=>stop!==undefined);
 const topStops=()=>rows.flatMap(stopsIn);
 let current:HTMLElement|undefined;
 const open=new Set<Popup>();
 const ancestors=(popup:Popup)=>popups.filter(other=>other!==popup&&other.popup.contains(popup.wrapper));
 const close=(popup:Popup,focus:"button"|"editor"|"none")=>{
  for(const inner of popups)if(inner!==popup&&popup.popup.contains(inner.wrapper)&&open.has(inner))close(inner,"none");
  if(open.delete(popup)){for(const panel of popup.popup.querySelectorAll<HTMLDetailsElement>(":scope>details[open]"))panel.open=false;popup.popup.hidden=true;popup.button.setAttribute("aria-expanded","false");}
  if(focus==="button")popup.button.focus({preventScroll:true});else if(focus==="editor")o.focusEditor();
 };
 const closeAll=()=>{for(const popup of [...open])close(popup,"none");};
 const openPopup=(popup:Popup,focus:"first"|"last"|"none")=>{
  if(!enabled(popup.button))return;
  const keep=new Set(ancestors(popup));for(const other of [...open])if(other!==popup&&!keep.has(other))close(other,"none");
  open.add(popup);popup.popup.hidden=false;popup.button.setAttribute("aria-expanded","true");update();
  const list=stopsIn(popup.popup).filter(enabled),target=focus==="first"?list[0]:focus==="last"?list[list.length-1]:undefined;
  target?.focus({preventScroll:true});
 };
 const activation=(members:readonly RichControlView<unknown>[]):{enabled:boolean;activation:RichToolbarGroupActivation}=>{
  const states=members.map(view=>view.state());
  return {enabled:states.some(state=>state.enabled),activation:states.some(state=>state.pressed===true)?"active":states.some(state=>state.pressed==="mixed")?"mixed":states.some(state=>state.pressed===false)?"inactive":"stateless"};
 };
 function update():void{
  if(signal.aborted)return;
  for(const popup of popups){
   if(popup===more)continue;
   const state=activation(popup.members);
   popup.button.setAttribute("aria-disabled",String(!state.enabled));popup.button.dataset["breditorGroupState"]=state.activation;
   if(!state.enabled&&open.has(popup))close(popup,popup.wrapper.contains(d.activeElement)?"button":"none");
  }
  for(const element of toolbar.querySelectorAll<HTMLElement>(".breditor-toolbar-separator"))element.setAttribute("aria-orientation",element.parentElement?.classList.contains("breditor-toolbar-popup")?"horizontal":"vertical");
  const stops=topStops(),live=stops.filter(enabled);
  const focused=d.activeElement as HTMLElement|null;if(focused&&live.includes(focused))current=focused;
  if(!current||!live.includes(current))current=live[0];
  for(const stop of stops)stop.tabIndex=stop===current?0:-1;
  for(const popup of popups)for(const stop of stopsIn(popup.popup))stop.tabIndex=-1;
  // A single-field control's stop is its field (Enter applies); its Apply button is not a second tab stop.
  for(const element of keys.keys())if(element.tagName!=="DETAILS"&&element.querySelector(":scope>label>input,:scope>label>select")){const apply=element.querySelector<HTMLButtonElement>(":scope>button");if(apply)apply.tabIndex=-1;}
 }
 const overflows=(row:HTMLElement):boolean=>{
  const box=row.getBoundingClientRect(),rtl=richChromeIsRtl(toolbar);
  return [...row.children].some(child=>{if((child as HTMLElement).hidden)return false;const rect=child.getBoundingClientRect();return rtl?rect.left<box.left-0.5:rect.right>box.right+0.5;});
 };
 function arrange():void{
  if(signal.aborted||!more)return;
  const row=rows[0]!,active=d.activeElement as HTMLElement|null,inside=!!active&&toolbar.contains(active);
  if(open.has(more))close(more,"none");
  for(const element of [...more.popup.children])row.insertBefore(element,more.wrapper);
  more.wrapper.hidden=true;
  if(overflows(row)){
   more.wrapper.hidden=false;
   while(overflows(row)){const last=more.wrapper.previousElementSibling;if(!last)break;more.popup.insertBefore(last,more.popup.firstChild);}
   for(let last=more.wrapper.previousElementSibling;last?.classList.contains("breditor-toolbar-separator");last=more.wrapper.previousElementSibling)more.popup.insertBefore(last,more.popup.firstChild);
  }
  more.wrapper.hidden=more.popup.childElementCount===0;
  update();
  // Moving a focused widget blurs it: keep keyboard users in the toolbar.
  if(inside&&active){if(more.popup.contains(active)){current=more.button;update();more.button.focus({preventScroll:true});}else if(d.activeElement!==active)active.focus({preventScroll:true});}
 }
 toolbar.addEventListener("keydown",event=>{
  if(event.isComposing||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
  const target=event.target as HTMLElement,rtl=richChromeIsRtl(toolbar),next=rtl?"ArrowLeft":"ArrowRight",previous=rtl?"ArrowRight":"ArrowLeft";
  const go=(stop:HTMLElement|undefined)=>{if(!stop)return;event.preventDefault();stop.focus({preventScroll:true});update();};
  const owner=popups.filter(popup=>open.has(popup)&&popup.popup.contains(target)).sort((a,b)=>a.popup.contains(b.popup)?1:-1)[0];
  const disclosed=popups.find(popup=>popup.button===target);
  if(disclosed&&!event.shiftKey){
   if(event.key==="ArrowDown"){event.preventDefault();openPopup(disclosed,"first");return;}
   if(event.key==="ArrowUp"){event.preventDefault();openPopup(disclosed,"last");return;}
   if(event.key==="Escape"){event.preventDefault();if(open.has(disclosed))close(disclosed,"button");else{closeAll();o.focusEditor();}return;}
  }
  if(event.shiftKey)return;
  if(owner){
   const list=stopsIn(owner.popup).filter(enabled),index=list.indexOf(target);if(index<0)return;
   if(event.key==="ArrowDown")go(list[(index+1)%list.length]);else if(event.key==="ArrowUp")go(list[(index-1+list.length)%list.length]);
   else if(event.key==="Home")go(list[0]);else if(event.key==="End")go(list[list.length-1]);
   return;
  }
  if(target.tagName==="INPUT"||target.tagName==="SELECT")return;
  const list=topStops().filter(enabled),index=list.indexOf(target);if(index<0)return;
  if(event.key===next)go(list[(index+1)%list.length]);else if(event.key===previous)go(list[(index-1+list.length)%list.length]);
  else if(event.key==="Home")go(list[0]);else if(event.key==="End")go(list[list.length-1]);
 },{signal});
 for(const popup of popups){
  // On a popup item, Escape belongs to the popup (back to its button) before the widget's own Escape,
  // which returns focus to the editor. Inside an open field form the widget keeps Escape.
  popup.popup.addEventListener("keydown",event=>{
   const target=event.target as HTMLElement,nested=popups.find(other=>other.button===target);
   if(event.key!=="Escape"||event.isComposing||!open.has(popup)||nested&&open.has(nested)||!stopsIn(popup.popup).includes(target))return;
   event.preventDefault();event.stopPropagation();close(popup,"button");
  },{capture:true,signal});
  // Mouse opening keeps the editor focus and native selection, exactly like a plain toolbar button.
  popup.button.addEventListener("pointerdown",event=>{if(event.button===0)event.preventDefault();},{signal});
  popup.button.addEventListener("mousedown",event=>{if(event.button===0)event.preventDefault();},{signal});
  popup.button.addEventListener("click",event=>{
   if(!enabled(popup.button))return;
   if(open.has(popup)){close(popup,event.detail===0?"button":"none");return;}
   openPopup(popup,event.detail===0?"first":"none");
  },{signal});
  // A plain command closes its popups after the widget ran it and returned focus to the editor; forms stay open.
  popup.popup.addEventListener("click",event=>{
   const target=event.target as HTMLElement;
   if(target.tagName!=="BUTTON"||!keys.has(target.parentElement as HTMLElement)||target.closest("details"))return;
   for(const other of [...open])if(other.popup.contains(target))close(other,"none");
  },{signal});
 }
 toolbar.addEventListener("focusout",event=>{
  const related=event.relatedTarget as Node|null;if(related&&toolbar.contains(related))return;
  realm?.setTimeout(()=>{if(signal.aborted)return;const active=d.activeElement;for(const popup of [...open])if(!active||!popup.wrapper.contains(active))close(popup,"none");},0);
 },{signal});
 d.addEventListener("pointerdown",event=>{for(const popup of [...open])if(!popup.wrapper.contains(event.target as Node))close(popup,"none");},{capture:true,signal});
 if(more){
  const Observer=(realm as (Window&{ResizeObserver?:typeof ResizeObserver})|null)?.ResizeObserver;
  if(Observer){
   // The zero-height sentinel changes size only with the toolbar's width, so arranging (which can change
   // the toolbar's height) never re-triggers the observer within one frame.
   let width=-1;const observer=new Observer(entries=>{const next=entries[entries.length-1]?.contentRect.width??-1;if(next===width)return;width=next;arrange();});
   observer.observe(measure);signal.addEventListener("abort",()=>observer.disconnect(),{once:true});
  }else realm?.addEventListener("resize",arrange,{signal});
 }
 return {update,arrange,state(){
  const groups:Record<string,Readonly<{enabled:boolean;activation:RichToolbarGroupActivation}>>={};
  for(const popup of popups)if(popup!==more)groups[popup.key]=Object.freeze(activation(popup.members));
  const overflow=more?[...more.popup.children].flatMap(element=>{const key=keys.get(element as HTMLElement);return key===undefined?[]:[key];}):[];
  return Object.freeze({open:[...open].pop()?.key??null,overflow:Object.freeze(overflow),groups:Object.freeze(groups)});
 }};
}
