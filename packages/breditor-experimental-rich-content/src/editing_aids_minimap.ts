/**
 * Content minimap for the editing aids (docs/EDITING_AIDS.md): a scaled overview of the editor's rendered blocks
 * with a draggable viewport indicator, painted in a host-provided container.
 *
 * Presentation only. The minimap never clones editable content: it reads the border boxes of `[data-rich-block]`
 * elements and paints one empty, absolutely positioned box per block (text, heading, container or atom), so it
 * holds no text, no element ids, no focusable element and no contenteditable. Its root is `aria-hidden`. A pointer
 * click or drag only changes the scroll position of the editor's scroll container; it never reaches a Rust owner,
 * the selection or the document, and is not a command, publication or Undo step. Keyboard users scroll the same
 * container with the editor's own caret movement and the browser's scrolling keys, which is why the minimap itself
 * is not focusable.
 */

/** Default and maximum number of block boxes painted per rebuild. */
export const RICH_MINIMAP_DEFAULT_BLOCKS=4096;
export const RICH_MINIMAP_MAX_BLOCKS=65536;
/** Minimum milliseconds between two rebuilds; scrolling only moves the indicator. */
export const RICH_MINIMAP_REBUILD_INTERVAL=100;

export interface RichMinimapOptions {
 /** Host element that receives the minimap; it must not be inside the editable surface. Give it a width and a
  * height (for example a sticky sidebar): the overview is scaled to fit inside it. */
 readonly container:HTMLElement;
 /** The element whose scroll position the minimap follows and changes. Default: the surface itself or its
  * nearest scrollable ancestor, else the document's scrolling element. */
 readonly scroller?:HTMLElement;
 /** Block boxes painted per rebuild (default 4096, at most 65536). */
 readonly maxBlocks?:number;
 /** Initial visibility (default true). */
 readonly visible?:boolean;
}
export type RichMinimapBlockKind="text"|"heading"|"container"|"table"|"image"|"rule"|"atom";
/** Internal controller used by `mountRichEditingAids`. */
export interface RichMinimapController {
 readonly element:HTMLElement;
 readonly visible:boolean;
 setVisible(on:boolean):void;
 /** Rebuild the block boxes (throttled to one rebuild per `RICH_MINIMAP_REBUILD_INTERVAL`). */
 refresh():void;
 /** Move the indicator on the next frame (scrolling). */
 track():void;
 dispose():void;
}

interface Geometry {scroller:Element;contentTop:number;contentLeft:number;contentWidth:number;contentHeight:number;viewTop:number;viewHeight:number}

/** The overview kind for one rendered block. Pure DOM reading. */
export function richMinimapBlockKind(element:Element):RichMinimapBlockKind{
 const tag=element.tagName.toLowerCase(),data=(element as HTMLElement).dataset??{};
 if(data["richText"]!==undefined)return /^h[1-6]$/.test(tag)?"heading":"text";
 if(data["richPageBreak"]!==undefined||tag==="hr")return "rule";
 if(tag==="table")return "table";
 if(tag==="figure"||tag==="img")return "image";
 if(/^(ul|ol|li|blockquote|details|summary|section|div)$/.test(tag))return "container";
 return "atom";
}

export function validateRichMinimapOptions(options:unknown,surface:HTMLElement):Required<Omit<RichMinimapOptions,"scroller">>&{scroller:HTMLElement|undefined}{
 if(options===null||typeof options!=="object")throw new TypeError("minimap must be an object with a container");
 const value=options as RichMinimapOptions,view=surface.ownerDocument.defaultView as unknown as {HTMLElement:typeof HTMLElement};
 const element=(item:unknown):item is HTMLElement=>item instanceof view.HTMLElement&&item.ownerDocument===surface.ownerDocument;
 if(!element(value.container))throw new TypeError("minimap.container must be an element in the editor document");
 if(value.container===surface||surface.contains(value.container))throw Error("The minimap container must be outside the editable surface");
 if(value.scroller!==undefined&&!element(value.scroller))throw new TypeError("minimap.scroller must be an element in the editor document");
 if(value.scroller&&!value.scroller.contains(surface))throw Error("minimap.scroller must be the surface or one of its ancestors");
 const maxBlocks=value.maxBlocks??RICH_MINIMAP_DEFAULT_BLOCKS;
 if(!Number.isInteger(maxBlocks)||maxBlocks<1||maxBlocks>RICH_MINIMAP_MAX_BLOCKS)throw new RangeError(`minimap.maxBlocks must be an integer from 1 to ${RICH_MINIMAP_MAX_BLOCKS}`);
 if(value.visible!==undefined&&typeof value.visible!=="boolean")throw new TypeError("minimap.visible must be a Boolean");
 return {container:value.container,scroller:value.scroller,maxBlocks,visible:value.visible??true};
}

