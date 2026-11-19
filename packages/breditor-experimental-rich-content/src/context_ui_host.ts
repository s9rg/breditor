/** @internal Coordinator-side lease for borrowed toolbar widgets. No command, selection or state is copied. */
import type {RichControlView} from "./toolbar_control_view.js";
import type {RichContextControlView,RichContextSelectionKind} from "./context_ui_types.js";
type AnySelection={kind:string;anchor?:unknown;focus?:unknown}|null|undefined;
export function contextSelectionKind(selection:AnySelection):RichContextSelectionKind{
 if(!selection)return "none";
 if(selection.kind==="text"){const s=selection as {anchor:{block:string;offset:string};focus:{block:string;offset:string}};return s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset?"caret":"text";}
 return selection.kind==="node"||selection.kind==="grid"||selection.kind==="document"?selection.kind:"none";
}
export interface BorrowedControl<T,C> {readonly control:T;readonly view:RichControlView<C>}
export function borrowContextControl<T,C>(o:{
 surface:HTMLElement;editor:AbortSignal;container:HTMLElement;signal:AbortSignal;control:T;borrowed:Set<BorrowedControl<T,C>>;
 mount:(signal:AbortSignal)=>RichControlView<C>;boundary:()=>void;refresh:(entry:BorrowedControl<T,C>)=>void;
}):RichContextControlView{
 const {surface,container,signal}=o;
 if(signal.aborted||o.editor.aborted)throw Error("Context control lease is already closed");
 if(container.ownerDocument!==surface.ownerDocument||container===surface||surface.contains(container)||container.contains(surface))throw Error("Context controls need a host outside editable content in the editor document");
 const abort=new AbortController(),stop=()=>abort.abort();
 o.editor.addEventListener("abort",stop,{signal:abort.signal});signal.addEventListener("abort",stop,{signal:abort.signal});
 const view=o.mount(abort.signal),element=view.button.parentElement as HTMLElement,entry:BorrowedControl<T,C>={control:o.control,view};
 element.addEventListener("pointerdown",o.boundary,{capture:true,signal:abort.signal});element.addEventListener("focusin",o.boundary,{capture:true,signal:abort.signal});
 o.borrowed.add(entry);abort.signal.addEventListener("abort",()=>{o.borrowed.delete(entry);element.remove();},{once:true});
 o.refresh(entry);
 return Object.freeze({id:view.control.id,element,button:view.button,activate:()=>{if(!abort.signal.aborted)view.activate();}});
}
