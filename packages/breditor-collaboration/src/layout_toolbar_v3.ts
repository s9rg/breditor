import {blockLayoutControls,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {SharedToolbarControl} from "./actions.js";
import {structuralSharedControlsForOwner} from "./structural_controls_v2.js";
/** Same native field/state presentation; shared ownership remains entirely in Rust. */
export function createLayoutSharedToolbarV3(core:SharedRichEditor,presentation:RichInlinePresentation):readonly SharedToolbarControl[]{
 const layout=blockLayoutControls(core).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",run(context,_value,fields={}){
  if(context.core!==core)throw Error("Layout toolbar belongs to a different Rust owner");const patch=spec.patch(fields);if(patch)core.changeSelectionLayout(patch,context.revision);
 }} satisfies SharedToolbarControl));
 return Object.freeze([...structuralSharedControlsForOwner(core,presentation,3),...layout]);
}
