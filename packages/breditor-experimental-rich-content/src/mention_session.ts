/**
 * Opt-in `@` mention suggestion menu for a rich V4 owner. It reuses the shared typed-trigger
 * session of slash commands (accessible listbox, Rust-read trigger, AbortSignal-cancelled providers,
 * stale-result rejection). Choosing a suggestion publishes **one** native `insertMention` command
 * that replaces the typed `@query` by the mention, so a single Undo restores the typed trigger.
 */
import type {RichCommandOutcome,RichSelection} from "./core.js";
import {isRichMentionId,isRichMentionKind,isRichMentionLabel,type RichMention,type RichMentionKind} from "./mention.js";
import {RichSuggestionSession,type RichSuggestionCancelReason,type RichSuggestionHost,type RichSuggestionOptions,type RichSuggestionProviderRequest,type RichSuggestionContext,type RichSuggestionRun,type RichSuggestionSpec,type RichSuggestionState} from "./suggestion_session.js";

/** One host entity offered by the menu. `label` (without `@`) is stored as the mention's snapshot. */
export interface RichMentionSuggestion {
 readonly kind:RichMentionKind;readonly id:string;readonly label:string;
 /** Secondary menu text only (for example an email or a page path); never stored. */
 readonly description?:string;
}
export type RichMentionHost=RichSuggestionHost;
export type RichMentionCancelReason=RichSuggestionCancelReason;
export type RichMentionProviderRequest=RichSuggestionProviderRequest;
export type RichMentionState=RichSuggestionState;
export interface RichMentionExecution {readonly mention:RichMention;readonly outcome:RichCommandOutcome}
/** Synchronous list (filtered locally) or a cancellable provider. Aborted/stale results are discarded. */
export type RichMentionProvider=readonly RichMentionSuggestion[]|((query:string,request:RichMentionProviderRequest)=>readonly RichMentionSuggestion[]|Promise<readonly RichMentionSuggestion[]>);
export interface RichMentionOptions extends Omit<RichSuggestionOptions<RichMentionSuggestion,RichMentionExecution>,"items"> {
 items:RichMentionProvider;
 /** Query length after the `@`; longer queries end the session. Default 32, maximum 64. */
 maxQueryLength?:number;
 /** Displayed suggestion limit. Default 10, maximum 50. */
 maxItems?:number;
 /** Overrides the host catalog's mentionLabel. */
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
/** Menu option: identity `kind:id` (unique per list), presentation and the entity it inserts. */
interface Option {readonly id:string;readonly label:string;readonly description?:string;readonly mention:RichMention}
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
const surfaces=new WeakSet<HTMLElement>();
const mentionSpec:RichSuggestionSpec<Option,RichMentionExecution>=Object.freeze({
 trigger:"@",attributes:Object.freeze({root:"breditorMention",status:"mentionStatus",index:"mentionIndex",item:"mentionItem"}),idPrefix:"breditor-mention",surfaces,
 strings:Object.freeze({label:"mentionLabel",loading:"mentionLoading",countOne:"mentionCountOne",count:"mentionCount",empty:"mentionEmpty"} as const),
 messages:Object.freeze({live:"Mentions require a live document",duplicate:"This editing surface already has mentions",limits:"Expected bounded mention query and item limits",container:"Mention menus must be mounted outside the editing surface",closed:"Use an open editor for mentions",
  disposed:"Mentions are disposed",none:"No mention session is open",loading:"Mention suggestions are still loading",choose:"Choose an available mention",busy:"Mentions wait for the current editor operation",invalid:"The mention trigger is no longer valid"}),
 admit:(items:unknown):readonly Option[]=>requireRichMentionSuggestions(items).map(item=>Object.freeze({id:`${item.kind}:${item.id}`,label:item.label,...(item.description!==undefined?{description:item.description}:{}),mention:Object.freeze({kind:item.kind,id:item.id,label:item.label})})),
 filter:(items:readonly Option[],query:string)=>filterRichMentionSuggestions(items.map(option=>({...option.mention,option})),query).map(entry=>entry.option),
 enabled:(_item:Option,context:RichSuggestionContext)=>context.model.view.readOnly!==true,
 unavailable:(item:Option)=>`@${item.label} cannot be inserted here`,
 execute(item:Option,run:RichSuggestionRun):RichMentionExecution{
  const {check,trigger,host}=run,block=trigger.block,mention=item.mention;
  const selection:Extract<RichSelection,{kind:"text"}>={kind:"text",anchor:{block,offset:String(trigger.start),affinity:"after"},focus:{block,offset:String(check.caret),affinity:check.affinity}};
  const outcome=host.execute({kind:"insertMention",data:{selection,mention}},true,check.view.revision);
  if(outcome==="queued")throw Error("The mention insertion was queued");
  return Object.freeze({mention,outcome});
 },
});
/**
 * Mount one opt-in `@` mention menu for a borrowed DOM coordinator over a rich V4 owner.
 * Pass `core` to refuse mounting on an owner without native mentions.
 */
export function mountRichMentions(host:RichMentionHost,options:RichMentionOptions):RichMentions{
 if(options.core&&options.core.supportsMentions?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner with native mentions");
 // Providers see and return plain suggestions; the session admits them into menu options.
 return new RichSuggestionSession<Option,RichMentionExecution>(host,options as unknown as RichSuggestionOptions<Option,RichMentionExecution>,mentionSpec);
}
