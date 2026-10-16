/** Existing native node-record DTOs used only during conversion, never an editing state model. */
import {Budget,bytes,fail,limits} from "./budget.js";
export interface Literal {type:string;properties:Record<string,unknown>}
export interface Text {kind:"text";text:string;formats:Literal[]}
export interface Element {kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:Node[]}
export type Node=Text|Element;
export const format=(local:string,properties:Record<string,unknown>={}):Literal=>({type:local==="strong"?"breditor/strong":`breditor-inline/${local}`,properties});
export function element(b:Budget,local:string,children:Node[]=[],properties:Record<string,unknown>={}):Element {
  b.node();return{kind:"element",type:`breditor/${local}`,entityId:null,properties:{"breditor/block-id":b.id(),...properties},children};
}
export function text(b:Budget,value:string,formats:readonly Literal[]=[]):Text {b.node();return{kind:"text",text:value,formats:[...formats].sort((a,c)=>a.type<c.type?-1:a.type>c.type?1:0)};}
export function append(b:Budget,runs:Node[],value:string,formats:readonly Literal[]):void {
  if(!value)return;const last=runs.at(-1),sorted=[...formats].sort((a,c)=>a.type<c.type?-1:a.type>c.type?1:0);
  if(last?.kind==="text"&&JSON.stringify(last.formats)===JSON.stringify(sorted))last.text+=value;
  else runs.push(text(b,value,sorted));
}
export function rootJson(b:Budget,children:Element[]):string {
  if(!children.length)fail("empty");b.node();
  const root:Element={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"breditor-clipboard"},children};
  // Existing native records require ascending unique property/object keys. This
  // orders only record objects; flow, text, axes and source-cell arrays never move.
  const encoded=JSON.stringify(root,(_key,value:unknown)=>value!==null&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[c])=>a<c?-1:a>c?1:0)):value);
  if(encoded.length>limits.outputBytes||bytes(encoded)>limits.outputBytes)fail("resource-limit");return encoded;
}
export function property(node:Element,name:string):unknown{return node.properties[`breditor/${name}`];}
export function stringProperty(node:Element,name:string):string {const v=property(node,name);if(typeof v!=="string")fail("native-admission");return v;}
export function nodeText(node:Node):string{return node.kind==="text"?node.text:node.children.map(nodeText).join("");}
