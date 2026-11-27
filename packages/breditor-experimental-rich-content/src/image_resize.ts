/**
 * Opt-in accessible image resize handles.
 *
 * Handles live in a borrowed overlay host outside editable content and never mutate rendered document DOM.
 * A pointer drag paints only an overlay outline and size badge, then commits exactly one existing image
 * resize command on release, so the owner records one Undo step. The keyboard surface is one focusable
 * `role="slider"` per image (the bottom inline-end corner handle); each accepted key commits one command.
 */
import {createRichStyleElement} from "./style_element.js";
import {defaultRichUi,type RichUiLocale} from "./ui_locale.js";

/** Admitted Rust display dimension domain (`ImageSize::try_new`, logical pixels, each axis). */
export const RICH_IMAGE_SIZE_MIN=1;
export const RICH_IMAGE_SIZE_MAX=4096;

export interface RichImageSize {readonly width:number;readonly height:number}
export interface RichImageResizeHostState {readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean}
/** Structural port satisfied by both `RichDomEditor` and the shared DOM editor. */
export interface RichImageResizeHost {
 readonly surface:HTMLElement;
 /** Optional chrome catalog for slider names/values and the badge's `dir`/`lang`. */
 uiLocale?():RichUiLocale;
 writingState():RichImageResizeHostState;
 /** Must notify after every local or remote publication. */
 subscribeWriting(listener:()=>void):()=>void;
 /** Image ids, block ids and display sizes are read from `documentJson`; a node selection marks the active image. */
 view():{readonly revision:string;readonly documentJson:string;readonly selection?:unknown};
}
/** One resize command. `image` is the stable image id and `block` its rendered block id. */
export interface RichImageResizeRequest {readonly image:string;readonly block:string;readonly size:RichImageSize;readonly revision:string}
export type RichImageResizeCancel="escape"|"blur"|"image-changed"|"unavailable"|"pointer-cancel"|"disposed"|"api";
/** `corner` keeps the aspect ratio unless Shift is held; the edges change one axis. */
export type RichImageResizeHandleKind="corner"|"inline-end"|"block-end";
export interface RichImageResizeOptions {
 /** Publish exactly one existing image resize command through the owner's action API. */
 commit(request:RichImageResizeRequest):unknown;
 /** Arrow-key width step in logical pixels (default 8). Shift+Arrow and PageUp/PageDown use `largeStep` (default 64). */
 step?:number;largeStep?:number;
 /** Overrides the host catalog's imageResizeLabel. `index` is zero-based in document order. */
 label?:(index:number,count:number,image:string)=>string;
 onCancel?:(reason:RichImageResizeCancel)=>void;
 onError?:(error:unknown)=>void;
}
export interface RichImageResizePreview {readonly image:string;readonly handle:RichImageResizeHandleKind;readonly start:RichImageSize;readonly size:RichImageSize;readonly free:boolean}
export interface RichImageResize {refresh():void;cancel():void;preview():RichImageResizePreview|null;dispose():void}

/** Commit through the local rich owner's existing `resizeImage` command. */
export function richImageResizeCommit(dom:{execute(command:{kind:"resizeImage";data:{image:string;size:{width:number;height:number}}},focus?:boolean,expectedRevision?:string):unknown}):(request:RichImageResizeRequest)=>unknown {
 return request=>dom.execute({kind:"resizeImage",data:{image:request.image,size:{width:request.size.width,height:request.size.height}}},false,request.revision);
}

/** Round and clamp one display dimension to the admitted 1..4096 domain. */
export function clampRichImageDimension(value:number):number {
 if(!Number.isFinite(value))throw RangeError("Expected a finite image dimension");
 return Math.min(RICH_IMAGE_SIZE_MAX,Math.max(RICH_IMAGE_SIZE_MIN,Math.round(value)));
}
/**
 * Scale `start` by `factor`, keeping its aspect ratio. The factor is first limited so that neither axis leaves
 * the admitted domain; only rounding (and the 1px floor) can then move the ratio.
 */
