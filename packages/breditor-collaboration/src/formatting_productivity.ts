/**
 * Shared formatting-productivity controls: special characters, case change and the format painter.
 *
 * The same owner-agnostic specs as the local toolbar, published through existing native shared commands:
 * special characters are ordinary shared text input, case change is the guarded native
 * `change_selection_case` command and painting is one native selection-format change. Each is one
 * writer-local Undo step. See docs/FORMATTING_PRODUCTIVITY.md.
 */
import {formattingProductivityControls,type RichFormattingProductivityOptions,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {ActionContext,SharedToolbarControl} from "./actions.js";
import type {SharedSelectionPolicy} from "./types.js";

/** Toolbar controls bound to one shared owner; omit what the owner cannot do (case change, painter). */
export function createSharedFormattingProductivityToolbar<P extends SharedSelectionPolicy="original">(core:SharedRichEditor<P>,presentation:RichInlinePresentation,options:RichFormattingProductivityOptions={}):readonly SharedToolbarControl<P>[]{
 return Object.freeze(formattingProductivityControls(core,presentation,options).map(spec=>Object.freeze({id:spec.id,label:spec.label,owner:core,
  ...(spec.panel?{panel:spec.panel}:{}),...(spec.attach?{attach:spec.attach}:{}),
  read:()=>spec.read(),
  enabled:(context:ActionContext<P>)=>spec.enabled(context.model.view.selection as never,context.model.view.readOnly===true),
  run(context:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){
   if(context.core!==core)throw Error("Formatting-productivity control belongs to a different Rust owner");
   const selection=context.model.view.selection,intent=spec.intent(fields,selection as never,context.model.view.readOnly===true);
   if(!intent)return;
   if(intent.kind==="changeCase"){core.changeSelectionCase(intent.data,context.revision);return;}
   if(intent.kind==="changeFormats"){core.changeSelectionFormats(intent.changes,context.revision);return;}
   if(selection?.kind!=="text")return;
   if(selection.anchor.block===selection.focus.block&&selection.anchor.offset===selection.focus.offset)core.type(intent.text,context.revision);
   else core.replace(selection,intent.text,context.revision);
  }} satisfies SharedToolbarControl<P>)));
}
