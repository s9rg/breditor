/**
 * Shared rich V4 inline features: text-run language, `@` mentions and image links.
 *
 * Every publication is one native shared command with the local slice semantics and one Undo step:
 * `setTextLanguage` (selection formatting of `breditor/text-language`; a caret changes pending
 * formats only), `insertMention` (the `@query` trigger replaced by `@label` + one plain space) and
 * `setImageLink` (href and new window as ONE paired replicated field). Rust admits every value again;
 * JavaScript only snapshots primitive intent.
 */
import {textLanguageControls,imageLinkControls,RichSuggestionSession,requireRichMentionSuggestions,filterRichMentionSuggestions,
 type RichEditorView,type RichSelectionPolicy,type RichMention,type RichMentionKind,type RichMentionProvider,type RichMentionState,type RichMentionCancelReason,
 type RichSuggestionOptions,type RichSuggestionRun,type RichSuggestionSpec,type RichSuggestionContext} from "@breditor/experimental-rich-content";
import type {SharedRichEditor} from "./core.js";
import type {ActionContext,SharedToolbarControl} from "./actions.js";
import type {SharedSlashCommandHost} from "./slash_commands.js";
import type {RichSelection,SharedCommand,SharedDispatch,SharedEditorView,SharedSelectionPolicy} from "./types.js";

export {sharedTextLanguageInput,sharedMentionInput,sharedImageLinkInput,type SharedImageLinkIntent} from "./inline_v4_input.js";

/**
 * Stock V4 inline toolbar controls: **Language**, **Clear language**, **Image link** and
 * **Remove image link** (the local V4 controls' fields, reads and validation), each publishing one
 * native shared command bound to the owner they were built for.
 */
export function sharedInlineControlsV4<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>):readonly SharedToolbarControl<P>[]{
 if(!core.supportsInlineCommandsV4())throw Error("Shared V4 inline controls require an explicitly selected native V4 owner");
 const bound=(context:ActionContext<P>,what:string)=>{if(context.core!==core)throw Error(`${what} control belongs to a different Rust owner`);};
 const language=core.supportsTextLanguage()?textLanguageControls(core).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  read:()=>spec.read(),
  enabled:(context:ActionContext<P>)=>{const kind=spec.read().kind;return Boolean(context.model.view.selection)&&kind!=="unavailable"&&(spec.id==="text-language"||kind!=="unset");},
  run(context:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){bound(context,"Language");core.setTextLanguage(spec.language(fields).language,context.revision);}} satisfies SharedToolbarControl<P>)):[];
 const links=imageLinkControls(core).map(spec=>({id:spec.id,label:spec.label,owner:core,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  read:(context:ActionContext<P>)=>spec.read(context.model as never),
  enabled:(context:ActionContext<P>)=>spec.enabled(context.model as never),
  run(context:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){bound(context,"Image link");const intent=spec.intent(context.model as never,fields);if(intent)core.setImageLink(intent,context.revision);}} satisfies SharedToolbarControl<P>));
 return Object.freeze([...language,...links]);
}

