/** Slash-command item contract. Items prepare existing typed Rust commands; they never touch the DOM. */
import type {RichCommand,RichSelectionPolicy} from "./core.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import {id,selectedText} from "./model.js";
import type {RichUiLocale} from "./ui_locale.js";

export type RichSlashContext=ActionContext<RichSelectionPolicy>;
/**
 * One selectable command. `id` is the stable identity used for ranking, ARIA option
 * identity and callbacks; `label` is presentation only. `enabled` and `command` are
 * re-evaluated against fresh Rust views: the first before showing, the second only
 * after the typed trigger has been removed by a guarded native publication.
 */
export interface RichSlashItem {
 readonly id:string;
 readonly label:string;
 readonly keywords?:readonly string[];
 readonly description?:string;
 enabled(context:RichSlashContext):boolean;
 command(context:RichSlashContext):RichCommand|null;
}
/** Adapt one existing toolbar control. Values/fields are fixed at definition time. */
export interface RichSlashPick {
 readonly id:string;readonly control:string;readonly label?:string;readonly keywords?:readonly string[];readonly description?:string;
 readonly value?:string;readonly fields?:Readonly<Record<string,string>>;
 /** Optional replacement preparation that still uses only an existing typed command. */
 readonly command?:(context:RichSlashContext)=>RichCommand|null;
}
const heading=(level:number)=>(context:RichSlashContext):RichCommand|null=>{const node=selectedText(context.model);return node?{kind:"setHeading",block:id(node),level}:null;};
/** Default menu. Picks whose control is absent from the supplied toolbar are omitted. */
export const standardRichSlashPicks:readonly RichSlashPick[]=Object.freeze([
 {id:"paragraph",control:"paragraph",label:"Text",keywords:["paragraph","plain","body"]},
 {id:"heading-1",control:"heading",label:"Heading 1",keywords:["h1","title"],command:heading(1)},
 {id:"heading-2",control:"heading",label:"Heading 2",keywords:["h2","subtitle"],command:heading(2)},
 {id:"heading-3",control:"heading",label:"Heading 3",keywords:["h3"],command:heading(3)},
 {id:"bullet-list",control:"bullet",label:"Bullet list",keywords:["ul","unordered","list"]},
 {id:"numbered-list",control:"numbered",label:"Numbered list",keywords:["ol","ordered","list"]},
 {id:"task-list",control:"tasks",label:"Task list",keywords:["todo","checkbox","check"]},
 {id:"blockquote",control:"blockquote",label:"Quote",keywords:["blockquote","citation"]},
 {id:"code-block",control:"code-block",label:"Code block",keywords:["code","pre","snippet"],fields:{language:"",policy:"rejectFormatted"}},
 {id:"horizontal-rule",control:"horizontal-rule",label:"Divider",keywords:["hr","rule","separator","line"]},
 {id:"table",control:"table",label:"Table",keywords:["grid","cells"]},
 // Candidate rich V4 only: picks whose control is absent (V1–V3 toolbars) are omitted.
 {id:"details",control:"details",label:"Collapsible section",keywords:["details","summary","toggle","collapse","disclosure"]},
].map(pick=>Object.freeze(pick)));

const identity=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
/** Throws on malformed or duplicate identities before any menu state changes. */
export function requireRichSlashItems(items:unknown,limit=50):readonly RichSlashItem[] {
 if(!Array.isArray(items))throw new TypeError("Slash-command providers must return an array of items");
 const seen=new Set<string>(),out:RichSlashItem[]=[];
 for(const item of items as unknown[]){
  const value=item as Partial<RichSlashItem>|null;
  if(!value||typeof value.id!=="string"||!identity.test(value.id)||typeof value.label!=="string"||!value.label.trim()||value.label.length>120||typeof value.enabled!=="function"||typeof value.command!=="function"||value.keywords!==undefined&&(!Array.isArray(value.keywords)||value.keywords.some(word=>typeof word!=="string"))||value.description!==undefined&&typeof value.description!=="string")throw new TypeError("Expected slash-command items with a stable id, label, enabled() and command()");
  if(seen.has(value.id))throw Error(`Duplicate slash-command item identity ${value.id}`);seen.add(value.id);
  if(out.length<limit)out.push(value as RichSlashItem);
 }
 return Object.freeze(out);
}
/** Map existing toolbar controls into items; never creates a new command family. */
/** `ui` (an editor's `uiLocale()`) relabels standard item ids, so a custom provider can filter on localized labels. */
export function createRichSlashCommands<P extends RichSelectionPolicy>(controls:readonly ToolbarControl<P>[],picks:readonly RichSlashPick[]=standardRichSlashPicks,ui?:RichUiLocale):readonly RichSlashItem[] {
 const byId=new Map(controls.map(control=>[control.id,control as unknown as ToolbarControl<RichSelectionPolicy>]));
 const items:RichSlashItem[]=[];
 for(const pick of picks){
  const control=byId.get(pick.control);if(!control)continue;
  const fields=pick.fields?Object.freeze({...pick.fields}):undefined,prepare=pick.command;
  items.push(Object.freeze({id:pick.id,label:pick.label??control.label,...(pick.keywords?{keywords:Object.freeze([...pick.keywords])}:{}),...(pick.description?{description:pick.description}:{}),
   enabled:(context:RichSlashContext)=>context.model.view.readOnly!==true&&control.enabled(context),
   command:(context:RichSlashContext)=>prepare?prepare(context):control.command(context,pick.value,fields)}));
 }
 return requireRichSlashItems(ui?items.map(item=>ui.slashItem(item)):items,Number.MAX_SAFE_INTEGER);
}
/** Deterministic local ranking: label prefix, word prefix, keyword/id prefix, then substring. */
export function filterRichSlashItems(items:readonly RichSlashItem[],query:string):readonly RichSlashItem[] {
 const needle=query.toLowerCase();if(!needle)return items;
 const rank=(item:RichSlashItem):number=>{
  const label=item.label.toLowerCase(),words=[item.id.toLowerCase(),...(item.keywords??[]).map(word=>word.toLowerCase())];
  if(label.startsWith(needle))return 0;
  if(label.split(/\s+/).some(word=>word.startsWith(needle)))return 1;
  if(words.some(word=>word.startsWith(needle)))return 2;
  if(label.includes(needle)||words.some(word=>word.includes(needle)))return 3;
  return -1;
 };
 return items.map((item,index)=>({item,index,score:rank(item)})).filter(entry=>entry.score>=0).sort((a,b)=>a.score-b.score||a.index-b.index).map(entry=>entry.item);
}
