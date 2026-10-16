import type {RichCoreEditor} from "./core.js";
import {defaultToolbar,type ToolbarControl} from "./actions.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {standardSelectionInlineControls,selectionFormatChanges} from "./standard_inline_controls.js";
/** Opt-in text/node/grid formatting. Rust owns all spans, pending state and exact history. */
export function createSelectionRichToolbarV1(core:RichCoreEditor,presentation:RichInlinePresentation):readonly ToolbarControl[]{
 const inline=standardSelectionInlineControls(core,presentation).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.shortcut?{shortcut:spec.shortcut}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",command(_context,_value,fields={}){const changes=selectionFormatChanges(spec.changes(fields));return changes.length?{kind:"changeSelectionFormats",data:{changes}}:null;}} satisfies ToolbarControl));
 return Object.freeze([...defaultToolbar.filter(c=>c.id!=="bold"),...inline]);
}
