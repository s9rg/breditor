/** Native eligibility drives an immutable prompt outside editable/clipboard content. */
interface PlaceholderCore {view():{revision:string};supportsPlaceholder?():boolean;placeholderEmpty?(revision?:string):boolean}
export function validatePlaceholderOption(value:unknown):asserts value is string|undefined {
 if(value===undefined)return;
 if(typeof value!=="string"||value.length===0||value.length>1024||new TextEncoder().encode(value).byteLength>1024||[...value].some(s=>{const c=s.codePointAt(0)!;return c>=0xd800&&c<=0xdfff;}))throw new TypeError("Expected a nonempty well-formed placeholder within 1024 UTF-8 bytes");
}
/** Admission completes before touching the host; older default editors remain usable. */
export function prepareRichPlaceholder(value:unknown,core:PlaceholderCore):{label:string;empty:boolean}|undefined {
 validatePlaceholderOption(value);if(value===undefined)return;
 if(core.supportsPlaceholder?.()!==true||typeof core.placeholderEmpty!=="function")throw Error("Use complete matching native placeholder reads");
 const empty=core.placeholderEmpty(core.view().revision);if(typeof empty!=="boolean")throw Error("Invalid native placeholder eligibility");return{label:value,empty};
}
/** @internal Owns a wrapper and literal aria-hidden sibling, never editable children. */
export class RichPlaceholderPresentation {
 readonly container:HTMLDivElement;readonly #surface:HTMLElement;readonly #hint:HTMLDivElement;readonly #abort:AbortController;
 #observer:ResizeObserver|undefined;#block:HTMLElement|undefined;#visible=false;#eligible=false;#label:string|null;#disposed=false;#active=false;
 constructor(surface:HTMLElement,label:string){
  const d=surface.ownerDocument,w=d.defaultView!;this.#surface=surface;this.#label=label;this.#abort=new w.AbortController();
  this.container=d.createElement("div");this.container.dataset["breditorPlaceholderHost"]="";
  this.#hint=d.createElement("div");this.#hint.dataset["breditorPlaceholder"]="";this.#hint.setAttribute("aria-hidden","true");this.#hint.hidden=true;this.#hint.textContent=label;
  surface.setAttribute("aria-placeholder",label);this.container.append(surface,this.#hint);
 }
 /** Activate only after the owning DOM constructor has successfully bound its controls. */
 activate():void{if(this.#disposed||this.#active)return;this.#active=true;const w=this.#surface.ownerDocument.defaultView!;this.#observer=typeof w.ResizeObserver==="function"?new w.ResizeObserver(()=>this.#position()):undefined;this.#observer?.observe(this.#surface);if(this.#block)this.#observer?.observe(this.#block);w.addEventListener("resize",()=>this.#position(),{signal:this.#abort.signal});this.#position();}
 #position():void {
  if(this.#disposed||!this.#visible)return;const block=this.#surface.querySelector<HTMLElement>("[data-rich-text]");if(!block){this.#hint.hidden=true;return;}
  if(this.#block!==block){if(this.#block)this.#observer?.unobserve(this.#block);this.#block=block;this.#observer?.observe(block);}
  const anchor=block.getBoundingClientRect(),frame=this.container.getBoundingClientRect(),style=this.#surface.ownerDocument.defaultView!.getComputedStyle(block);
  this.#hint.style.left=`${anchor.left-frame.left+this.container.scrollLeft}px`;this.#hint.style.top=`${anchor.top-frame.top+this.container.scrollTop}px`;this.#hint.style.width=`${anchor.width}px`;
  this.#hint.style.maxHeight=`${Math.max(0,frame.bottom-anchor.top)}px`;
  this.#hint.style.fontFamily=style.fontFamily;this.#hint.style.fontSize=style.fontSize;this.#hint.style.fontWeight=style.fontWeight;this.#hint.style.fontStyle=style.fontStyle;this.#hint.style.lineHeight=style.lineHeight;this.#hint.style.letterSpacing=style.letterSpacing;this.#hint.style.textAlign=style.textAlign;this.#hint.style.direction=style.direction;
 }
 /** Replace or hide presentation only; neither wrapper identity nor native owner changes. */
 setLabel(label:string|null):void{if(this.#disposed)throw Error("Placeholder presentation is disposed");if(label!==null){validatePlaceholderOption(label);if(typeof label!=="string")throw new TypeError("Use a placeholder string or null to hide it");}this.#label=label;this.#hint.textContent=label??"";if(label===null)this.#surface.removeAttribute("aria-placeholder");else this.#surface.setAttribute("aria-placeholder",label);this.update(this.#eligible);}
 update(eligible:boolean):void {if(this.#disposed)return;this.#eligible=eligible;const visible=eligible&&this.#label!==null;this.#visible=visible;this.#hint.hidden=!visible;if(visible)this.#position();else{if(this.#block)this.#observer?.unobserve(this.#block);this.#block=undefined;}}
 dispose():void {if(this.#disposed)return;this.#disposed=true;this.#block=undefined;this.#observer?.disconnect();this.#abort.abort();this.#hint.remove();this.#surface.removeAttribute("aria-placeholder");}
}
export const richPlaceholderStyles=`[data-breditor-placeholder-host]{position:relative;min-width:0}[data-breditor-placeholder]{position:absolute;margin:0;pointer-events:none;user-select:none;color:#66766f;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden}[data-breditor-placeholder][hidden]{display:none!important}`;
