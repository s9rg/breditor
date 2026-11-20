/**
 * Candidate rich V4 mention entities (Rust `rich_content/mention.rs`). This package has no runtime
 * dependency, so the grammar is an identical copy of `@breditor/experimental-rich-content`'s
 * `mention.ts` checks (a parity test compares them). Native admission stays authoritative.
 *
 * HTML shape (export, and the only shape import recognizes):
 * `<span class="breditor-mention" data-mention-kind="user|page|tag" data-mention-id="…">@label</span>`.
 */
import type {Literal,Node} from "./wire.js";

export const mentionFormat="breditor/mention";
const KIND="breditor/mention-kind",ID="breditor/mention-id",LABEL="breditor/mention-label";
const kinds=["user","page","tag"];
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const forbidden=/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
const space="[\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]";
const edge=new RegExp(`^${space}|${space}$`,"u");
const encoder=new TextEncoder();
export function isMentionKind(value:unknown):value is string{return typeof value==="string"&&kinds.includes(value);}
export function isMentionId(value:unknown):value is string{return typeof value==="string"&&idPattern.test(value);}
export function isMentionLabel(value:unknown):value is string{
 if(typeof value!=="string"||!value||edge.test(value)||forbidden.test(value))return false;
 for(const scalar of value){const unit=scalar.charCodeAt(0);if(scalar.length===1&&unit>=0xd800&&unit<=0xdfff)return false;}
 return encoder.encode(value).length<=256;
}
export interface MentionValue {readonly kind:string;readonly id:string;readonly label:string}
export function mentionOf(format:Literal):MentionValue|undefined{
 if(format.type!==mentionFormat||Object.keys(format.properties).length!==3)return undefined;
 const kind=format.properties[KIND],id=format.properties[ID],label=format.properties[LABEL];
 return isMentionKind(kind)&&isMentionId(id)&&isMentionLabel(label)?{kind,id,label}:undefined;
}
export function mentionLiteral(value:MentionValue):Literal{return {type:mentionFormat,properties:{[ID]:value.id,[KIND]:value.kind,[LABEL]:value.label}};}
/**
 * Recognize the exact export span. The text must be `@` + a label that HTML whitespace processing
 * cannot change (no tab/newline/carriage return/form feed and no double space), so the imported
 * text is exactly the label snapshot; anything else stays ordinary text.
 */
export function mentionFromSpan(tag:string,attribute:(name:string)=>string|undefined,text:string):Literal|undefined{
 if(tag!=="span"||!(attribute("class")??"").split(/\s+/).includes("breditor-mention"))return undefined;
 const kind=attribute("data-mention-kind"),id=attribute("data-mention-id");
 if(!isMentionKind(kind)||!isMentionId(id)||!text.startsWith("@"))return undefined;
 const label=text.slice(1);
 if(!isMentionLabel(label)||/[\t\n\f\r]| {2}/.test(label))return undefined;
 return mentionLiteral({kind,id,label});
}
type Run=Extract<Node,{kind:"text"}>;
/** Split text runs into ordinary runs and whole `@label` units (each a list of styled pieces). */
export function mentionUnits(nodes:readonly Node[]):({kind:"node";node:Node}|{kind:"mention";mention:MentionValue;pieces:Run[]})[]{
 const out:({kind:"node";node:Node}|{kind:"mention";mention:MentionValue;pieces:Run[]})[]=[];
 const literal=(node:Node)=>node.kind==="text"?node.formats.find(format=>format.type===mentionFormat):undefined;
 for(let index=0;index<nodes.length;){
  const first=literal(nodes[index]!),mention=first&&mentionOf(first);
  if(!first||!mention){out.push({kind:"node",node:nodes[index]!});index++;continue;}
  const key=JSON.stringify(first);let end=index+1;
  while(end<nodes.length&&JSON.stringify(literal(nodes[end]!))===key)end++;
  const stretch=nodes.slice(index,end) as Run[],unit=`@${mention.label}`,text=stretch.map(run=>run.text).join("");
  if(text.length%unit.length!==0||text!==unit.repeat(text.length/unit.length)){for(const node of stretch)out.push({kind:"node",node});index=end;continue;}
  let pieces:Run[]=[],filled=0;
  for(const run of stretch){
   const formats=run.formats.filter(format=>format.type!==mentionFormat);let rest=run.text;
   while(rest){const take=Math.min(rest.length,unit.length-filled);pieces.push({...run,text:rest.slice(0,take),formats});rest=rest.slice(take);filled+=take;if(filled===unit.length){out.push({kind:"mention",mention,pieces});pieces=[];filled=0;}}
  }
  index=end;
 }
 return out;
}
