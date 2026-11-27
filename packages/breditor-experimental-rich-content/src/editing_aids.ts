/**
 * Opt-in editing aids (docs/EDITING_AIDS.md): show blocks, invisible characters and a focused-block attribute.
 *
 * Presentation only. Block outlines, block-type labels and invisible-character glyphs are painted in a separate
 * `aria-hidden`, `pointer-events:none` layer outside the editable surface, measured from transient DOM ranges, the
 * same way the search and language-check overlays work. Nothing is inserted into, wrapped around or styled inside
 * the editable text, so model offsets, the caret, IME, selection painting, Copy/Cut, search and screen readers see
 * exactly the same DOM with the aids on or off. Toggling never reaches a Rust owner: it is not a command, not a
 * publication and not an Undo step, and it is never shared with collaboration peers.
 *
 * The optional content minimap (`minimap: {container}`) paints a scaled overview of the rendered blocks and a
 * draggable viewport indicator in a host container (`editing_aids_minimap.ts`); it only scrolls the editor.
 *
 * The only optional exception is `focus`: it sets one `data-breditor-focused` attribute (no text) on the innermost
 * block holding the selection focus, for host CSS. It is off by default.
 */
import {resolveRichUi,type RichUiLocale,type RichUiOptions} from "./ui_locale.js";
import {createRichMinimap,validateRichMinimapOptions,type RichMinimapController,type RichMinimapOptions} from "./editing_aids_minimap.js";

