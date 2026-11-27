/**
 * Host-declared V4 mention feeds: several trigger graphemes over the frozen mention model.
 *
 * A feed maps one trigger (for example `@` to people and pages, `#` to tags) to a non-empty subset
 * of the closed kinds `user`, `page` and `tag` and to its own suggestion source. Feeds are validated
 * once at mount: each trigger is exactly one grapheme without white space or control/separator
 * characters, triggers are unique and none is the slash-command trigger `/`. Each feed runs its own
 * typed-trigger session (`suggestion_session.ts`): accessible listbox, Rust-read trigger,
 * AbortSignal-cancelled provider and stale-result rejection.
 *
 * Feeds change browser routing only. The stored grammar is unchanged: whatever trigger was typed,
 * choosing a suggestion publishes the existing guarded `insertMention` (local) or `insert_mention`
 * (shared) command over the typed `<trigger><query>` range, which stores the exact V4 text `@` +
 * label in one Undo step. A provider may only offer the kinds its feed declares.
 */
import {isRichMentionId,isRichMentionKind,isRichMentionLabel,richMentionKinds,type RichMention,type RichMentionKind} from "./mention.js";
import {RichSuggestionSession,type RichSuggestionCancelReason,type RichSuggestionContext,type RichSuggestionHost,type RichSuggestionOptions,type RichSuggestionProviderRequest,type RichSuggestionRun,type RichSuggestionSpec,type RichSuggestionState} from "./suggestion_session.js";

/** One host entity offered by a menu. `label` (without `@`) is stored as the mention's snapshot. */
export interface RichMentionSuggestion {
 readonly kind:RichMentionKind;readonly id:string;readonly label:string;
 /** Secondary menu text only (for example an email or a page path); never stored. */
 readonly description?:string;
}
/** Synchronous list (filtered locally) or a cancellable provider. Aborted/stale results are discarded. */
export type RichMentionProvider=readonly RichMentionSuggestion[]|((query:string,request:RichSuggestionProviderRequest)=>readonly RichMentionSuggestion[]|Promise<readonly RichMentionSuggestion[]>);
/** One host-declared trigger and its own suggestion source. */
export interface RichMentionFeed {
 /** Exactly one grapheme, typed at a block start or after white space. Not `/`, not white space. */
 readonly trigger:string;
 /** Closed kinds this feed may insert (non-empty, unique). Suggestions of another kind are refused. */
 readonly kinds:readonly RichMentionKind[];
 readonly items:RichMentionProvider;
 /** Accessible name of this feed's listbox (default: the `label` option or catalog `mentionLabel`). */
 readonly label?:string;
}
/** The trigger of slash commands; a mention feed can never use it. */
export const richSlashCommandTrigger="/";
/** The trigger of the implicit feed built from the plain `items` option. */
export const richDefaultMentionTrigger="@";
const maxFeeds=8;
// White space, controls, surrogates, private use and separators. ZWJ (U+200D) is admitted inside emoji sequences only.
const refusedScalar=/[\p{White_Space}\p{Cc}\p{Cs}\p{Co}\p{Z}]|(?!\u200D)\p{Cf}/u;
function graphemeCount(value:string):number{
 const Segmenter=(Intl as unknown as {Segmenter?:new(locale?:string,options?:{granularity:"grapheme"})=>{segment(input:string):Iterable<unknown>}}).Segmenter;
 if(Segmenter){let count=0;for(const _ of new Segmenter(undefined,{granularity:"grapheme"}).segment(value))count++;return count;}
 return [...value].length;
}
/** Admit one trigger: exactly one grapheme (at most 32 UTF-16 units) without white space or controls. */
export function requireRichMentionTrigger(value:unknown):string{
 if(typeof value!=="string"||!value||value.length>32||refusedScalar.test(value)||graphemeCount(value)!==1)throw new TypeError("A mention trigger is exactly one grapheme without white space or control characters");
 if(value===richSlashCommandTrigger)throw new TypeError("A mention trigger cannot be the slash-command trigger /");
 return value;
}
const forbiddenLabel=/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;
/**
 * Admit the mention source options: exactly one of `items` (one implicit `@` feed over all closed
 * kinds, the original behavior) or `feeds` (1\u20138 host-declared feeds with unique triggers).
 */
