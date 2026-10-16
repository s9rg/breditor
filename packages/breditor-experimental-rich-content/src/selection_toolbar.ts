import type {RichCoreEditor,RichSelectionPolicy} from "./core.js";
import {defaultToolbarFor,type ToolbarControl} from "./actions.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {standardSelectionInlineControls,selectionFormatChanges} from "./standard_inline_controls.js";
/** Opt-in text/node/grid formatting. Rust owns all spans, pending state and exact history. */
export function createSelectionRichToolbarV1<P extends RichSelectionPolicy="original">(core:RichCoreEditor<P>,presentation:RichInlinePresentation):readonly ToolbarControl<P>[]{
 const inline=standardSelectionInlineControls(core,presentation).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.shortcut?{shortcut:spec.shortcut}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",command(_context,_value,fields={}){const changes=selectionFormatChanges(spec.changes(fields));return changes.length?{kind:"changeSelectionFormats",data:{changes}}:null;}} satisfies ToolbarControl<P>));
 return Object.freeze([...defaultToolbarFor<P>().filter(c=>c.id!=="bold"),...inline]);
}
