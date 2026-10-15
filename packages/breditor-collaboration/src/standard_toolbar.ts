import {standardInlineControls,pendingStandardFormats,standardRemovalLiteral,textTargets,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import {defaultSharedToolbar,moveSharedToolbar} from "./toolbar.js";
import type {SharedToolbarControl} from "./actions.js";
import type {SharedCommand} from "./types.js";
/** Same control/state semantics; shared lowering authors one existing atomic dispatch. */
export function createStandardSharedToolbarV1(core:SharedRichEditor,presentation:RichInlinePresentation):readonly SharedToolbarControl[]{
 const inline=standardInlineControls(core,presentation).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.shortcut?{shortcut:spec.shortcut}:{}),read:()=>spec.read(),enabled:()=>spec.read().kind!=="unavailable",run(context,_value,fields={}){
  if(context.core!==core)throw Error("Standard toolbar belongs to a different Rust owner");
  const s=context.model.view.selection;if(s?.kind!=="text")return;const changes=spec.changes(fields);if(!changes.length)return;
  if(s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset){core.setPendingFormats(pendingStandardFormats(core,changes),context.revision);return;}
  const targets=textTargets(context.model);if(!targets.length)return;
  // Retain the original shared command protocol. Removes precede sets, including
  // script switches; one dispatch is one selective-history group.
  const ordered=[...changes.filter(c=>c.kind==="remove"),...changes.filter(c=>c.kind==="set")];
  const commands:SharedCommand[]=ordered.flatMap(change=>targets.map(target=>({kind:"set_format" as const,data:{block:target.block,offset:Number(target.start),length:Number(target.end)-Number(target.start),format:change.kind==="set"?change.format:standardRemovalLiteral(change.format),enabled:change.kind==="set"}})));
  core.dispatch({commands},context.revision);
 }} satisfies SharedToolbarControl));
 return Object.freeze([...defaultSharedToolbar.filter(control=>control.id!=="bold"),...moveSharedToolbar,...inline]);
}