export type RichInvisibleKind="space"|"nbsp"|"tab"|"hardBreak"|"blockEnd";
/** Every invisible-character kind, in painting order. */
export const richInvisibleKinds:readonly RichInvisibleKind[]=Object.freeze(["space","nbsp","tab","hardBreak","blockEnd"]);
/** Default glyphs: middle dot, degree sign (no-break space), arrow (tab), return symbol (hard break) and pilcrow. */
export const richInvisibleGlyphs:Readonly<Record<RichInvisibleKind,string>>=Object.freeze({space:"·",nbsp:"°",tab:"→",hardBreak:"↵",blockEnd:"¶"});
/** Attribute the optional focus aid sets on the innermost block holding the selection focus. */
export const richFocusedBlockAttribute="data-breditor-focused";
export const RICH_EDITING_AIDS_MAX_MARKERS=65536;
/** Any editor whose surface is rendered by this package (local `RichDomEditor`, shared DOM editors, SDK editors). */
export interface RichEditingAidsHost {readonly surface:HTMLElement;uiLocale?():RichUiLocale}
export interface RichEditingAidsOptions {
 /** Initial state of each aid (all default false). */
 readonly showBlocks?:boolean;readonly invisibles?:boolean;readonly focus?:boolean;
 /** Invisible-character kinds to paint (default all). */
 readonly kinds?:readonly RichInvisibleKind[];
 /** Replacement glyphs per kind: one to four characters, no controls (default `richInvisibleGlyphs`). */
 readonly glyphs?:Readonly<Partial<Record<RichInvisibleKind,string>>>;
 /** Ctrl/Cmd+Alt+Shift+B toggles show blocks and Ctrl/Cmd+Alt+Shift+P invisible characters while the surface
  * has focus (default true). */
 readonly shortcuts?:boolean;
 /** Chrome catalog for block labels; defaults to the host's `uiLocale()`, else English. */
 readonly ui?:RichUiOptions|RichUiLocale;
 /** Install the default overlay/focus stylesheet (default true). Hosts may style the documented classes instead. */
 readonly injectStyles?:boolean;
 /** CSP nonce for the injected stylesheet. */
 readonly nonce?:string;
 /** Markers painted per frame (default 8192, at most 65536). Only blocks intersecting the visible surface are painted. */
 readonly maxMarkers?:number;
 readonly onChange?:(state:RichEditingAidsState)=>void;
 /** Opt-in content minimap in a host container outside the surface (docs/EDITING_AIDS.md). */
 readonly minimap?:RichMinimapOptions;
}
export interface RichEditingAidsState {readonly showBlocks:boolean;readonly invisibles:boolean;readonly focus:boolean;readonly minimap:boolean;readonly disposed:boolean}
export interface RichEditingAids {
 readonly surface:HTMLElement;
 /** The `aria-hidden` paint layer (`data-breditor-editing-aids`). */
 readonly overlay:HTMLElement;
 /** The `aria-hidden` minimap root (`data-breditor-minimap`) when a minimap container was given. */
 readonly minimap:HTMLElement|undefined;
 /** Whether the keyboard shortcuts are installed. */
 readonly shortcuts:boolean;
 state():RichEditingAidsState;
 setShowBlocks(on:boolean):void;toggleShowBlocks():boolean;
 setInvisibles(on:boolean):void;toggleInvisibles():boolean;
 setFocus(on:boolean):void;
 /** Show or hide the minimap; throws when no `minimap` container was given. */
 setMinimap(on:boolean):void;toggleMinimap():boolean;
 subscribe(listener:()=>void):()=>void;
 /** Repaint on the next frame (layout changes the observers cannot see, for example a host font load). */
 refresh():void;
 uiLocale():RichUiLocale;
 dispose():void;
}
export const richEditingAidsStyles=`[data-breditor-editing-aids]{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:10;contain:strict}[data-breditor-editing-aids] .breditor-aid-block{position:absolute;box-sizing:border-box;border:1px dashed #7c9a8f;border-radius:2px}[data-breditor-editing-aids] .breditor-aid-label{position:absolute;box-sizing:border-box;font:600 9px/12px system-ui,sans-serif;color:#fff;background:#5d7d72;padding:0 3px;white-space:nowrap;opacity:.85;border-radius:0 0 0 3px}[data-breditor-editing-aids] .breditor-aid-label[data-aid-side=start]{border-radius:0 0 3px 0}[data-breditor-editing-aids] .breditor-aid-char{position:absolute;display:flex;align-items:center;justify-content:center;color:#6f8c82;font-family:system-ui,sans-serif;line-height:1;white-space:pre}[data-breditor-minimap]{position:relative;width:100%;height:100%;overflow:hidden;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none}[data-breditor-minimap][hidden]{display:none}[data-breditor-minimap][data-dragging]{cursor:grabbing}[data-breditor-minimap]>*{position:absolute;left:0;top:0;pointer-events:none}[data-breditor-minimap] .breditor-minimap-block{position:absolute;box-sizing:border-box;border-radius:1px;background:#c9d5d1}[data-breditor-minimap] .breditor-minimap-block[data-minimap-kind=heading]{background:#5d7d72}[data-breditor-minimap] .breditor-minimap-block:is([data-minimap-kind=container],[data-minimap-kind=table]){background:none;border:1px solid #d9e2df}[data-breditor-minimap] .breditor-minimap-block:is([data-minimap-kind=image],[data-minimap-kind=atom]){background:#e3d9c6}[data-breditor-minimap] .breditor-minimap-block[data-minimap-kind=rule]{background:#9aa9a4}[data-breditor-minimap] .breditor-minimap-viewport{box-sizing:border-box;background:rgba(93,125,114,.16);border:1px solid rgba(93,125,114,.6);border-radius:2px}[data-breditor-minimap] .breditor-minimap-viewport[hidden]{display:none}[data-breditor-editing-aids] .breditor-aid-char[data-aid-kind=nbsp]{color:#b05a1a}[data-breditor-editing-aids] .breditor-aid-char[data-aid-kind=blockEnd],[data-breditor-editing-aids] .breditor-aid-char[data-aid-kind=hardBreak]{justify-content:flex-start}:is([data-breditor-rich],[data-breditor-shared]) [${richFocusedBlockAttribute}]{box-shadow:inset 3px 0 0 #9cc9b9}@media print{[data-breditor-editing-aids],[data-breditor-minimap]{display:none!important}:is([data-breditor-rich],[data-breditor-shared]) [${richFocusedBlockAttribute}]{box-shadow:none!important}}`;

