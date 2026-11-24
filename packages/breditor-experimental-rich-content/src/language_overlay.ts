/**
 * Read-only issue highlights painted outside the canonical editing DOM, using the search decoration approach
 * (transient DOM ranges measured from block id + UTF-16 offsets, fixed-position markers in a separate layer).
 * Nothing is inserted into, wrapped around or styled inside the editable surface.
 */
import {endpoint,placeViewportOverlay} from "./search_overlay.js";
import type {RichAiHostState} from "./ai_tools_host.js";
export interface RichAiHighlight {readonly key:string;readonly block:string;readonly start:number;readonly end:number;readonly active:boolean}
const paintLimit=8192;
export class RichAiHighlightOverlay {
 readonly element:HTMLDivElement;
 readonly #surface:HTMLElement;readonly #state:()=>RichAiHostState;readonly #window:Window;readonly #abort:AbortController;
 readonly #resize:ResizeObserver|undefined;readonly #mutation:MutationObserver|undefined;
 #highlights:readonly RichAiHighlight[]=[];#frame:number|undefined;#closed=false;
 constructor(surface:HTMLElement,state:()=>RichAiHostState){
  this.#surface=surface;this.#state=state;const document=surface.ownerDocument,window=document.defaultView;if(!window)throw Error("Issue highlights require a live document");this.#window=window;
  const realm=window as unknown as {AbortController:typeof AbortController;ResizeObserver?:typeof ResizeObserver;MutationObserver?:typeof MutationObserver};this.#abort=new realm.AbortController();
  this.element=document.createElement("div");this.element.dataset["languageOverlay"]="";this.element.setAttribute("aria-hidden","true");this.element.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:10;overflow:hidden";placeViewportOverlay(surface,this.element);
  this.#resize=realm.ResizeObserver?new realm.ResizeObserver(()=>this.refresh()):undefined;this.#resize?.observe(surface);
  this.#mutation=realm.MutationObserver?new realm.MutationObserver(()=>this.refresh()):undefined;this.#mutation?.observe(surface,{childList:true,subtree:true,characterData:true,attributes:true});
  window.addEventListener("scroll",()=>this.refresh(),{signal:this.#abort.signal,capture:true});window.addEventListener("resize",()=>this.refresh(),{signal:this.#abort.signal});
  document.addEventListener("fullscreenchange",()=>{placeViewportOverlay(surface,this.element);this.refresh();},{signal:this.#abort.signal});
 }
 /** Replace the painted set. The caller supplies only issues it has already verified against the current text. */
 set(highlights:readonly RichAiHighlight[]):void{this.#highlights=highlights;if(!highlights.length)this.element.replaceChildren();else this.refresh();}
 refresh():void{if(this.#closed||this.#frame!==undefined)return;this.#frame=this.#window.requestAnimationFrame(()=>{this.#frame=undefined;this.#paint();});}
 #paint():void{
  if(this.#closed)return;const surface=this.#surface,state=this.#state();
  if(!this.#highlights.length||state.closed||state.busy||state.composing||!surface.isConnected){this.element.replaceChildren();return;}
  const document=surface.ownerDocument,fragment=document.createDocumentFragment();let count=0;
  try{
   const blocks=new Map([...surface.querySelectorAll<HTMLElement>("[data-rich-text]")].map(node=>[node.dataset["richText"],node])),bounds=surface.getBoundingClientRect();
   const ordered=[...this.#highlights].sort((a,b)=>Number(a.active)-Number(b.active));
   outer:for(const item of ordered){
    const block=blocks.get(item.block);if(!block)continue;const a=endpoint(block,String(item.start)),b=endpoint(block,String(item.end));if(!a||!b)continue;
    const range=document.createRange();range.setStart(...a);range.setEnd(...b);if(typeof range.getClientRects!=="function")continue;
    const rects=[...range.getClientRects()];if(!rects.length&&item.start===item.end)rects.push(block.getBoundingClientRect());
    for(const rect of rects){
     const left=Math.max(0,bounds.left,rect.left),top=Math.max(0,bounds.top,rect.top),right=Math.min(this.#window.innerWidth,bounds.right,rect.left+(item.start===item.end?2:rect.width)),bottom=Math.min(this.#window.innerHeight,bounds.bottom,rect.bottom);
     if(right<=left||bottom<=top)continue;if(count===paintLimit)break outer;
     const marker=document.createElement("div");marker.dataset["languageHighlight"]=item.key;marker.dataset["languageActive"]=String(item.active);
     marker.style.cssText=`position:absolute;box-sizing:border-box;left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px;border-bottom:2px dotted #c62828;${item.active?"background:#c6282822;outline:1px solid #c62828;":""}`;
     fragment.append(marker);count++;
    }
   }
  }catch{this.element.replaceChildren();return;}
  this.element.replaceChildren(fragment);
 }
 dispose():void{if(this.#closed)return;this.#closed=true;this.#highlights=[];this.#abort.abort();this.#resize?.disconnect();this.#mutation?.disconnect();if(this.#frame!==undefined)this.#window.cancelAnimationFrame(this.#frame);this.element.remove();}
}