export function scaleRichImageSize(start:RichImageSize,factor:number):RichImageSize {
 if(Number.isNaN(factor))throw RangeError("Expected a numeric scale factor");
 const width=clampRichImageDimension(start.width),height=clampRichImageDimension(start.height);
 const min=Math.max(RICH_IMAGE_SIZE_MIN/width,RICH_IMAGE_SIZE_MIN/height),max=Math.min(RICH_IMAGE_SIZE_MAX/width,RICH_IMAGE_SIZE_MAX/height),f=Math.min(max,Math.max(min,factor));
 return Object.freeze({width:clampRichImageDimension(width*f),height:clampRichImageDimension(height*f)});
}

interface ImageEntry {readonly image:string;readonly block:string;readonly size:RichImageSize|null}
interface Node {kind?:unknown;type?:unknown;properties?:Record<string,unknown>;children?:unknown[]}
function readImages(documentJson:string):Map<string,ImageEntry> {
 const images=new Map<string,ImageEntry>(),root=(JSON.parse(documentJson) as {root?:Node}).root,stack:Node[]=root?[root]:[];
 while(stack.length){
  const node=stack.pop()!;if(node.kind!=="element")continue;
  if(node.type==="breditor/image"){
   const p=node.properties??{},image=p["breditor/image-id"],block=p["breditor/block-id"],width=p["breditor/width"],height=p["breditor/height"];
   if(typeof image==="string"&&typeof block==="string")images.set(image,{image,block,size:typeof width==="number"&&typeof height==="number"?{width,height}:null});
  }
  for(const child of node.children??[])if(child&&typeof child==="object")stack.push(child as Node);
 }
 return images;
}
const signature=(entry:ImageEntry|undefined):string=>entry?JSON.stringify([entry.block,entry.size?[entry.size.width,entry.size.height]:null]):"";
const same=(a:RichImageSize,b:RichImageSize):boolean=>a.width===b.width&&a.height===b.height;
const positiveStep=(value:number|undefined,fallback:number,name:string):number=>{if(value===undefined)return fallback;if(!Number.isSafeInteger(value)||value<1||value>RICH_IMAGE_SIZE_MAX)throw RangeError(`Expected a positive integer ${name}`);return value;};
/** Computed content direction of the rendered figure (block-direction or inherited); never the chrome direction. */
const isRtl=(element:HTMLElement):boolean=>{try{return element.ownerDocument.defaultView?.getComputedStyle(element).direction==="rtl";}catch{return false;}};
const roots=new WeakSet<HTMLElement>();
const accent="#398a79";
export const richImageResizeStyles=`[data-breditor-image-resize]{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none}[data-breditor-image-resize] [data-image-resize-handle]{position:absolute;box-sizing:border-box;opacity:0;pointer-events:none;touch-action:none;outline:none}[data-breditor-image-resize] [data-image-resize-group]:is([data-selected],[data-hover],[data-dragging],:focus-within) [data-image-resize-handle]{opacity:1;pointer-events:auto}[data-breditor-image-resize] [data-image-resize-handle=corner]{width:12px;height:12px;margin:-6px 0 0 -6px;background:white;border:2px solid ${accent};border-radius:2px;cursor:nwse-resize}[data-breditor-image-resize] [data-rtl] [data-image-resize-handle=corner]{cursor:nesw-resize}[data-breditor-image-resize] [data-image-resize-handle=corner]:focus-visible{box-shadow:0 0 0 3px #173d37}[data-breditor-image-resize] [data-image-resize-handle=corner][aria-disabled=true]{cursor:default;border-color:#9fb2aa}[data-breditor-image-resize] [data-image-resize-handle=inline-end]{width:9px;margin-left:-4px;cursor:ew-resize;background:linear-gradient(90deg,transparent 3px,${accent} 3px,${accent} 6px,transparent 6px)}[data-breditor-image-resize] [data-image-resize-handle=block-end]{height:9px;margin-top:-4px;cursor:ns-resize;background:linear-gradient(180deg,transparent 3px,${accent} 3px,${accent} 6px,transparent 6px)}[data-breditor-image-resize] [data-disabled] [data-image-resize-handle]:not([role]){display:none}[data-breditor-image-resize] [data-image-resize-outline]{position:absolute;box-sizing:border-box;border:2px dashed ${accent};pointer-events:none}[data-breditor-image-resize] [data-image-resize-badge]{position:absolute;font:11px system-ui,sans-serif;background:#173d37;color:white;padding:1px 5px;border-radius:3px;white-space:nowrap;pointer-events:none}`;