const characters:Readonly<Record<string,RichInvisibleKind>>=Object.freeze({" ":"space"," ":"nbsp"," ":"nbsp","\t":"tab","\n":"hardBreak"});
/** UTF-16 units inspected per paint, independent of the marker limit. */
const CHARACTER_SCAN_LIMIT=200_000;
const mounted=new WeakSet<HTMLElement>();
const bool=(value:unknown,name:string,fallback:boolean):boolean=>{if(value===undefined)return fallback;if(typeof value!=="boolean")throw new TypeError(`${name} must be a Boolean`);return value;};

/** The catalog label for one rendered block element. Pure DOM reading; exported for tests and custom painters. */
export function richBlockLabel(element:Element,ui:RichUiLocale):string{
 const tag=element.tagName.toLowerCase(),data=(element as HTMLElement).dataset??{};
 if(data["richPageBreak"]!==undefined)return ui.text("aidBlockPageBreak");
 if(/^h[1-6]$/.test(tag))return ui.text("aidBlockHeading",{level:tag.slice(1)});
 if(tag==="p")return element.parentElement?.closest("caption,figcaption")?ui.text("aidBlockCaption"):ui.text("aidBlockParagraph");
 if(tag==="ul")return data["taskList"]!==undefined?ui.text("aidBlockTaskList"):ui.text("aidBlockBulletList");
 if(tag==="ol")return ui.text("aidBlockNumberedList");
 if(tag==="li")return data["richTask"]!==undefined?ui.text("aidBlockTaskItem"):ui.text("aidBlockListItem");
 const named:Readonly<Record<string,Parameters<RichUiLocale["text"]>[0]>>={blockquote:"aidBlockQuote",pre:"aidBlockCode",table:"aidBlockTable",figure:"aidBlockImage",hr:"aidBlockRule",details:"aidBlockDetails",summary:"aidBlockSummary"};
 const key=named[tag];return ui.text(key??"aidBlockOther");
}

/**
 * Mount the aids on an editor's surface. One mount per surface; `dispose()` removes every listener, the layer,
 * the stylesheet and any focus attribute, leaving the editor exactly as before.
 */
