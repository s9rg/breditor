import {standardSelectionInlineControls,selectionFormatChanges,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {SharedToolbarControl} from "./actions.js";
import {defaultSharedToolbar,moveSharedToolbar} from "./toolbar.js";
/** Native text/node/grid formatting without browser-chosen intervals or pending maps. */
export function createSelectionSharedToolbarV1(core:SharedRichEditor,presentation:RichInlinePresentation):readonly SharedToolbarControl[]{
 const inline=standardSelectionInlineControls(core,presentation).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.shortcut?{shortcut:spec.shortcut}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",run(context,_value,fields={}){if(context.core!==core)throw Error("Selection toolbar belongs to a different Rust owner");const changes=selectionFormatChanges(spec.changes(fields));if(changes.length)core.changeSelectionFormats(changes,context.revision);}} satisfies SharedToolbarControl));
 return Object.freeze([...defaultSharedToolbar.filter(c=>c.id!=="bold"),...moveSharedToolbar,...inline]);
}