/** One mention suggestion menu option. */
interface Option {readonly id:string;readonly label:string;readonly description?:string;readonly mention:RichMention}
/** One guarded publication: the exact `insert_mention` batch at the checked revision. */
export interface SharedMentionExecution {readonly mention:RichMention;readonly request:SharedDispatch;readonly revision:string}
export interface SharedMentionOptions extends Omit<RichSuggestionOptions<RichMention,SharedMentionExecution>,"items"|"core"> {
 items:RichMentionProvider;
 /** Pass the shared owner to refuse mounting on an owner without native V4 mentions. */
 core?:Pick<SharedRichEditor<SharedSelectionPolicy>,"supportsMentions">;
}
export interface SharedMentions {
 state():RichMentionState;
 move(delta:number):void;
 /** Replace the typed trigger by the chosen mention in one guarded shared command (one Undo step). */
 choose(index?:number):SharedMentionExecution;
 cancel(reason?:RichMentionCancelReason):void;
 dispose():void;
}
function presentationView(view:SharedEditorView<SharedSelectionPolicy>):RichEditorView<RichSelectionPolicy>{
 const document=view.format==="breditor/shared-document-view";
 if(!document&&view.format!=="breditor/shared-rich-view")throw Error("Use the explicitly selected native shared view family");
 return {...view,format:document?"breditor/rich-document-view":"breditor/rich-view"} as unknown as RichEditorView<RichSelectionPolicy>;
}
const caretAt=(block:string,offset:number):RichSelection=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
const surfaces=new WeakSet<HTMLElement>();
function spec(host:SharedSlashCommandHost):RichSuggestionSpec<Option,SharedMentionExecution>{
 return Object.freeze({
  trigger:"@",attributes:Object.freeze({root:"breditorMention",status:"mentionStatus",index:"mentionIndex",item:"mentionItem"}),idPrefix:"breditor-mention",surfaces,
  strings:Object.freeze({label:"mentionLabel",loading:"mentionLoading",countOne:"mentionCountOne",count:"mentionCount",empty:"mentionEmpty"} as const),
  messages:Object.freeze({live:"Mentions require a live document",duplicate:"This editing surface already has mentions",limits:"Expected bounded mention query and item limits",container:"Mention menus must be mounted outside the editing surface",closed:"Use an open editor for mentions",
   disposed:"Mentions are disposed",none:"No mention session is open",loading:"Mention suggestions are still loading",choose:"Choose an available mention",busy:"Mentions wait for the current editor operation",invalid:"The mention trigger is no longer valid"}),
  admit:(items:unknown):readonly Option[]=>requireRichMentionSuggestions(items).map(item=>Object.freeze({id:`${item.kind}:${item.id}`,label:item.label,...(item.description!==undefined?{description:item.description}:{}),mention:Object.freeze({kind:item.kind as RichMentionKind,id:item.id,label:item.label})})),
  filter:(items:readonly Option[],query:string)=>filterRichMentionSuggestions(items.map(option=>({...option.mention,option})),query).map(entry=>entry.option),
  enabled:(_item:Option,context:RichSuggestionContext)=>context.model.view.readOnly!==true,
  unavailable:(item:Option)=>`@${item.label} cannot be inserted here`,
  execute(item:Option,run:RichSuggestionRun):SharedMentionExecution{
   const {check,trigger}=run,block=trigger.block,mention=item.mention,revision=check.view.revision;
   // The checked trigger starts at a block start or after white space, never inside a mention, so
   // the caret lands after `@` + label + one space (UTF-16 offsets, like Rust).
   const command:SharedCommand={kind:"insert_mention",data:{anchor:{block,offset:String(trigger.start),affinity:"after"},focus:{block,offset:String(check.caret),affinity:check.affinity},mention:{kind:mention.kind,id:mention.id,label:mention.label}}};
   const request:SharedDispatch={commands:[command],selectionUpdate:{kind:"set",value:caretAt(block,trigger.start+mention.label.length+2)}};
   host.execute(request,true,revision);
   return Object.freeze({mention,request,revision});
  },
 });
}
/**
 * Mount one opt-in `@` mention menu for a borrowed shared DOM coordinator over a V4 owner. Browser
 * routing and presentation are the local typed-trigger session (trigger detection, cancellation,
 * async providers with AbortSignal, accessible listbox, catalog strings); a peer edit that
 * invalidates the trigger closes the menu. Choosing publishes ONE guarded `insert_mention`
 * dispatch at the checked revision, so one Undo restores the typed `@query`.
 */
export function mountSharedMentions(host:SharedSlashCommandHost,options:SharedMentionOptions):SharedMentions{
 if(options.core&&options.core.supportsMentions()!==true)throw Error("Use an explicitly selected matching shared V4 owner with native mentions");
 const {core:_core,...rest}=options;
 const port=Object.freeze({
  surface:host.surface,searchState:()=>host.searchState(),subscribeSearch:(listener:()=>void)=>host.subscribeSearch(listener),
  view:()=>presentationView(host.view()),
  execute:()=>{throw Error("Shared mentions publish one shared dispatch");},
  focus:()=>host.focus(),...(host.uiLocale?{uiLocale:()=>host.uiLocale!()}:{}),
 });
 return new RichSuggestionSession<Option,SharedMentionExecution>(port,rest as unknown as RichSuggestionOptions<Option,SharedMentionExecution>,spec(host)) as unknown as SharedMentions;
}
