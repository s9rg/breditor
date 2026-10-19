import type {RichFullscreenController} from "./fullscreen_types.js";
export interface RichFullscreenControlsOptions {enterLabel?:string;exitLabel?:string;onError?:(error:unknown)=>void}
export interface RichFullscreenControls {refresh():void;dispose():void}
const roots=new WeakSet<HTMLElement>();
/** Borrow a native controller. Removing/replacing these controls never exits fullscreen or closes an editor. */
export function mountRichFullscreenControls(root:HTMLElement,controller:RichFullscreenController,options:RichFullscreenControlsOptions={}):RichFullscreenControls {
 if(roots.has(root)||root===controller.surface||root.contains(controller.surface)||controller.surface.contains(root)||root.ownerDocument!==controller.target.ownerDocument||!controller.target.contains(root))throw Error("Fullscreen controls need an unused host inside the target and outside editable content");
 for(const label of [options.enterLabel,options.exitLabel])if(label!==undefined&&(typeof label!=="string"||!label||label.length>256))throw TypeError("Expected nonempty bounded fullscreen control labels");
 if(controller.state().disposed||controller.state().retiring)throw Error("Fullscreen controls require an active controller");
 const d=root.ownerDocument,abort=new d.defaultView!.AbortController(),button=d.createElement("button"),status=d.createElement("span"),element=d.createElement("div"),settings={...options};let disposed=false;
 element.dataset["breditorFullscreenControls"]="";button.type="button";button.dataset["fullscreenAction"]="toggle";status.setAttribute("role","status");element.append(button,status);
 const refresh=()=>{if(disposed)return;const state=controller.state(),transition=state.phase==="entering"||state.phase==="exiting";button.textContent=state.active?settings.exitLabel??"Exit fullscreen":settings.enterLabel??"Enter fullscreen";button.setAttribute("aria-pressed",String(state.active));button.disabled=state.disposed||state.retiring||transition||!state.supported||state.foreign||state.closed||!state.active&&(state.busy||state.composing);status.textContent=state.error??(state.foreign?"Another fullscreen session is active":!state.supported?"Native fullscreen unavailable":state.composing&&!state.active?"Finish composing before fullscreen":state.active?"Fullscreen":"");};
 const report=(error:unknown)=>{try{settings.onError?.(error);}catch{/* A UI reporter cannot change native/editor ownership. */}refresh();};
 button.addEventListener("pointerdown",event=>event.preventDefault(),{signal:abort.signal});button.addEventListener("click",()=>{void controller.toggle().catch(report);},{signal:abort.signal});
 const unsubscribe=controller.subscribe(refresh);try{roots.add(root);root.replaceChildren(element);refresh();}catch(error){unsubscribe();abort.abort();roots.delete(root);element.remove();throw error;}
 return {refresh,dispose(){if(disposed)return;disposed=true;abort.abort();unsubscribe();element.remove();roots.delete(root);}};
}