export function requireRichMentionFeeds(options:{readonly items?:unknown;readonly feeds?:unknown}):readonly RichMentionFeed[]{
 if(options.items!==undefined&&options.feeds!==undefined)throw new TypeError("Use either mention items or mention feeds, not both");
 if(options.feeds===undefined){
  if(options.items===undefined)throw new TypeError("Mentions need items or feeds");
  return Object.freeze([Object.freeze({trigger:richDefaultMentionTrigger,kinds:richMentionKinds,items:requireProvider(options.items)})]);
 }
 const feeds=options.feeds;
 if(!Array.isArray(feeds)||feeds.length<1||feeds.length>maxFeeds)throw new TypeError(`Mention feeds must be an array of 1 to ${maxFeeds} feeds`);
 const triggers=new Set<string>(),out:RichMentionFeed[]=[];
 for(const value of feeds as unknown[]){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("A mention feed is a plain {trigger, kinds, items, label?} object");
  const feed=value as Record<string,unknown>;
  for(const key of Object.keys(feed))if(!["trigger","kinds","items","label"].includes(key))throw new TypeError(`Unknown mention feed field ${key}`);
  const trigger=requireRichMentionTrigger(feed["trigger"]);
  if(triggers.has(trigger))throw new TypeError(`Duplicate mention trigger ${trigger}`);triggers.add(trigger);
  const kinds=feed["kinds"];
  if(!Array.isArray(kinds)||!kinds.length||!kinds.every(isRichMentionKind)||new Set(kinds).size!==kinds.length)throw new TypeError("A mention feed declares unique kinds among user, page and tag");
  const label=feed["label"];
  if(label!==undefined&&(typeof label!=="string"||!label.trim()||label.length>200||forbiddenLabel.test(label)))throw new TypeError("A mention feed label is 1-200 characters without controls");
  out.push(Object.freeze({trigger,kinds:Object.freeze([...kinds]) as readonly RichMentionKind[],items:requireProvider(feed["items"]),...(label!==undefined?{label:label as string}:{})}));
 }
 return Object.freeze(out);
}
function requireProvider(value:unknown):RichMentionProvider{
 if(typeof value!=="function"&&!Array.isArray(value))throw new TypeError("Mention items are an array of suggestions or a provider function");
 return value as RichMentionProvider;
}
/** Admit provider output: closed kinds, Rust-equivalent id/label grammar, unique (kind, id). */
export function requireRichMentionSuggestions(items:unknown):readonly RichMentionSuggestion[]{
 if(!Array.isArray(items))throw new TypeError("Mention providers must return an array of suggestions");
 const seen=new Set<string>(),out:RichMentionSuggestion[]=[];
 for(const item of items as unknown[]){
  const value=item as Partial<RichMentionSuggestion>|null;
  if(!value||typeof value!=="object"||!isRichMentionKind(value.kind)||!isRichMentionId(value.id)||!isRichMentionLabel(value.label)||value.description!==undefined&&(typeof value.description!=="string"||value.description.length>200))throw new TypeError("Mention suggestions need a kind (user, page or tag), a bounded id and a plain label");
  const key=`${value.kind}:${value.id}`;if(seen.has(key))throw Error(`Duplicate mention suggestion ${key}`);seen.add(key);
  out.push(Object.freeze({kind:value.kind,id:value.id,label:value.label,...(value.description!==undefined?{description:value.description}:{})}));
 }
 return Object.freeze(out);
}
/** Deterministic local ranking: label prefix, word prefix, then substring (label or id). */
export function filterRichMentionSuggestions<T extends RichMentionSuggestion>(items:readonly T[],query:string):readonly T[]{
 const needle=query.toLowerCase();if(!needle)return items;
 const rank=(item:T):number=>{const label=item.label.toLowerCase();
  if(label.startsWith(needle))return 0;if(label.split(/\s+/).some(word=>word.startsWith(needle)))return 1;if(label.includes(needle)||item.id.toLowerCase().includes(needle))return 2;return -1;};
 return items.map((item,index)=>({item,index,score:rank(item)})).filter(entry=>entry.score>=0).sort((a,b)=>a.score-b.score||a.index-b.index).map(entry=>entry.item);
}

/** Menu option: identity `kind:id` (unique per list), presentation and the entity it inserts. */
export interface RichMentionOption {readonly id:string;readonly label:string;readonly description?:string;readonly mention:RichMention}
/**
 * The typed-trigger spec of one feed. `execute` publishes the chosen entity (local `insertMention`
 * or shared `insert_mention`); everything else (menu strings, admission, ranking) is common.
 */