/** Mount a minimap for `surface` in a validated container. Listeners share the caller's abort signal. */
export function createRichMinimap(surface:HTMLElement,options:ReturnType<typeof validateRichMinimapOptions>,signal:AbortSignal):RichMinimapController{
 const document=surface.ownerDocument,window=document.defaultView!;
 const realm=window as unknown as {ResizeObserver?:typeof ResizeObserver};
 const root=document.createElement("div");root.dataset["breditorMinimap"]="";root.setAttribute("aria-hidden","true");
 const content=document.createElement("div");content.className="breditor-minimap-content";
 const indicator=document.createElement("div");indicator.className="breditor-minimap-viewport";
 root.append(content,indicator);root.hidden=!options.visible;options.container.append(root);
 let visible=options.visible,closed=false,scale=0,built:Geometry|undefined,lastBuild=-Infinity;
 let buildFrame:number|undefined,buildTimer:number|undefined,trackFrame:number|undefined;
 let drag:{pointer:number;offset:number}|undefined;

 const scrollerFor=():Element=>{
  if(options.scroller)return options.scroller;
  for(let element:Element|null=surface;element&&element!==document.body&&element!==document.documentElement;element=element.parentElement){
   const overflow=window.getComputedStyle(element).overflowY;
   if(/^(auto|scroll|overlay)$/.test(overflow)&&element.scrollHeight>element.clientHeight)return element;
  }
  return document.scrollingElement??document.documentElement;
 };
 const measure=():Geometry=>{
  const scroller=scrollerFor(),own=scroller===surface,bounds=surface.getBoundingClientRect();
  const contentTop=bounds.top+(own?surface.clientTop-surface.scrollTop:0),contentLeft=bounds.left+(own?surface.clientLeft-surface.scrollLeft:0);
  const contentHeight=Math.max(1,own?surface.scrollHeight||bounds.height:bounds.height),contentWidth=Math.max(1,own?surface.clientWidth||bounds.width:bounds.width);
  let viewTop:number,viewHeight:number;
  if(scroller===document.scrollingElement||scroller===document.documentElement||scroller===document.body){viewTop=0;viewHeight=window.innerHeight;}
  else{const rect=scroller.getBoundingClientRect();viewTop=rect.top+scroller.clientTop;viewHeight=scroller.clientHeight||rect.height;}
  return {scroller,contentTop,contentLeft,contentWidth,contentHeight,viewTop:viewTop-contentTop,viewHeight};
 };
 const place=(element:HTMLElement,left:number,top:number,width:number,height:number):void=>{element.style.cssText=`left:${left}px;top:${top}px;width:${Math.max(1,width)}px;height:${Math.max(1,height)}px`;};
 const paintIndicator=(geometry:Geometry):void=>{
  if(!scale){indicator.hidden=true;return;}
  const top=Math.min(Math.max(geometry.viewTop,0),geometry.contentHeight),bottom=Math.min(Math.max(geometry.viewTop+geometry.viewHeight,0),geometry.contentHeight);
  indicator.hidden=false;place(indicator,0,top*scale,geometry.contentWidth*scale,Math.max(2,(bottom-top)*scale));
  indicator.dataset["viewTop"]=String(Math.round(top));indicator.dataset["viewBottom"]=String(Math.round(bottom));
 };
 const build=():void=>{
  buildFrame=undefined;if(closed)return;
  lastBuild=window.performance?.now?.()??Date.now();
  if(!visible||!surface.isConnected){content.replaceChildren();scale=0;built=undefined;indicator.hidden=true;return;}
  const geometry=measure(),width=root.clientWidth,height=root.clientHeight;
  scale=width>0&&height>0?Math.min(width/geometry.contentWidth,height/geometry.contentHeight):0;built=geometry;
  if(!scale){content.replaceChildren();indicator.hidden=true;return;}
  const fragment=document.createDocumentFragment();let count=0;
  for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]")){
   if(count>=options.maxBlocks)break;
   const rect=element.getBoundingClientRect();if(rect.width===0&&rect.height===0)continue;
   const box=document.createElement("div");box.className="breditor-minimap-block";box.dataset["minimapKind"]=richMinimapBlockKind(element);
   place(box,(rect.left-geometry.contentLeft)*scale,(rect.top-geometry.contentTop)*scale,rect.width*scale,rect.height*scale);
   fragment.append(box);count++;
  }
  content.replaceChildren(fragment);content.style.cssText=`width:${geometry.contentWidth*scale}px;height:${geometry.contentHeight*scale}px`;
  root.dataset["minimapBlocks"]=String(count);
  paintIndicator(geometry);
 };
 const refresh=():void=>{
  if(closed||buildFrame!==undefined||buildTimer!==undefined)return;
  const wait=Math.max(0,lastBuild+RICH_MINIMAP_REBUILD_INTERVAL-(window.performance?.now?.()??Date.now()));
  const frame=():void=>{buildTimer=undefined;if(!closed)buildFrame=window.requestAnimationFrame(build);};
  if(wait>0)buildTimer=window.setTimeout(frame,wait);else frame();
 };
 const track=():void=>{
  if(closed||!visible||trackFrame!==undefined)return;
  trackFrame=window.requestAnimationFrame(()=>{trackFrame=undefined;if(closed||!visible||!built)return;const geometry=measure();
   if(Math.abs(geometry.contentHeight-built.contentHeight)>0.5||Math.abs(geometry.contentWidth-built.contentWidth)>0.5)refresh();paintIndicator(geometry);});
 };
 /** Scroll so the viewport starts at content offset `top`; only the scroll container moves. */
 const scrollTo=(top:number):void=>{
  const geometry=measure(),target=Math.min(Math.max(top,0),Math.max(0,geometry.contentHeight-geometry.viewHeight));
  const delta=target-geometry.viewTop;if(Math.abs(delta)<0.5)return;
  geometry.scroller.scrollTop=geometry.scroller.scrollTop+delta;paintIndicator(measure());
 };
 const contentY=(event:MouseEvent):number=>(event.clientY-content.getBoundingClientRect().top)/scale;
 root.addEventListener("mousedown",event=>event.preventDefault(),{signal});
 root.addEventListener("pointerdown",event=>{
  // Keep focus and the selection in the editor: the minimap only scrolls.
  event.preventDefault();if(closed||!scale||!built||event.button!==0)return;
  const geometry=measure(),y=contentY(event),inside=y>=geometry.viewTop&&y<=geometry.viewTop+geometry.viewHeight;
  drag={pointer:event.pointerId,offset:inside?y-geometry.viewTop:Math.min(geometry.viewHeight,geometry.contentHeight)/2};
  try{root.setPointerCapture?.(event.pointerId);}catch{/* Synthetic or already released pointer. */}
  root.toggleAttribute("data-dragging",true);if(!inside)scrollTo(y-drag.offset);
 },{signal});
 root.addEventListener("pointermove",event=>{if(!drag||event.pointerId!==drag.pointer||!scale)return;event.preventDefault();scrollTo(contentY(event)-drag.offset);},{signal});
 const end=(event:PointerEvent):void=>{if(!drag||event.pointerId!==drag.pointer)return;drag=undefined;root.removeAttribute("data-dragging");try{root.releasePointerCapture?.(event.pointerId);}catch{/* Already released. */}};
 root.addEventListener("pointerup",end,{signal});root.addEventListener("pointercancel",end,{signal});
 const resize=realm.ResizeObserver?new realm.ResizeObserver(()=>refresh()):undefined;resize?.observe(root);
 signal.addEventListener("abort",()=>controller.dispose(),{once:true});
 const controller:RichMinimapController={
  element:root,get visible(){return visible;},
  setVisible(on){if(closed||visible===on)return;visible=on;root.hidden=!on;if(on){lastBuild=-Infinity;refresh();}else{content.replaceChildren();scale=0;built=undefined;}},
  refresh,track,
  dispose(){
   if(closed)return;closed=true;resize?.disconnect();
   if(buildFrame!==undefined)window.cancelAnimationFrame(buildFrame);if(trackFrame!==undefined)window.cancelAnimationFrame(trackFrame);if(buildTimer!==undefined)window.clearTimeout(buildTimer);
   buildFrame=trackFrame=buildTimer=undefined;root.remove();
  },
 };
 refresh();
 return controller;
}
