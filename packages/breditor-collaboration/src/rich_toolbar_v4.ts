import {blockLayoutControls,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {SharedToolbarControl} from "./actions.js";
import {structuralSharedControlsForOwner} from "./structural_controls_v2.js";
import type {SharedSelectionPolicy} from "./types.js";
import {sharedV4BlockFieldControls} from "./v4_block_fields.js";
/**
 * Stock controls for an explicitly selected shared V4 owner: the V3 structural and
 * layout controls. V4 slice controls arrive with their own shared commands; until
 * then seeded or imported V4 content is edited only through these generic controls.
 */
export function createRichSharedToolbarV4<P extends SharedSelectionPolicy="original">(core:SharedRichEditor<P>,presentation:RichInlinePresentation):readonly SharedToolbarControl<P>[]{
 if(core.richLanguageVersion()!==4||!core.supportsRichLanguageV4())throw Error("Shared V4 controls require an explicitly selected V4 owner");
 const layout=blockLayoutControls(core).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",run(context,_value,fields={}){
  if(context.core!==core)throw Error("Layout toolbar belongs to a different Rust owner");const patch=spec.patch(fields);if(patch)core.changeSelectionLayout(patch,context.revision);
 }} satisfies SharedToolbarControl<P>));
 return Object.freeze([...structuralSharedControlsForOwner(core,presentation,4),...layout,...(core.supportsListNumbering()?sharedV4BlockFieldControls(core):[])]);
}