export function mountRichEditingAids(host:RichEditingAidsHost|HTMLElement,options:RichEditingAidsOptions={}):RichEditingAids{
 if(options===null||typeof options!=="object")throw new TypeError("Editing aid options must be an object");
 const surface=(host as RichEditingAidsHost).surface??host as HTMLElement;
 if(!surface||typeof surface.getBoundingClientRect!=="function"||!surface.ownerDocument?.defaultView)throw new TypeError("Editing aids need a connected editor surface");
 if(mounted.has(surface))throw Error("Editing aids are already mounted on this surface");
 const settings={showBlocks:bool(options.showBlocks,"showBlocks",false),invisibles:bool(options.invisibles,"invisibles",false),focus:bool(options.focus,"focus",false)};
 const shortcuts=bool(options.shortcuts,"shortcuts",true),inject=bool(options.injectStyles,"injectStyles",true);
 const kinds=new Set<RichInvisibleKind>(options.kinds??richInvisibleKinds);
 for(const kind of kinds)if(!richInvisibleKinds.includes(kind))throw new TypeError(`Unknown invisible-character kind ${JSON.stringify(kind)}`);
 const scanCharacters=[...kinds].some(kind=>kind!=="blockEnd");
 const glyphs:Record<RichInvisibleKind,string>={...richInvisibleGlyphs};
 if(options.glyphs!==undefined){
  if(options.glyphs===null||typeof options.glyphs!=="object")throw new TypeError("glyphs must be an object");
  for(const [kind,glyph] of Object.entries(options.glyphs)){
   if(!richInvisibleKinds.includes(kind as RichInvisibleKind))throw new TypeError(`Unknown invisible-character kind ${JSON.stringify(kind)}`);
   if(typeof glyph!=="string"||!glyph.length||[...glyph].length>4||/[\u0000-\u001f\u007f-\u009f]/.test(glyph))throw new TypeError(`Glyph for ${kind} must be one to four printable characters`);
   glyphs[kind as RichInvisibleKind]=glyph;
  }
 }
 const limit=options.maxMarkers??8192;
 if(!Number.isInteger(limit)||limit<1||limit>RICH_EDITING_AIDS_MAX_MARKERS)throw new RangeError(`maxMarkers must be an integer from 1 to ${RICH_EDITING_AIDS_MAX_MARKERS}`);
 if(options.nonce!==undefined&&(typeof options.nonce!=="string"||!options.nonce))throw new TypeError("nonce must be a nonempty string");
 if(options.onChange!==undefined&&typeof options.onChange!=="function")throw new TypeError("onChange must be a function");
 const minimapOptions=options.minimap!==undefined?validateRichMinimapOptions(options.minimap,surface):undefined;
 const ui=options.ui!==undefined?resolveRichUi(options.ui):typeof (host as RichEditingAidsHost).uiLocale==="function"?(host as RichEditingAidsHost).uiLocale!():resolveRichUi();

 const document=surface.ownerDocument,window=document.defaultView!;
 const realm=window as unknown as {AbortController:typeof AbortController;ResizeObserver?:typeof ResizeObserver;MutationObserver?:typeof MutationObserver;Node:typeof Node;NodeFilter:typeof NodeFilter};
 const abort=new realm.AbortController(),signal=abort.signal,listeners=new Set<()=>void>();
 const overlay=document.createElement("div");overlay.dataset["breditorEditingAids"]="";overlay.setAttribute("aria-hidden","true");
 const style=inject?document.createElement("style"):undefined;
 if(style){style.dataset["breditorEditingAidsStyles"]="";if(options.nonce)style.nonce=options.nonce;style.textContent=richEditingAidsStyles;(document.head??document.documentElement).append(style);}
 // Inside an active fullscreen element the layer must live in that element's subtree to stay visible.
 const place=():void=>{const full=document.fullscreenElement;const parent=full&&full!==surface&&full.contains(surface)?full:document.body??document.documentElement;if(overlay.parentNode!==parent)parent.append(overlay);};
 place();mounted.add(surface);
 const minimap:RichMinimapController|undefined=minimapOptions?createRichMinimap(surface,minimapOptions,signal):undefined;
 let frame:number|undefined,closed=false,composing=false,focused:HTMLElement|undefined;

 const state=():RichEditingAidsState=>Object.freeze({showBlocks:settings.showBlocks,invisibles:settings.invisibles,focus:settings.focus,minimap:!closed&&!!minimap?.visible,disposed:closed});
 const notify=():void=>{
  overlay.toggleAttribute("data-show-blocks",settings.showBlocks);overlay.toggleAttribute("data-invisibles",settings.invisibles);
  for(const listener of [...listeners])try{listener();}catch{/* A listener cannot change presentation state. */}
  try{options.onChange?.(state());}catch{/* A host callback cannot change presentation state. */}
 };
 const refresh=():void=>{if(closed||frame!==undefined)return;frame=window.requestAnimationFrame(()=>{frame=undefined;paint();});};

 const paint=():void=>{
  if(closed)return;
  if(!settings.showBlocks&&!settings.invisibles||!surface.isConnected){overlay.replaceChildren();return;}
  const bounds=surface.getBoundingClientRect();
  const clip={left:Math.max(0,bounds.left),top:Math.max(0,bounds.top),right:Math.min(window.innerWidth,bounds.right),bottom:Math.min(window.innerHeight,bounds.bottom)};
  if(clip.right<=clip.left||clip.bottom<=clip.top){overlay.replaceChildren();return;}
  const visible=(r:{left:number;top:number;right:number;bottom:number}):boolean=>r.bottom>=clip.top&&r.top<=clip.bottom&&r.right>=clip.left&&r.left<=clip.right;
  const fragment=document.createDocumentFragment();let count=0;
  const box=(className:string,left:number,top:number,width:number,height:number):HTMLDivElement=>{const element=document.createElement("div");element.className=className;element.style.cssText=`left:${left}px;top:${top}px;width:${Math.max(0,width)}px;height:${Math.max(0,height)}px`;fragment.append(element);count++;return element;};
  try{
   if(settings.showBlocks)for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]")){
    if(count+2>limit)break;
    const r=element.getBoundingClientRect();if(r.width===0&&r.height===0||!visible(r))continue;
    const left=Math.max(r.left,clip.left),top=Math.max(r.top,clip.top),right=Math.min(r.right,clip.right),bottom=Math.min(r.bottom,clip.bottom);
    box("breditor-aid-block",left,top,right-left,bottom-top).dataset["aidBlock"]=element.dataset["richBlock"]??"";
    const rtl=window.getComputedStyle(element).direction==="rtl";
    const label=document.createElement("div");label.className="breditor-aid-label";label.dataset["aidLabel"]=element.dataset["richBlock"]??"";label.dataset["aidSide"]=rtl?"start":"end";
    label.textContent=richBlockLabel(element,ui);label.style.cssText=rtl?`left:${left}px;top:${top}px`:`left:${right}px;top:${top}px;transform:translateX(-100%)`;
    fragment.append(label);count++;
   }
   if(settings.invisibles&&!composing){
    let budget=CHARACTER_SCAN_LIMIT;const range=document.createRange();
    const glyph=(kind:RichInvisibleKind,left:number,top:number,width:number,height:number):void=>{
     if(count>=limit||!kinds.has(kind)||height<=0)return;
     if(left+width<clip.left||left>clip.right||top+height<clip.top||top>clip.bottom)return;
     const element=box("breditor-aid-char",left,top,width,height);element.dataset["aidKind"]=kind;element.textContent=glyphs[kind];element.style.fontSize=`${Math.max(8,Math.round(height*0.6))}px`;
    };
    outer:for(const block of surface.querySelectorAll<HTMLElement>("[data-rich-text]")){
     if(count>=limit||budget<=0)break;
     const blockRect=block.getBoundingClientRect();if(!visible(blockRect))continue;
     const rtl=window.getComputedStyle(block).direction==="rtl";
     const walker=document.createTreeWalker(block,realm.NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement?.closest('[contenteditable="false"],[data-rich-text]')===block?realm.NodeFilter.FILTER_ACCEPT:realm.NodeFilter.FILTER_REJECT});
     let last:{node:Text;offset:number}|undefined;
     for(let node=walker.nextNode() as Text|null;node;node=walker.nextNode() as Text|null){
      const text=node.data;if(!text.length)continue;last={node,offset:text.length};
      if(!scanCharacters)continue;
      range.selectNodeContents(node);if(!visible(range.getBoundingClientRect()))continue;
      for(let index=0;index<text.length;index++){
       if(budget===0||count>=limit)break outer;
       budget--;
       const kind=characters[text[index]!];if(!kind||!kinds.has(kind))continue;
       range.setStart(node,index);range.setEnd(node,index+1);
       const rect=[...range.getClientRects()].find(item=>item.height>0);if(!rect)continue;
       if(kind==="hardBreak"){const width=rect.height*0.7;glyph(kind,rtl?rect.right-width:rect.left,rect.top,width,rect.height);}
       else glyph(kind,rect.left,rect.top,rect.width,rect.height);
      }
     }
     if(!kinds.has("blockEnd"))continue;
     // The paragraph mark goes after the block's last line: on the presentation-only trailing break line when
     // the text ends with a hard break, else after the last character, else at the start of an empty block.
     const trailing=block.querySelector<HTMLElement>("[data-rich-trailing-break]"),empty=!last;
     let at:{x:number;top:number;height:number}|undefined;
     const anchor=trailing??(empty?block.querySelector<HTMLElement>("br"):null);
     if(anchor){const rect=anchor.getBoundingClientRect();if(rect.height>0)at={x:rtl?rect.right:rect.left,top:rect.top,height:rect.height};}
     if(!at&&last&&!trailing){range.setStart(last.node,last.offset-1);range.setEnd(last.node,last.offset);const rects=[...range.getClientRects()].filter(item=>item.height>0),rect=rects[rects.length-1];if(rect)at={x:rtl?rect.left:rect.right,top:rect.top,height:rect.height};}
     if(!at){const computed=window.getComputedStyle(block),line=Number.parseFloat(computed.lineHeight)||Number.parseFloat(computed.fontSize)*1.2||16;
      at={x:rtl?blockRect.right-(Number.parseFloat(computed.paddingRight)||0):blockRect.left+(Number.parseFloat(computed.paddingLeft)||0),top:blockRect.top+(Number.parseFloat(computed.paddingTop)||0),height:line};}
     const width=at.height*0.6;glyph("blockEnd",rtl?at.x-width:at.x,at.top,width,at.height);
    }
    range.detach?.();
   }
  }catch{overlay.replaceChildren();return;}
  overlay.replaceChildren(fragment);
 };

 const updateFocus=():void=>{
  if(closed)return;
  let next:HTMLElement|undefined;
  if(settings.focus){
   const selection=document.getSelection(),node=selection?.focusNode;
   const element=node?(node.nodeType===1?node as Element:node.parentElement):null;
   if(element&&surface.contains(element))next=element.closest<HTMLElement>("[data-rich-block]")??undefined;
   if(next&&!surface.contains(next))next=undefined;
  }
  if(focused===next&&(!next||next.hasAttribute(richFocusedBlockAttribute)))return;
  focused?.removeAttribute(richFocusedBlockAttribute);focused=next;next?.setAttribute(richFocusedBlockAttribute,"");
 };

 const resize=realm.ResizeObserver?new realm.ResizeObserver(()=>{refresh();minimap?.refresh();}):undefined;resize?.observe(surface);
 const mutation=realm.MutationObserver?new realm.MutationObserver(records=>{
  if(records.every(record=>record.type==="attributes"&&record.attributeName===richFocusedBlockAttribute))return;
  if(settings.focus)updateFocus();refresh();minimap?.refresh();
 }):undefined;
 mutation?.observe(surface,{childList:true,subtree:true,characterData:true,attributes:true});
 window.addEventListener("scroll",()=>{refresh();minimap?.track();},{signal,capture:true,passive:true});window.addEventListener("resize",()=>{refresh();minimap?.refresh();},{signal});
 document.addEventListener("fullscreenchange",()=>{place();refresh();minimap?.refresh();},{signal});
 document.addEventListener("selectionchange",()=>{if(settings.focus)updateFocus();},{signal});
 surface.addEventListener("compositionstart",()=>{composing=true;if(settings.invisibles)refresh();},{signal});
 surface.addEventListener("compositionend",()=>{composing=false;refresh();},{signal});
 if(shortcuts)document.addEventListener("keydown",event=>{
  // Captured before the editor sees it, so a toggle never closes a typing group or reaches a command path.
  if(closed||event.isComposing||!(event.metaKey||event.ctrlKey)||!event.altKey||!event.shiftKey||event.repeat)return;
  const target=event.target;if(!(target instanceof realm.Node)||!surface.contains(target))return;
  if(event.code==="KeyB")aids.toggleShowBlocks();else if(event.code==="KeyP")aids.toggleInvisibles();else return;
  event.preventDefault();event.stopPropagation();
 },{signal,capture:true});

 const live=():void=>{if(closed)throw Error("The editing aids were disposed");};
 const aids:RichEditingAids={
  surface,overlay,minimap:minimap?.element,shortcuts,state,
  setShowBlocks(on){live();bool(on,"showBlocks",false);if(settings.showBlocks===on)return;settings.showBlocks=on;notify();refresh();},
  toggleShowBlocks(){aids.setShowBlocks(!settings.showBlocks);return settings.showBlocks;},
  setInvisibles(on){live();bool(on,"invisibles",false);if(settings.invisibles===on)return;settings.invisibles=on;notify();refresh();},
  toggleInvisibles(){aids.setInvisibles(!settings.invisibles);return settings.invisibles;},
  setFocus(on){live();bool(on,"focus",false);if(settings.focus===on)return;settings.focus=on;updateFocus();notify();},
  setMinimap(on){live();bool(on,"minimap",false);if(!minimap)throw Error("No minimap container was given");if(minimap.visible===on)return;minimap.setVisible(on);notify();},
  toggleMinimap(){aids.setMinimap(!minimap?.visible);return !!minimap?.visible;},
  subscribe(listener){live();if(typeof listener!=="function")throw new TypeError("Expected a listener function");listeners.add(listener);return ()=>{listeners.delete(listener);};},
  refresh:()=>{refresh();minimap?.refresh();},uiLocale:()=>ui,
  dispose(){
   if(closed)return;closed=true;abort.abort();minimap?.dispose();resize?.disconnect();mutation?.disconnect();if(frame!==undefined)window.cancelAnimationFrame(frame);frame=undefined;
   focused?.removeAttribute(richFocusedBlockAttribute);focused=undefined;overlay.remove();style?.remove();mounted.delete(surface);
   for(const listener of [...listeners])try{listener();}catch{/* Retirement notification only. */}
   listeners.clear();
  },
 };
 overlay.toggleAttribute("data-show-blocks",settings.showBlocks);overlay.toggleAttribute("data-invisibles",settings.invisibles);
 if(settings.focus)updateFocus();refresh();
 return aids;
}

