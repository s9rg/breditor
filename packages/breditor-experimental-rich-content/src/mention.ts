/**
 * Candidate rich V4 mention entities (Rust `rich_content/mention.rs`): grammar mirror, intent
 * snapshot, DOM-free run grouping shared by the live and static renderers, and the inert chip.
 *
 * A mention is the native `breditor/mention` format over the exact text `@` + label. The
 * `kind` + `id` pair is the durable host identity; the label is a snapshot captured at
 * insertion. The chip shows the stored label: its text *is* document text (selection offsets,
 * copy and search all see it), so a host that wants the current display name re-resolves it
 * from `data-mention-kind`/`data-mention-id` for secondary presentation (a tooltip or hover
 * card), never by rewriting the chip text. No mention renders a link in V4.
 */
import type {FormatLiteral} from "./core.js";

export const richMentionFormat="breditor/mention";
export const richMentionKindProperty="breditor/mention-kind";
export const richMentionIdProperty="breditor/mention-id";
export const richMentionLabelProperty="breditor/mention-label";
export const richMentionKinds=Object.freeze(["user","page","tag"] as const);
export type RichMentionKind=typeof richMentionKinds[number];
/** One host entity reference. `label` excludes the `@` prefix. */
export interface RichMention {readonly kind:RichMentionKind;readonly id:string;readonly label:string}
/** Class of the inert chip in live and static output. */
export const richMentionClass="breditor-mention";

const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Controls (C0, DEL, C1), line/paragraph separators and bidi embedding/override/isolate controls.
const forbidden=/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
// Unicode White_Space exactly as Rust `char::is_whitespace` (JS `\s` differs, e.g. U+FEFF).
const space="[\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]";
const edge=new RegExp(`^${space}|${space}$`,"u");
const encoder=new TextEncoder();
/** Mirrors `RichMentionLabel::try_new`: 1–256 UTF-8 bytes, no edge whitespace, no controls. */
export function isRichMentionLabel(value:unknown):value is string{
 if(typeof value!=="string"||!value||edge.test(value)||forbidden.test(value))return false;
 for(const scalar of value){const unit=scalar.charCodeAt(0);if(scalar.length===1&&unit>=0xd800&&unit<=0xdfff)return false;}
 return encoder.encode(value).length<=256;
}
/** Mirrors `RichMentionId::try_new`: `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. */
export function isRichMentionId(value:unknown):value is string{return typeof value==="string"&&idPattern.test(value);}
export function isRichMentionKind(value:unknown):value is RichMentionKind{return typeof value==="string"&&(richMentionKinds as readonly string[]).includes(value);}
/** Strict admitted mention of one format literal, or `undefined`. */
export function mentionOf(format:{readonly type:string;readonly properties:Readonly<Record<string,unknown>>}):RichMention|undefined{
 if(format.type!==richMentionFormat)return undefined;
 const p=format.properties,keys=Object.keys(p);
 if(keys.length!==3)return undefined;
 const kind=p[richMentionKindProperty],id=p[richMentionIdProperty],label=p[richMentionLabelProperty];
 return isRichMentionKind(kind)&&isRichMentionId(id)&&isRichMentionLabel(label)?Object.freeze({kind,id,label}):undefined;
}
/** The exact document text of one mention. */
export function mentionText(mention:RichMention):string{return `@${mention.label}`;}
/** The native format literal of one mention (properties in canonical name order). */
export function mentionFormat(mention:RichMention):FormatLiteral{
 return {type:richMentionFormat,properties:{[richMentionIdProperty]:mention.id,[richMentionKindProperty]:mention.kind,[richMentionLabelProperty]:mention.label}};
}
/** Snapshot a plain, primitive entity reference; anything else throws before JSON. */
export function requireRichMention(input:unknown):RichMention{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError("Expected a plain mention {kind, id, label}");
 const keys=Reflect.ownKeys(input);
 if(keys.length!==3||!["kind","id","label"].every(key=>keys.includes(key)))throw new TypeError("A mention has exactly kind, id and label");
 const {kind,id,label}=input as Record<string,unknown>;
 if(!isRichMentionKind(kind))throw new TypeError("Mention kind must be user, page or tag");
 if(!isRichMentionId(id))throw new TypeError("Mention id must match [A-Za-z0-9][A-Za-z0-9._:-]{0,127}");
 if(!isRichMentionLabel(label))throw new TypeError("Mention label must be 1-256 UTF-8 bytes without controls or edge whitespace");
 return Object.freeze({kind,id,label});
}
interface PointIntent {block:string;offset:string;affinity:"before"|"after"}
const point=(value:unknown):PointIntent=>{
 const p=value as Record<string,unknown>|null;
 if(!p||typeof p!=="object"||typeof p["block"]!=="string"||typeof p["offset"]!=="string"||!/^(0|[1-9][0-9]{0,19})$/.test(p["offset"])||p["affinity"]!=="before"&&p["affinity"]!=="after")throw new TypeError("Expected a text point");
 return {block:p["block"],offset:p["offset"],affinity:p["affinity"]};
};
/** `insertMention` intent snapshot: one text range (the typed trigger) and one entity. */
export function encodeMentionIntent(input:unknown):{selection:{kind:"text";anchor:PointIntent;focus:PointIntent};mention:RichMention}{
 const value=input as Record<string,unknown>|null;
 if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("Expected plain mention intent");
 const keys=Reflect.ownKeys(value);
 if(keys.length!==2||!keys.includes("selection")||!keys.includes("mention"))throw new TypeError("Mention intent has exactly selection and mention");
 const selection=value["selection"] as Record<string,unknown>|null;
 if(!selection||typeof selection!=="object"||selection["kind"]!=="text")throw new TypeError("A mention replaces one text range");
 return {selection:{kind:"text",anchor:point(selection["anchor"]),focus:point(selection["focus"])},mention:requireRichMention(value["mention"])};
}

