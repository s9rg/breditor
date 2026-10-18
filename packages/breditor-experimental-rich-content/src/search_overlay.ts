/** Read-only paint outside the canonical editing DOM. Missing layout never changes search semantics. */
import type {RichSearchResults} from "./core.js";
import type {RichSearchHost} from "./search_host.js";
const paintLimit=8192;
function endpoint(block:HTMLElement,offset:string):[Node,number]|null{
 let left=Number(offset);if(!Number.isSafeInteger(left)||left<0)return null;
 const walker=block.ownerDocument.createTreeWalker(block,4);let node=walker.nextNode();
 while(node){const size=node.textContent?.length??0;if(left<=size)return[node,left];left-=size;node=walker.nextNode();}
 return left===0?[block,0]:null;
}
/** Decorations are a bounded viewport paint, not a truncated result set or an editing planner. */
export class RichSearchOverlay<R extends RichSearchResults=RichSearchResults> {
 readonly element:HTMLDivElement;
 readonly #host:RichSearchHost<R>;readonly #window:Window;readonly #abort:AbortController;
 readonly #resize:ResizeObserver|undefined;readonly #mutation:MutationObserver|undefined;
 readonly #onPaint:((clipped:boolean)=>void)|undefined;
 #results:R|undefined;#active:string|null=null;#frame:number|undefined;#closed=false;#clipped=false;
 constructor(host:RichSearchHost<R>,onPaint?:(clipped:boolean)=>void){
  this.#host=host;this.#onPaint=onPaint;const document=host.surface.ownerDocument,window=document.defaultView;if(!window)throw Error("Search decorations require a live document");this.#window=window;
  const realm=window as unknown as {AbortController:typeof AbortController;ResizeObserver?:typeof ResizeObserver;MutationObserver?:typeof MutationObserver};this.#abort=new realm.AbortController();
  this.element=document.createElement("div");this.element.dataset["richSearchOverlay"]="";this.element.setAttribute("aria-hidden","true");this.element.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:10;overflow:hidden";document.body.append(this.element);
  this.#resize=realm.ResizeObserver?new realm.ResizeObserver(()=>this.refresh()):undefined;this.#resize?.observe(host.surface);
  this.#mutation=realm.MutationObserver?new realm.MutationObserver(()=>this.refresh()):undefined;this.#mutation?.observe(host.surface,{childList:true,subtree:true,characterData:true,attributes:true});
  window.addEventListener("scroll",()=>this.refresh(),{signal:this.#abort.signal,capture:true});window.addEventListener("resize",()=>this.refresh(),{signal:this.#abort.signal});
 }
 set(results:R|undefined,active:string|null):void{this.#results=results;this.#active=active;if(!results)this.#clear();else this.refresh();}
 refresh():void{if(this.#closed||this.#frame!==undefined)return;this.#frame=this.#window.requestAnimationFrame(()=>{this.#frame=undefined;this.#paint();});}
 #clear():void{this.element.replaceChildren();if(this.#clipped){this.#clipped=false;this.#onPaint?.(false);}}
 #paint():void{
  if(this.#closed)return;const results=this.#results,surface=this.#host.surface,state=this.#host.searchState();
  if(!results||state.closed||state.composing||state.busy||!surface.isConnected){this.#clear();return;}
  const fragment=surface.ownerDocument.createDocumentFragment();let count=0,clipped=false;
  try{
   this.#host.checkSearchResults(results,state.revision);const metadata=results.metadata(),blocks=new Map([...surface.querySelectorAll<HTMLElement>("[data-rich-text]")].map(node=>[node.dataset["richText"],node])),bounds=surface.getBoundingClientRect();
   const indices=metadata.matches.map((_m,index)=>String(index));if(this.#active!==null&&indices.includes(this.#active)){indices.splice(indices.indexOf(this.#active),1);indices.unshift(this.#active);}
   outer:for(const index of indices){const match=metadata.matches[Number(index)];if(!match)continue;const block=blocks.get(match.block);if(!block)continue;const a=endpoint(block,match.start),b=endpoint(block,match.end);if(!a||!b)continue;
    const range=surface.ownerDocument.createRange();range.setStart(...a);range.setEnd(...b);if(typeof range.getClientRects!=="function")continue;
    const rects=[...range.getClientRects()];if(!rects.length&&match.start===match.end)rects.push(block.getBoundingClientRect());
    for(const rect of rects){const left=Math.max(0,bounds.left,rect.left),top=Math.max(0,bounds.top,rect.top),right=Math.min(this.#window.innerWidth,bounds.right,rect.left+(match.start===match.end?2:rect.width)),bottom=Math.min(this.#window.innerHeight,bounds.bottom,rect.bottom);if(right<=left||bottom<=top)continue;
     if(count===paintLimit){clipped=true;break outer;}const marker=surface.ownerDocument.createElement("div");marker.dataset["searchIndex"]=index;marker.dataset["searchActive"]=String(index===this.#active);marker.style.cssText=`position:absolute;box-sizing:border-box;left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px;background:${index===this.#active?"#ffb74d77":"#ffe08255"};${index===this.#active?"border:1px solid #a85a00;":""}`;fragment.append(marker);count++;
    }
   }
  }catch{this.#clear();return;}
  this.element.replaceChildren(fragment);if(clipped!==this.#clipped){this.#clipped=clipped;this.#onPaint?.(clipped);}
 }
 dispose():void{if(this.#closed)return;this.#closed=true;this.#results=undefined;this.#abort.abort();this.#resize?.disconnect();this.#mutation?.disconnect();if(this.#frame!==undefined)this.#window.cancelAnimationFrame(this.#frame);this.element.remove();}
}