export function richMentionFeedSpec<E>(feed:RichMentionFeed,execute:(item:RichMentionOption,run:RichSuggestionRun)=>E):RichSuggestionSpec<RichMentionOption,E>{
 const kinds=new Set<string>(feed.kinds);
 return Object.freeze({
  trigger:feed.trigger,rootData:Object.freeze({mentionTrigger:feed.trigger}),
  attributes:Object.freeze({root:"breditorMention",status:"mentionStatus",index:"mentionIndex",item:"mentionItem"}),idPrefix:"breditor-mention",
  // Duplicate mounting is refused per surface by the feed set (`RichMentionMenus`), not per feed.
  surfaces:new WeakSet<HTMLElement>(),
  strings:Object.freeze({label:"mentionLabel",loading:"mentionLoading",countOne:"mentionCountOne",count:"mentionCount",empty:"mentionEmpty"} as const),
  messages:mentionMessages,
  admit:(items:unknown):readonly RichMentionOption[]=>requireRichMentionSuggestions(items).map(item=>{
   if(!kinds.has(item.kind))throw new TypeError(`The ${feed.trigger} mention feed offers only ${feed.kinds.join(", ")}`);
   return Object.freeze({id:`${item.kind}:${item.id}`,label:item.label,...(item.description!==undefined?{description:item.description}:{}),mention:Object.freeze({kind:item.kind,id:item.id,label:item.label})});
  }),
  filter:(items:readonly RichMentionOption[],query:string)=>filterRichMentionSuggestions(items.map(option=>({...option.mention,option})),query).map(entry=>entry.option),
  enabled:(_item:RichMentionOption,context:RichSuggestionContext)=>context.model.view.readOnly!==true,
  // The inserted text is always the stored `@` + label, whatever the trigger.
  unavailable:(item:RichMentionOption)=>`@${item.label} cannot be inserted here`,
  execute,
 });
}
const mentionMessages=Object.freeze({live:"Mentions require a live document",duplicate:"This editing surface already has mentions",limits:"Expected bounded mention query and item limits",container:"Mention menus must be mounted outside the editing surface",closed:"Use an open editor for mentions",
 disposed:"Mentions are disposed",none:"No mention session is open",loading:"Mention suggestions are still loading",choose:"Choose an available mention",busy:"Mentions wait for the current editor operation",invalid:"The mention trigger is no longer valid"});

/** Session state plus the trigger of the feed it belongs to (`null` before any session). */
export interface RichMentionMenuState extends RichSuggestionState {readonly feed:string|null}
const registry=new WeakSet<HTMLElement>();
/**
 * One mounted set of feeds over one editing surface: one typed-trigger session per feed. Feed
 * sessions never overlap (a trigger opens only at a block start or after white space, and white
 * space ends every query), so at most one menu is open.
 */
export class RichMentionMenus<E> {
 readonly #sessions:readonly {readonly feed:RichMentionFeed;readonly session:RichSuggestionSession<RichMentionOption,E>}[];
 readonly #surface:HTMLElement;#last:number|undefined;#disposed=false;
 constructor(host:RichSuggestionHost,options:Omit<RichSuggestionOptions<RichMentionOption,E>,"items">,feeds:readonly RichMentionFeed[],execute:(item:RichMentionOption,run:RichSuggestionRun)=>E){
  if(registry.has(host.surface))throw Error(mentionMessages.duplicate);
  const sessions:{feed:RichMentionFeed;session:RichSuggestionSession<RichMentionOption,E>}[]=[];
  try{
   feeds.forEach((feed,index)=>{
    const onCancel=(reason:RichSuggestionCancelReason):void=>{this.#last=index;options.onCancel?.(reason);};
    const onOpen=():void=>{this.#last=index;options.onOpen?.(this.state());};
    const label=feed.label??options.label;
    // Providers see and return plain suggestions; the session admits them into menu options.
    const own={...options,items:feed.items as unknown as RichSuggestionOptions<RichMentionOption,E>["items"],onCancel,onOpen,...(label!==undefined?{label}:{})};
    sessions.push({feed,session:new RichSuggestionSession<RichMentionOption,E>(host,own,richMentionFeedSpec(feed,execute))});
   });
  }catch(error){for(const {session} of sessions)session.dispose();throw error;}
  this.#sessions=Object.freeze(sessions);this.#surface=host.surface;registry.add(host.surface);
 }
 #open():{feed:RichMentionFeed;session:RichSuggestionSession<RichMentionOption,E>}|undefined{return this.#sessions.find(entry=>entry.session.state().open);}
 state():RichMentionMenuState{
  const open=this.#open(),entry=open??this.#sessions[this.#last??0]!,state=entry.session.state();
  return Object.freeze({...state,disposed:this.#disposed,feed:open||this.#last!==undefined?entry.feed.trigger:null});
 }
 move(delta:number):void{this.#open()?.session.move(delta);}
 /** Choose in the open feed's menu (one guarded mention command, one Undo step). */
 choose(index?:number):E{
  if(this.#disposed)throw Error(mentionMessages.disposed);
  const open=this.#open();if(!open)throw Error(mentionMessages.none);
  return open.session.choose(index);
 }
 cancel(reason?:RichSuggestionCancelReason):void{this.#open()?.session.cancel(reason);}
 /** Release every feed menu and listener. The editor, its history and native owner remain borrowed. */
 dispose():void{
  if(this.#disposed)return;this.#disposed=true;
  for(const {session} of this.#sessions)session.dispose();
  registry.delete(this.#surface);
 }
}
