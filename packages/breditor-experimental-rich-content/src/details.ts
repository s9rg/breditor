// Candidate rich V4 collapsible sections: read-only targeting and owner-bound toolbar controls.
// Rust owns grammar, identities, open state and history; this module never edits DOM.
import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import {id,property,type ElementNode,type RichPresentationModel} from "./model.js";
import {structuralIntervalV2} from "./structural_context_v2.js";

export const richDetailsKind="breditor/details";
export const richDetailsSummaryKind="breditor/details-summary";
/** Persisted document state: only `true` is stored; absence means collapsed. */
export const richDetailsOpenProperty="breditor/details-open";

/** Whether a section is expanded (persisted `details-open`). */
export function detailsOpen(node:ElementNode):boolean{return node.type===richDetailsKind&&property(node,"details-open")===true;}
/** Nearest section owning the selection: a caret/range focus, a selected node or the section itself. */
export function selectedDetails(model:RichPresentationModel):ElementNode|undefined{
 const s=model.view.selection;
 let node=s?.kind==="node"?model.nodes.get(s.block):s?.kind==="text"?model.nodes.get(s.focus.block):undefined;
 while(node){if(node.type===richDetailsKind)return node;node=model.parents.get(id(node));}
 return undefined;
}
/** Sibling blocks the Collapsible section control wraps; a range touching a summary is not wrappable. */
export function detailsInterval(model:RichPresentationModel):{first:string;last:string}|undefined{
 const range=structuralIntervalV2(model);
 return range&&range.nodes.every(node=>node.type!==richDetailsSummaryKind)?{first:range.first,last:range.last}:undefined;
}
type DetailsOwner={richLanguageVersion?():number;supportsDetails?():boolean};
/**
 * V4 controls: **Collapsible section** wraps the selected sibling blocks (or the block holding the
 * caret, which makes an empty paragraph an empty section) as the open body of a new section with
 * an empty summary; **Remove collapsible section** lifts the nearest section (its summary becomes a
 * paragraph); **Expand/Collapse section** toggles the persisted open state, which is the only way
 * a section opens or closes while editing (clicking a summary never toggles natively).
 */
export function detailsToolbarControls<P extends RichSelectionPolicy>(core:RichCoreEditor<P>&DetailsOwner):readonly ToolbarControl<P>[]{
 if(core.richLanguageVersion?.()!==4||core.supportsDetails?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const bound=(c:ActionContext<P>):void=>{if(c.core!==core)throw Error("Collapsible section control belongs to a different Rust owner");};
 return Object.freeze([
  {id:"details",label:"Collapsible section",owner:core,enabled:c=>detailsInterval(c.model)!==undefined,
   command:c=>{bound(c);const r=detailsInterval(c.model);return r?{kind:"wrapDetails",data:{first:r.first,last:r.last,wrapper:c.allocate("details"),summary:c.allocate("summary"),open:true}}:null;}},
  {id:"undetails",label:"Remove collapsible section",owner:core,enabled:c=>selectedDetails(c.model)!==undefined,
   command:c=>{bound(c);const n=selectedDetails(c.model);return n?{kind:"unwrapDetails",data:{wrapper:id(n)}}:null;}},
  {id:"details-open",label:"Expand/Collapse section",owner:core,enabled:c=>selectedDetails(c.model)!==undefined,
   read:c=>{const n=selectedDetails(c.model);return n?{kind:"uniform",pressed:detailsOpen(n)}:{kind:"unavailable"};},
   command:c=>{bound(c);const n=selectedDetails(c.model);return n?{kind:"setDetailsOpen",data:{block:id(n),open:!detailsOpen(n)}}:null;}},
 ] satisfies ToolbarControl<P>[]);
}