/** A text run as both renderers see it. */
export interface MentionRun {readonly text:string;readonly formats:readonly FormatLiteral[]}
/** One rendered inline item: an ordinary run, or one whole mention chip made of styled pieces. */
export type MentionInlineItem<R extends MentionRun>=
 |{readonly kind:"run";readonly run:R}
 |{readonly kind:"mention";readonly mention:RichMention;readonly pieces:readonly R[]};
const sameMention=(a:FormatLiteral,b:FormatLiteral):boolean=>{const x=mentionOf(a),y=mentionOf(b);return !!x&&!!y&&x.kind===y.kind&&x.id===y.id&&x.label===y.label;};
const mentionLiteral=(run:MentionRun):FormatLiteral|undefined=>run.formats.find(format=>format.type===richMentionFormat);
/**
 * Group text children into runs and whole mention units. A contiguous stretch of one equal
 * mention format is split into units of `@label`, each piece carrying its own other formats
 * (the mention literal removed). `strict` reports a stretch that is not whole units (Rust
 * admission refuses it); otherwise such a stretch renders as plain runs without chips.
 */
export function groupMentionRuns<R extends MentionRun>(runs:readonly R[],rebuild:(run:R,text:string,formats:readonly FormatLiteral[])=>R,strict=false):MentionInlineItem<R>[]{
 const items:MentionInlineItem<R>[]=[];
 for(let index=0;index<runs.length;){
  const literal=mentionLiteral(runs[index]!);
  if(!literal){items.push({kind:"run",run:runs[index]!});index++;continue;}
  let end=index+1;while(end<runs.length&&mentionLiteral(runs[end]!)&&sameMention(mentionLiteral(runs[end]!)!,literal))end++;
  const stretch=runs.slice(index,end),mention=mentionOf(literal),text=stretch.map(run=>run.text).join("");
  const unit=mention?mentionText(mention):"";
  const whole=!!mention&&text.length%unit.length===0&&text===unit.repeat(text.length/unit.length);
  if(!whole){if(strict)throw new TypeError("Mention text must be whole copies of @ plus its label");for(const run of stretch)items.push({kind:"run",run});index=end;continue;}
  let pieces:R[]=[],filled=0;
  for(const run of stretch){
   const formats=run.formats.filter(format=>format.type!==richMentionFormat);
   let rest=run.text;
   while(rest){
    const take=Math.min(rest.length,unit.length-filled);
    pieces.push(rebuild(run,rest.slice(0,take),formats));rest=rest.slice(take);filled+=take;
    if(filled===unit.length){items.push({kind:"mention",mention:mention!,pieces});pieces=[];filled=0;}
   }
  }
  index=end;
 }
 return items;
}
/** Chip attributes shared by live and static output (live adds `contenteditable="false"`). */
export function mentionChipAttributes(mention:RichMention):readonly {name:string;value:string}[]{
 return [{name:"class",value:richMentionClass},{name:"data-mention-kind",value:mention.kind},{name:"data-mention-id",value:mention.id}];
}
/** Live inert chip: a non-editable island whose text is the stored `@label`. */
export function createMentionChip(document:Document,mention:RichMention,children:readonly Node[]):HTMLElement{
 const chip=document.createElement("span");
 for(const {name,value} of mentionChipAttributes(mention))chip.setAttribute(name,value);
 chip.setAttribute("contenteditable","false");chip.append(...children);return chip;
}
/** Live/static chip CSS (optional host styling hook). */
export const richMentionStyles=`.${richMentionClass}{border-radius:4px;padding:0 2px;background:#e3eefb;color:#173d6b;white-space:nowrap}`;
