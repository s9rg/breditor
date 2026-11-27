/**
 * Opt-in mention suggestion menus for a rich V4 owner. By default one `@` menu offers every closed
 * kind; `feeds` declares several trigger graphemes, each mapped to closed kinds and its own
 * cancellable source (`mention_feeds.ts`). Each menu reuses the shared typed-trigger session of
 * slash commands (accessible listbox, Rust-read trigger, AbortSignal-cancelled providers,
 * stale-result rejection). Choosing a suggestion publishes **one** native `insertMention` command
 * that replaces the typed `<trigger><query>` by the mention (stored text `@` + label), so a single
 * Undo restores the typed trigger.
 */
import type {RichCommandOutcome,RichSelection} from "./core.js";
import type {RichMention} from "./mention.js";
import {RichMentionMenus,requireRichMentionFeeds,type RichMentionFeed,type RichMentionMenuState,type RichMentionOption,type RichMentionProvider,type RichMentionSuggestion} from "./mention_feeds.js";
import type {RichSuggestionCancelReason,RichSuggestionHost,RichSuggestionOptions,RichSuggestionProviderRequest,RichSuggestionRun} from "./suggestion_session.js";

export {requireRichMentionSuggestions,filterRichMentionSuggestions,requireRichMentionFeeds,requireRichMentionTrigger,richSlashCommandTrigger,richDefaultMentionTrigger,type RichMentionFeed,type RichMentionProvider,type RichMentionSuggestion} from "./mention_feeds.js";
export type RichMentionHost=RichSuggestionHost;
export type RichMentionCancelReason=RichSuggestionCancelReason;
export type RichMentionProviderRequest=RichSuggestionProviderRequest;
/** Session state; `feed` is the trigger of the menu it describes (`null` before any session). */
export type RichMentionState=RichMentionMenuState;
export interface RichMentionExecution {readonly mention:RichMention;readonly outcome:RichCommandOutcome}
export interface RichMentionOptions extends Omit<RichSuggestionOptions<RichMentionSuggestion,RichMentionExecution>,"items"> {
 /** One implicit `@` feed over every closed kind. Use exactly one of `items` and `feeds`. */
 items?:RichMentionProvider;
 /** Host-declared trigger feeds (1–8, unique single-grapheme triggers, never `/`). */
 feeds?:readonly RichMentionFeed[];
 /** Query length after the trigger; longer queries end the session. Default 32, maximum 64. */
 maxQueryLength?:number;
 /** Displayed suggestion limit. Default 10, maximum 50. */
 maxItems?:number;
 /** Overrides the host catalog's mentionLabel (a feed's own `label` wins). */
 label?:string;
}
export interface RichMentions {
 state():RichMentionState;
 move(delta:number):void;
 /** Replace the typed trigger by the chosen mention in one native history group. */
 choose(index?:number):RichMentionExecution;
 cancel(reason?:RichMentionCancelReason):void;
 dispose():void;
}
function execute(item:RichMentionOption,run:RichSuggestionRun):RichMentionExecution{
 const {check,trigger,host}=run,block=trigger.block,mention=item.mention;
 const selection:Extract<RichSelection,{kind:"text"}>={kind:"text",anchor:{block,offset:String(trigger.start),affinity:"after"},focus:{block,offset:String(check.caret),affinity:check.affinity}};
 const outcome=host.execute({kind:"insertMention",data:{selection,mention}},true,check.view.revision);
 if(outcome==="queued")throw Error("The mention insertion was queued");
 return Object.freeze({mention,outcome});
}
/**
 * Mount opt-in mention menus (one per feed) for a borrowed DOM coordinator over a rich V4 owner.
 * Pass `core` to refuse mounting on an owner without native mentions.
 */
export function mountRichMentions(host:RichMentionHost,options:RichMentionOptions):RichMentions{
 if(options.core&&options.core.supportsMentions?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner with native mentions");
 const feeds=requireRichMentionFeeds(options);
 const {items:_items,feeds:_feeds,...rest}=options;
 return new RichMentionMenus<RichMentionExecution>(host,rest as Omit<RichSuggestionOptions<RichMentionOption,RichMentionExecution>,"items">,feeds,execute);
}
