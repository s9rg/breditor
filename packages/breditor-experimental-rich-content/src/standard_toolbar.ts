import type {RichCoreEditor,RichCommand,RichSelectionPolicy} from "./core.js";
import {defaultToolbarFor,type ToolbarControl} from "./actions.js";
import {textTargets} from "./model.js";
import type {RichInlinePresentation} from "./inline_presentation.js";
import {standardInlineControls,pendingStandardFormats} from "./standard_inline_controls.js";
/** Complete opt-in inline controls plus the existing structural controls; freely filter/reorder. */
export function createStandardRichToolbarV1<P extends RichSelectionPolicy="original">(core:RichCoreEditor<P>,presentation:RichInlinePresentation):readonly ToolbarControl<P>[]{
 const inline=standardInlineControls(core,presentation).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.shortcut?{shortcut:spec.shortcut}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",command(context,_value,fields={}){
  const s=context.model.view.selection;if(s?.kind!=="text")return null;const changes=spec.changes(fields);if(!changes.length)return null;
  if(s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset)return {kind:"setPendingFormats",formats:pendingStandardFormats(core,changes)};
  const targets=textTargets(context.model);if(!targets.length)return null;
  return {kind:"changeInlineFormats",data:{targets,changes:changes.map(change=>change.kind==="remove"?change:{kind:change.kind,formatsJson:JSON.stringify([change.format]),...(change.kind==="patch"?{properties:change.properties}:{})})}} as RichCommand;
 }} satisfies ToolbarControl<P>));
 return Object.freeze([...defaultToolbarFor<P>().filter(control=>control.id!=="bold"),...inline]);
}
