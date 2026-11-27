/**
 * Optional host renderer hook for V4 mention chips, shared by the live renderer (`render.ts`,
 * `mentionPresentation` option) and the static HTML renderer (`renderStaticDocument`).
 *
 * The hook only decorates the chip. It can never change what is stored or what editing sees:
 *
 * - The chip's DOM text stays the stored `@` + label snapshot, so selection offsets, caret
 *   placement beside the non-editable island, search, copy and interchange are unchanged.
 * - Optional display `text` is presentation only: the chip gets `data-mention-display` and the
 *   stored pieces move into one `<span data-mention-text>`, which `richMentionDisplayStyles` hides
 *   while a `::before` shows the display text. Without that stylesheet the stored `@label` shows.
 * - `title`, extra class tokens and `data-mention-host-*` attributes are validated plain strings;
 *   no markup, no event handler, no `style`, `href` or reserved attribute can be produced.
 * - The hook sees a frozen copy of the stored `{kind, id, label}`. A hook that throws or returns
 *   anything outside the contract is ignored for that chip (fail closed to the default chip).
 */
import {isRichMentionLabel,mentionChipAttributes,richMentionClass,type RichMention} from "./mention.js";

/** What a host may add to one mention chip. Every field is optional. */
export interface RichMentionPresentation {
 /** Visible text instead of the stored `@label` (presentation only; mention label grammar, 1\u2013256 UTF-8 bytes). */
 readonly text?:string;
 /** Tooltip (`title`), same grammar as `text`. */
 readonly title?:string;
 /** Extra class tokens `[A-Za-z_][A-Za-z0-9_-]{0,63}`, at most 8. */
 readonly classes?:readonly string[];
 /** Host data emitted as `data-mention-host-<key>`: keys `[a-z][a-z0-9-]{0,31}` (at most 8), values like `text` but may be empty. */
 readonly data?:Readonly<Record<string,string>>;
}
/** Host hook: called once per rendered chip with the stored entity. Return nothing for the default chip. */
export type RichMentionRenderer=(mention:RichMention)=>RichMentionPresentation|null|undefined;
/** Sanitized chip attributes (default ones first) and the display text, if any. */
export interface RichMentionChipPresentation {readonly attributes:readonly {readonly name:string;readonly value:string}[];readonly display:string|undefined}

export const richMentionDisplayAttribute="data-mention-display";
export const richMentionTextAttribute="data-mention-text";
/** Shows the display text of decorated chips and hides their stored pieces (layout only). */
export const richMentionDisplayStyles=`.${richMentionClass}[${richMentionDisplayAttribute}]::before{content:attr(${richMentionDisplayAttribute})}.${richMentionClass}[${richMentionDisplayAttribute}]>[${richMentionTextAttribute}]{display:none}`;

const classToken=/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/,dataKey=/^[a-z][a-z0-9-]{0,31}$/;
const forbidden=/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
const encoder=new TextEncoder();
const plainValue=(value:unknown):value is string=>typeof value==="string"&&!forbidden.test(value)&&encoder.encode(value).length<=256&&[...value].every(scalar=>scalar.length===2||scalar.charCodeAt(0)<0xd800||scalar.charCodeAt(0)>0xdfff);
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));

/** Admit the optional hook option itself (a function or undefined). */
export function requireRichMentionRenderer(value:unknown):RichMentionRenderer|undefined{
 if(value!==undefined&&typeof value!=="function")throw new TypeError("mentionPresentation must be a function");
 return value as RichMentionRenderer|undefined;
}
/** Strictly admit one hook result, or `undefined` when it is outside the contract. */
function admit(value:unknown):RichMentionPresentation|undefined{
 if(!plain(value))return undefined;
 for(const key of Object.keys(value))if(!["text","title","classes","data"].includes(key))return undefined;
 const {text,title,classes,data}=value;
 if(text!==undefined&&!isRichMentionLabel(text))return undefined;
 if(title!==undefined&&!isRichMentionLabel(title))return undefined;
 if(classes!==undefined&&(!Array.isArray(classes)||classes.length>8||!classes.every(token=>typeof token==="string"&&classToken.test(token))))return undefined;
 if(data!==undefined){
  if(!plain(data))return undefined;
  const entries=Object.entries(data);
  if(entries.length>8||!entries.every(([key,entry])=>dataKey.test(key)&&plainValue(entry)))return undefined;
 }
 return value as RichMentionPresentation;
}
/**
 * The chip presentation of one mention: the default attributes (`class`, `data-mention-kind`,
 * `data-mention-id`), then the sanitized host additions in a fixed order. Without a hook, or when
 * the hook throws or returns an invalid value, this is exactly the default chip.
 */
export function richMentionChipPresentation(mention:RichMention,renderer?:RichMentionRenderer):RichMentionChipPresentation{
 const base=mentionChipAttributes(mention);
 let custom:RichMentionPresentation|undefined;
 if(renderer){try{custom=admit(renderer(Object.freeze({kind:mention.kind,id:mention.id,label:mention.label})));}catch{custom=undefined;}}
 if(!custom)return Object.freeze({attributes:base,display:undefined});
 const extra=[...new Set(custom.classes??[])].filter(token=>token!==richMentionClass);
 const attributes=base.map(attribute=>attribute.name==="class"&&extra.length?{name:"class",value:[attribute.value,...extra].join(" ")}:attribute);
 if(custom.text!==undefined)attributes.push({name:richMentionDisplayAttribute,value:custom.text});
 if(custom.title!==undefined)attributes.push({name:"title",value:custom.title});
 for(const [key,value] of Object.entries(custom.data??{}).sort(([a],[b])=>a<b?-1:a>b?1:0))attributes.push({name:`data-mention-host-${key}`,value});
 return Object.freeze({attributes:Object.freeze(attributes.map(attribute=>Object.freeze({...attribute}))),display:custom.text});
}
