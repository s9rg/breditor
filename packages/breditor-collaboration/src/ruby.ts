/**
 * Shared ruby (furigana) controls for the opt-in `breditor-ruby/ruby` typed inline extension
 * (docs/RUBY_ANNOTATIONS.md). The same DOM-free control semantics as the local editor
 * (`rubyControls`); each intent publishes the existing generic shared `set_format` commands in one
 * dispatch, which is one writer-local history group (one Undo step). Concurrent annotations of the
 * same characters converge like every valued format: per character, the highest causal stamp wins.
 */
import {rubyControls,rubyFormat,richInlinePresentationHasRuby,type RichInlinePresentation} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {ActionContext,SharedToolbarControl} from "./actions.js";
import type {SharedCommand,SharedSelectionPolicy} from "./types.js";

/** Removal literal: `set_format` with `enabled:false` needs an admitted value; removal is by kind. */
const removal=rubyFormat("ruby");
/** Owner-bound shared **Ruby** and **Remove ruby** controls; append them to a shared toolbar. */
export function sharedRubyToolbarControls<P extends SharedSelectionPolicy="original">(core:SharedRichEditor<P>,presentation:RichInlinePresentation):readonly SharedToolbarControl<P>[]{
 return rubyControls(core,richInlinePresentationHasRuby(presentation)).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  read:(context:ActionContext<P>)=>spec.read(context.model as never),
  enabled:(context:ActionContext<P>)=>spec.enabled(context.model as never),
  run(context:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){
   if(context.core!==core)throw Error("Ruby control belongs to a different Rust owner");
   const intent=spec.intent(context.model as never,fields);if(!intent)return;
   const format=intent.annotation===null?removal:rubyFormat(intent.annotation);
   const commands:SharedCommand[]=intent.targets.map(target=>({kind:"set_format" as const,data:{block:target.block,offset:Number(target.start),length:Number(target.end)-Number(target.start),format,enabled:intent.annotation!==null}}));
   core.dispatch({commands},context.revision);
  }} satisfies SharedToolbarControl<P>));
}
