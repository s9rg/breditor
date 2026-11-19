import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {ToolbarControl} from "./actions.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {blockLayoutControls} from "./block_layout_controls.js";
import {structuralRichControlsForOwner} from "./structural_controls_v2.js";
/** Owner-bound layout fields shared by the V3 toolbar and the candidate V4 toolbar. */
export function layoutToolbarControls<P extends RichSelectionPolicy="original">(core:RichCoreEditor<P>):ToolbarControl<P>[]{
 return blockLayoutControls(core).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",command(context,_value,fields={}){
  if(context.core!==core)throw Error("Layout toolbar belongs to a different Rust owner");const data=spec.patch(fields);return data?{kind:"changeSelectionLayout",data}:null;
 }} satisfies ToolbarControl<P>));
}
/** Expandable owner-bound V3 toolbar: every layout field retains independent Keep/Set/Clear. */
export function createLayoutRichToolbarV3<P extends RichSelectionPolicy="original">(core:RichCoreEditor<P>,presentation:RichInlinePresentation):readonly ToolbarControl<P>[]{
 return Object.freeze([...structuralRichControlsForOwner(core,presentation,3),...layoutToolbarControls(core)]);
}
