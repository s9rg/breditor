/**
 * Shared rich V4 inline features: text-run language, mentions (`@` or host-declared trigger feeds) and image links.
 *
 * Every publication is one native shared command with the local slice semantics and one Undo step:
 * `setTextLanguage` (selection formatting of `breditor/text-language`; a caret changes pending
 * formats only), `insertMention` (the typed `<trigger><query>` replaced by the stored `@label` + one plain space) and
 * `setImageLink` (href and new window as ONE paired replicated field). Rust admits every value again;
 * JavaScript only snapshots primitive intent.
 */
import {textLanguageControls,imageLinkControls,RichMentionMenus,requireRichMentionFeeds,
 type RichEditorView,type RichSelectionPolicy,type RichMention,type RichMentionFeed,type RichMentionOption,type RichMentionProvider,type RichMentionState,type RichMentionCancelReason,
 type RichSuggestionOptions,type RichSuggestionRun} from "@breditor/experimental-rich-content";
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

/** One guarded publication: the exact `insert_mention` batch at the checked revision. */
export interface SharedMentionExecution {readonly mention:RichMention;readonly request:SharedDispatch;readonly revision:string}
export interface SharedMentionOptions extends Omit<RichSuggestionOptions<RichMention,SharedMentionExecution>,"items"|"core"> {
 /** One implicit `@` feed over every closed kind. Use exactly one of `items` and `feeds`. */
 items?:RichMentionProvider;
 /** Host-declared trigger feeds (1–8, unique single-grapheme triggers, never `/`), as locally. */
 feeds?:readonly RichMentionFeed[];
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
function execute(host:SharedSlashCommandHost){
 return (item:RichMentionOption,run:RichSuggestionRun):SharedMentionExecution=>{
  const {check,trigger}=run,block=trigger.block,mention=item.mention,revision=check.view.revision;
  // The checked trigger starts at a block start or after white space, never inside a mention, so
  // the caret lands after the stored `@` + label + one space (UTF-16 offsets, like Rust), whatever
  // trigger grapheme was typed.
  const command:SharedCommand={kind:"insert_mention",data:{anchor:{block,offset:String(trigger.start),affinity:"after"},focus:{block,offset:String(check.caret),affinity:check.affinity},mention:{kind:mention.kind,id:mention.id,label:mention.label}}};
  const request:SharedDispatch={commands:[command],selectionUpdate:{kind:"set",value:caretAt(block,trigger.start+mention.label.length+2)}};
  host.execute(request,true,revision);
  return Object.freeze({mention,request,revision});
 };
}
/**
 * Mount opt-in mention menus (one `@` menu, or one per host-declared feed) for a borrowed shared DOM
 * coordinator over a V4 owner. Browser routing and presentation are the local typed-trigger session
 * (trigger detection, cancellation, async providers with AbortSignal, accessible listbox, catalog
 * strings); a peer edit that invalidates the trigger closes the menu. Choosing publishes ONE guarded
 * `insert_mention` dispatch at the checked revision, so one Undo restores the typed trigger and query.
 */
export function mountSharedMentions(host:SharedSlashCommandHost,options:SharedMentionOptions):SharedMentions{
 if(options.core&&options.core.supportsMentions()!==true)throw Error("Use an explicitly selected matching shared V4 owner with native mentions");
 const feeds=requireRichMentionFeeds(options);
 const {core:_core,items:_items,feeds:_feeds,...rest}=options;
 const port=Object.freeze({
  surface:host.surface,searchState:()=>host.searchState(),subscribeSearch:(listener:()=>void)=>host.subscribeSearch(listener),
  view:()=>presentationView(host.view()),
  execute:()=>{throw Error("Shared mentions publish one shared dispatch");},
  focus:()=>host.focus(),...(host.uiLocale?{uiLocale:()=>host.uiLocale!()}:{}),
 });
 return new RichMentionMenus<SharedMentionExecution>(port,rest as unknown as Omit<RichSuggestionOptions<RichMentionOption,SharedMentionExecution>,"items">,feeds,execute(host));
}