export interface RichEditingAidsControlsOptions {readonly onError?:(error:unknown)=>void}
export interface RichEditingAidsControls {readonly element:HTMLElement;refresh():void;dispose():void}
/**
 * Two toggle buttons (`aria-pressed`) for borrowed aids, appended to a host outside the editable surface — for
 * example the editor's own toolbar. Buttons keep editor focus on pointer down. Disposal removes only the buttons.
 */
export function mountRichEditingAidsControls(host:HTMLElement,aids:RichEditingAids,options:RichEditingAidsControlsOptions={}):RichEditingAidsControls{
 if(!host||host.ownerDocument!==aids.surface.ownerDocument||host===aids.surface||aids.surface.contains(host))throw Error("Editing aid controls need a host outside editable content in the editor document");
 if(aids.state().disposed)throw Error("Editing aid controls require active aids");
 const document=host.ownerDocument,ui=aids.uiLocale(),abort=new (document.defaultView as unknown as {AbortController:typeof AbortController}).AbortController();
 const element=document.createElement("div");element.dataset["breditorEditingAidsControls"]="";element.className="breditor-inline-control";element.setAttribute("role","group");element.setAttribute("aria-label",ui.text("aidsLabel"));ui.applyChrome(element);
 const button=(id:string,label:string,key:string,toggle:()=>void):HTMLButtonElement=>{
  const node=document.createElement("button");node.type="button";node.dataset["aidToggle"]=id;node.textContent=label;
  if(aids.shortcuts)node.setAttribute("aria-keyshortcuts",`Control+Alt+Shift+${key} Meta+Alt+Shift+${key}`);
  node.addEventListener("pointerdown",event=>event.preventDefault(),{signal:abort.signal});
  node.addEventListener("click",()=>{try{toggle();}catch(error){try{options.onError?.(error);}catch{/* Reporter only. */}}refresh();},{signal:abort.signal});
  element.append(node);return node;
 };
 const blocks=button("show-blocks",ui.text("aidsShowBlocks"),"B",()=>aids.toggleShowBlocks());
 const invisibles=button("invisibles",ui.text("aidsInvisibles"),"P",()=>aids.toggleInvisibles());
 let disposed=false;
 const refresh=():void=>{if(disposed)return;const state=aids.state();blocks.setAttribute("aria-pressed",String(state.showBlocks));invisibles.setAttribute("aria-pressed",String(state.invisibles));blocks.disabled=invisibles.disabled=state.disposed;};
 const unsubscribe=aids.subscribe(refresh);host.append(element);refresh();
 return {element,refresh,dispose(){if(disposed)return;disposed=true;abort.abort();unsubscribe();element.remove();}};
}
