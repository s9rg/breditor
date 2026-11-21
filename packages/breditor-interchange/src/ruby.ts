/**
 * Opt-in ruby (furigana) extension (Rust `rich_content/ruby_v1.rs`, docs/RUBY_ANNOTATIONS.md).
 * This package has no runtime dependency, so the annotation policy is an identical copy of
 * `@breditor/experimental-rich-content`'s `ruby.ts` (a parity test compares them). Native admission
 * (the 1–256 byte bound) stays authoritative.
 *
 * HTML shape (export): `<ruby>base<rp>(</rp><rt>annotation</rt><rp>)</rp></ruby>`. Import also accepts
 * several base/`<rt>` pairs in one `<ruby>`, `<rb>` base wrappers and no `<rp>`.
 */
import type {Literal,Node} from "./wire.js";

export const rubyFormat="breditor-ruby/ruby";
export const rubyAnnotationProperty="breditor-ruby/annotation";
const forbidden=/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
const space="[\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]";
const edge=new RegExp(`^${space}|${space}$`,"u");
const encoder=new TextEncoder();
export function isRubyAnnotation(value:unknown):value is string{
 if(typeof value!=="string"||!value||edge.test(value)||forbidden.test(value))return false;
 for(const scalar of value){const unit=scalar.charCodeAt(0);if(scalar.length===1&&unit>=0xd800&&unit<=0xdfff)return false;}
 return encoder.encode(value).length<=256;
}
export function rubyAnnotationOf(format:Literal):string|undefined{
 if(format.type!==rubyFormat||Object.keys(format.properties).length!==1)return undefined;
 const value=format.properties[rubyAnnotationProperty];return isRubyAnnotation(value)?value:undefined;
}
export function rubyLiteral(annotation:string):Literal{return {type:rubyFormat,properties:{[rubyAnnotationProperty]:annotation}};}
type Run=Extract<Node,{kind:"text"}>;
/** Plain nodes (a literal outside the policy is kept for the caller to report) and ruby groups of consecutive runs with one equal admitted annotation (literal removed). */
export function rubyUnits(nodes:readonly Node[]):({kind:"nodes";nodes:Node[]}|{kind:"ruby";annotation:string;runs:Run[]})[]{
 const out:({kind:"nodes";nodes:Node[]}|{kind:"ruby";annotation:string;runs:Run[]})[]=[];
 const annotation=(node:Node)=>{if(node.kind!=="text")return undefined;const literal=node.formats.find(f=>f.type===rubyFormat);return literal&&rubyAnnotationOf(literal);};
 const strip=(node:Run):Run=>({...node,formats:node.formats.filter(f=>f.type!==rubyFormat)});
 for(let index=0;index<nodes.length;){
  const value=annotation(nodes[index]!);
  if(value===undefined){const node=nodes[index]!,last=out.at(-1);if(last?.kind==="nodes")last.nodes.push(node);else out.push({kind:"nodes",nodes:[node]});index++;continue;}
  const runs:Run[]=[];while(index<nodes.length&&annotation(nodes[index]!)===value){runs.push(strip(nodes[index] as Run));index++;}
  out.push({kind:"ruby",annotation:value,runs});
 }
 return out;
}