interface Geometry {rtl:boolean;rect:DOMRect;scaleX:number;scaleY:number;size:RichImageSize|null;signature:string;block:string}
interface Group {image:string;root:HTMLElement;slider:HTMLElement;inlineEnd:HTMLElement;blockEnd:HTMLElement;geometry:Geometry|null}
interface Drag {group:Group;kind:RichImageResizeHandleKind;element:HTMLElement;pointer:number;start:RichImageSize;size:RichImageSize;free:boolean;startX:number;startY:number;geometry:Geometry}

/**
 * Mount resize handles for every rendered image in `host.surface`. Handles appear on hover, on the
 * node-selected image and while the slider has focus. `overlay` must be an unused element outside editable
 * content in the same document.
 */
export function mountRichImageResize(overlay:HTMLElement,host:RichImageResizeHost,options:RichImageResizeOptions):RichImageResize {
 if(roots.has(overlay)||overlay===host.surface||overlay.contains(host.surface)||host.surface.contains(overlay)||overlay.ownerDocument!==host.surface.ownerDocument)throw Error("Image resize handles need an unused host outside editable content");
 if(typeof options?.commit!=="function")throw TypeError("Image resize handles need an explicit commit command");
 const step=positiveStep(options.step,8,"step"),largeStep=positiveStep(options.largeStep,64,"largeStep");
 const d=overlay.ownerDocument,win=d.defaultView!,abort=new win.AbortController(),layer=d.createElement("div"),outline=d.createElement("div"),badge=d.createElement("div"),groups=new Map<string,Group>();
 let disposed=false,drag:Drag|undefined,hovered:string|undefined,cache:{revision:string;images:Map<string,ImageEntry>}|undefined;
 const ui=host.uiLocale?.()??defaultRichUi;ui.applyChrome(badge);
 layer.dataset["breditorImageResize"]="";outline.dataset["imageResizeOutline"]="";badge.dataset["imageResizeBadge"]="";outline.setAttribute("aria-hidden","true");badge.setAttribute("aria-hidden","true");outline.hidden=badge.hidden=true;
 const style=createRichStyleElement(d,richImageResizeStyles);layer.append(style,outline,badge);
 const report=(error:unknown)=>{try{options.onError?.(error);}catch{/* A reporter cannot change document ownership. */}};
 const editable=(state:RichImageResizeHostState)=>!state.closed&&!state.readOnly&&!state.busy&&!state.composing;
 const images=():Map<string,ImageEntry>=>{
  const view=host.view();
  if(cache?.revision!==view.revision)cache={revision:view.revision,images:host.surface.querySelector("figure[data-rich-image]")?readImages(view.documentJson):new Map()};
  return cache.images;
 };
 const selectedBlock=():string|undefined=>{const selection=host.view().selection as {kind?:unknown;block?:unknown}|null|undefined;return selection?.kind==="node"&&typeof selection.block==="string"?selection.block:undefined;};
 const figures=()=>[...host.surface.querySelectorAll<HTMLElement>("figure[data-rich-image]")];
 const bitmap=(figure:HTMLElement)=>figure.querySelector<HTMLImageElement>(":scope > img, :scope > a > img");
 const paintPreview=()=>{
  if(!drag){outline.hidden=badge.hidden=true;return;}
  const {geometry,size}=drag,origin=layer.getBoundingClientRect(),width=size.width*geometry.scaleX,height=size.height*geometry.scaleY;
  // The image stays anchored at its top inline-start corner, as the rendered layout will after the commit.
  const left=geometry.rtl?geometry.rect.right-width:geometry.rect.left;
  outline.hidden=badge.hidden=false;
  outline.style.left=`${left-origin.left}px`;outline.style.top=`${geometry.rect.top-origin.top}px`;outline.style.width=`${width}px`;outline.style.height=`${height}px`;
  badge.textContent=ui.text("imageResizeBadge",{width:size.width,height:size.height});
  badge.style.left=`${geometry.rtl?left-origin.left-6-badge.offsetWidth:left+width-origin.left+6}px`;badge.style.top=`${geometry.rect.top+height-origin.top+6}px`;
  drag.group.slider.setAttribute("aria-valuetext",ui.text("imageResizePreview",{width:size.width,height:size.height}));
 };
 const release=(current:Drag)=>{
  delete current.group.root.dataset["dragging"];
  try{if(current.element.hasPointerCapture?.(current.pointer))current.element.releasePointerCapture(current.pointer);}catch{/* Capture may already be gone. */}
 };
 const cancel=(reason:RichImageResizeCancel)=>{
  if(!drag)return;const current=drag;drag=undefined;release(current);
  paintPreview();refresh();try{options.onCancel?.(reason);}catch(error){report(error);}
 };
 const commit=(image:string,size:RichImageSize,start:RichImageSize,expected:string)=>{
  const state=host.writingState(),entry=images().get(image);
  if(!editable(state)||!entry||signature(entry)!==expected||same(size,start)||entry.size&&same(entry.size,size))return;
  try{options.commit({image,block:entry.block,size:Object.freeze({width:clampRichImageDimension(size.width),height:clampRichImageDimension(size.height)}),revision:state.revision});}catch(error){report(error);}
  refresh();
 };
 function refresh():void {
  if(disposed)return;
  let state:RichImageResizeHostState,list:Map<string,ImageEntry>,selected:string|undefined;
  try{state=host.writingState();list=state.closed?new Map():images();selected=state.closed?undefined:selectedBlock();}
  catch(error){report(error);state={revision:"",closed:true,busy:false,composing:false,readOnly:true};list=new Map();selected=undefined;}
  if(drag){if(state.closed||state.readOnly||state.composing)cancel("unavailable");else if(signature(list.get(drag.group.image))!==drag.geometry.signature)cancel("image-changed");}
  const seen=new Set<string>();
  if(!state.closed&&!state.readOnly){
   const rendered=figures().filter(figure=>list.has(figure.dataset["richImage"]??""));
   rendered.forEach((figure,index)=>{
    const id=figure.dataset["richImage"]!,entry=list.get(id)!,img=bitmap(figure);if(!img||seen.has(id))return;seen.add(id);
    let group=groups.get(id);if(!group){group=create(id);groups.set(id,group);layer.append(group.root);}
    const rect=img.getBoundingClientRect(),width=img.naturalWidth,height=img.naturalHeight;
    // Fit an unsized bitmap proportionally into the display domain once it has decoded.
    const fit=Math.min(1,RICH_IMAGE_SIZE_MAX/Math.max(width,height));
    const natural=width>0&&height>0?{width:clampRichImageDimension(width*fit),height:clampRichImageDimension(height*fit)}:null;
    const size=entry.size??natural,rtl=isRtl(figure);
    // Only shrinking (max-width) maps model pixels to fewer screen pixels; CSS minimum sizes never inflate drag deltas.
    const scale=(screen:number,model:number|undefined)=>model&&screen>0?Math.min(1,screen/model):1;
    group.geometry={rtl,rect,scaleX:scale(rect.width,size?.width),scaleY:scale(rect.height,size?.height),size,signature:signature(entry),block:entry.block};
    const {root,slider,inlineEnd,blockEnd}=group,origin=layer.getBoundingClientRect(),end=rtl?rect.left:rect.right;
    if(rtl)root.dataset["rtl"]="";else delete root.dataset["rtl"];
    if(entry.block===selected)root.dataset["selected"]="";else delete root.dataset["selected"];
    if(hovered===id)root.dataset["hover"]="";else delete root.dataset["hover"];
    const enabled=editable(state)&&size!==null;if(enabled)delete root.dataset["disabled"];else root.dataset["disabled"]="";
    slider.dataset["block"]=entry.block;
    slider.setAttribute("aria-label",options.label?.(index,rendered.length,id)??ui.text("imageResizeLabel",{index:index+1,count:rendered.length}));
    slider.setAttribute("aria-disabled",String(!enabled));
    if(size){
     slider.setAttribute("aria-valuenow",String(size.width));slider.setAttribute("aria-valuemin",String(scaleRichImageSize(size,0).width));slider.setAttribute("aria-valuemax",String(scaleRichImageSize(size,Infinity).width));
     if(drag?.group!==group)slider.setAttribute("aria-valuetext",ui.text(entry.size?"imageResizeValue":"imageResizeOriginal",{width:size.width,height:size.height}));
    }else{for(const name of ["aria-valuenow","aria-valuetext"])slider.removeAttribute(name);slider.setAttribute("aria-valuemin",String(RICH_IMAGE_SIZE_MIN));slider.setAttribute("aria-valuemax",String(RICH_IMAGE_SIZE_MAX));}
    slider.style.left=`${end-origin.left}px`;slider.style.top=`${rect.bottom-origin.top}px`;
    inlineEnd.style.left=`${end-origin.left}px`;inlineEnd.style.top=`${rect.top-origin.top}px`;inlineEnd.style.height=`${Math.max(0,rect.height-8)}px`;
    blockEnd.style.left=`${(rtl?rect.left+8:rect.left)-origin.left}px`;blockEnd.style.top=`${rect.bottom-origin.top}px`;blockEnd.style.width=`${Math.max(0,rect.width-8)}px`;
   });
  }
  for(const [id,group] of groups)if(!seen.has(id)){if(drag?.group===group)cancel("image-changed");groups.delete(id);group.root.remove();if(hovered===id)hovered=undefined;}
  paintPreview();
 }
 function create(image:string):Group {
  const root=d.createElement("div"),slider=d.createElement("div"),inlineEnd=d.createElement("div"),blockEnd=d.createElement("div");
  root.dataset["imageResizeGroup"]="";root.dataset["image"]=image;
  slider.setAttribute("role","slider");slider.tabIndex=0;slider.dataset["imageResizeHandle"]="corner";
  inlineEnd.dataset["imageResizeHandle"]="inline-end";blockEnd.dataset["imageResizeHandle"]="block-end";
  for(const edge of [inlineEnd,blockEnd])edge.setAttribute("aria-hidden","true");
  root.append(inlineEnd,blockEnd,slider);
  const group:Group={image,root,slider,inlineEnd,blockEnd,geometry:null};
  slider.addEventListener("keydown",event=>{
   if(event.key==="Escape"){if(drag){event.preventDefault();event.stopPropagation();cancel("escape");}return;}
   if(drag||event.altKey||event.ctrlKey||event.metaKey)return;
   const geometry=group.geometry,start=geometry?.size;if(!geometry||!start)return;
   const amount=event.shiftKey?largeStep:step;
   // Arrows move the corner visually: in right-to-left content the corner is on the left, so ArrowLeft grows.
   const grow=geometry.rtl?"ArrowLeft":"ArrowRight",shrink=geometry.rtl?"ArrowRight":"ArrowLeft";
   let factor:number;
   switch(event.key){
    case grow:case "ArrowUp":factor=(start.width+amount)/start.width;break;
    case shrink:case "ArrowDown":factor=(start.width-amount)/start.width;break;
    case "PageUp":factor=(start.width+largeStep)/start.width;break;
    case "PageDown":factor=(start.width-largeStep)/start.width;break;
    case "Home":factor=0;break;case "End":factor=Infinity;break;
    default:return;
   }
   event.preventDefault();commit(image,scaleRichImageSize(start,factor),start,geometry.signature);
  },{signal:abort.signal});
  for(const [element,kind] of [[slider,"corner"],[inlineEnd,"inline-end"],[blockEnd,"block-end"]] as const){
   element.addEventListener("pointerdown",event=>{
    if(event.button!==0||drag||!event.isPrimary&&event.isPrimary!==undefined)return;
    const geometry=group.geometry,state=host.writingState();if(!geometry?.size||!editable(state))return;
    event.preventDefault();slider.focus({preventScroll:true});
    try{element.setPointerCapture?.(event.pointerId);}catch{/* Synthetic or detached pointer. */}
    drag={group,kind,element,pointer:event.pointerId,start:geometry.size,size:geometry.size,free:false,startX:event.clientX,startY:event.clientY,geometry};
    root.dataset["dragging"]="";paintPreview();
   },{signal:abort.signal});
   element.addEventListener("pointermove",event=>{
    if(!drag||drag.element!==element||event.pointerId!==drag.pointer)return;event.preventDefault();
    const {geometry,start}=drag,dx=(event.clientX-drag.startX)*(geometry.rtl?-1:1)/geometry.scaleX,dy=(event.clientY-drag.startY)/geometry.scaleY;
    drag.free=kind!=="corner"||event.shiftKey;
    if(kind==="inline-end")drag.size={width:clampRichImageDimension(start.width+dx),height:start.height};
    else if(kind==="block-end")drag.size={width:start.width,height:clampRichImageDimension(start.height+dy)};
    else if(event.shiftKey)drag.size={width:clampRichImageDimension(start.width+dx),height:clampRichImageDimension(start.height+dy)};
    else{
     // Follow whichever axis the pointer moved further, relative to its own size.
     const fx=(start.width+dx)/start.width,fy=(start.height+dy)/start.height;
     drag.size=scaleRichImageSize(start,Math.abs(fx-1)>=Math.abs(fy-1)?fx:fy);
    }
    paintPreview();
   },{signal:abort.signal});
   element.addEventListener("pointerup",event=>{
    if(!drag||drag.element!==element||event.pointerId!==drag.pointer)return;event.preventDefault();
    const done=drag;drag=undefined;release(done);paintPreview();
    // An image changed since drag start was already cancelled by refresh; recheck before the one commit.
    if(signature(images().get(image))!==done.geometry.signature){refresh();try{options.onCancel?.("image-changed");}catch(error){report(error);}return;}
    commit(image,done.size,done.start,done.geometry.signature);
   },{signal:abort.signal});
   element.addEventListener("pointercancel",event=>{if(drag?.element===element&&event.pointerId===drag.pointer)cancel("pointer-cancel");},{signal:abort.signal});
   element.addEventListener("lostpointercapture",event=>{if(drag?.element===element&&event.pointerId===drag.pointer)cancel("pointer-cancel");},{signal:abort.signal});
  }
  slider.addEventListener("blur",()=>{if(drag?.group===group)cancel("blur");},{signal:abort.signal});
  return group;
 }
 const hover=(id:string|undefined)=>{if(hovered===id)return;hovered=id;for(const [key,group] of groups)if(key===id)group.root.dataset["hover"]="";else delete group.root.dataset["hover"];};
 d.addEventListener("pointermove",event=>{
  if(drag||event.pointerType==="touch")return;
  // Hit-test the image box plus a margin that covers the handles, so moving onto a handle keeps them shown.
  let hit:string|undefined;for(const [id,group] of groups){const r=group.geometry?.rect;if(r&&event.clientX>=r.left-12&&event.clientX<=r.right+12&&event.clientY>=r.top-12&&event.clientY<=r.bottom+12){hit=id;break;}}
  hover(hit);
 },{capture:true,passive:true,signal:abort.signal});
 d.addEventListener("pointerout",event=>{if(!event.relatedTarget&&!drag)hover(undefined);},{capture:true,passive:true,signal:abort.signal});
 d.addEventListener("keydown",event=>{if(drag&&event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel("escape");}},{capture:true,signal:abort.signal});
 win.addEventListener("blur",()=>cancel("blur"),{signal:abort.signal});
 win.addEventListener("resize",()=>refresh(),{signal:abort.signal});
 d.addEventListener("scroll",()=>refresh(),{capture:true,passive:true,signal:abort.signal});
 // Image decode changes intrinsic sizes and layout; `load` does not bubble, so listen while capturing.
 host.surface.addEventListener("load",()=>refresh(),{capture:true,signal:abort.signal});
 const ResizeObserverCtor=(win as unknown as {ResizeObserver?:typeof ResizeObserver}).ResizeObserver,observer=ResizeObserverCtor?new ResizeObserverCtor(()=>refresh()):undefined;
 const unsubscribe=host.subscribeWriting(()=>refresh());
 try{roots.add(overlay);overlay.append(layer);observer?.observe(host.surface);refresh();}
 catch(error){unsubscribe();observer?.disconnect();abort.abort();roots.delete(overlay);layer.remove();throw error;}
 return {
  refresh,
  cancel(){cancel("api");},
  preview(){return drag?Object.freeze({image:drag.group.image,handle:drag.kind,start:drag.start,size:Object.freeze({...drag.size}),free:drag.free}):null;},
  dispose(){if(disposed)return;cancel("disposed");disposed=true;unsubscribe();observer?.disconnect();abort.abort();groups.clear();layer.remove();roots.delete(overlay);},
 };
}
