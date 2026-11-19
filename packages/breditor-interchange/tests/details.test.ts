import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(details:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(details?{supportsDetails:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
// Structural shape without generated block identities.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape=(node:any):unknown=>node.kind==="text"?node.text:{type:node.type.slice(9),...(Object.keys(node.properties).some(k=>k!=="breditor/block-id")?{props:Object.fromEntries(Object.entries(node.properties).filter(([k])=>k!=="breditor/block-id"))}:{}),children:node.children.map(shape)};
function blocks(value:Result):unknown[]{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root.children.map(shape);}
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const t=(text:string,formats:unknown[]=[])=>({kind:"text",text,formats});
const section=(open:boolean,summary:unknown[],body:unknown[])=>el("details",{"block-id":"d",...(open?{"details-open":true}:{})},[el("details-summary",{"block-id":"s"},summary),...body]);
const para=(id:string,text:string)=>el("paragraph",{"block-id":id},text?[t(text)]:[]);
const html='<details open><summary>Title <b>bold</b></summary><p>Body</p><ul><li>Item</li></ul></details>';

describe("candidate rich V4 collapsible-section interchange",()=>{
 it("imports <details>/<summary> as a section for V4 owners, mapping open",()=>{
  const value=staging(true).importHtml(html);
  expect(blocks(value)).toEqual([{type:"details",props:{"breditor/details-open":true},children:[
   {type:"details-summary",children:["Title ","bold"]},{type:"paragraph",children:["Body"]},{type:"bullet-list",children:[{type:"list-item",children:[{type:"paragraph",children:["Item"]}]}]}]}]);
  expect(value.losses).toEqual([]);
  const closed=staging(true).importHtml("<details><summary>T</summary>Inline body</details>");
  expect(blocks(closed)).toEqual([{type:"details",children:[{type:"details-summary",children:["T"]},{type:"paragraph",children:["Inline body"]}]}]);
  expect(closed.losses).toEqual([]);
 });
 it("synthesizes an empty summary or body and reports the structural change",()=>{
  const missing=staging(true).importHtml("<details><p>Body</p></details>");
  expect(blocks(missing)).toEqual([{type:"details",children:[{type:"details-summary",children:[]},{type:"paragraph",children:["Body"]}]}]);
  expect(codes(missing)["block-structure"]).toBe(1);
  const empty=staging(true).importHtml("<details><summary>Only</summary></details>");
  expect(blocks(empty)).toEqual([{type:"details",children:[{type:"details-summary",children:["Only"]},{type:"paragraph",children:[]}]}]);
  const heading=staging(true).importHtml("<details><summary><h2>Head</h2></summary><p>x</p></details>");
  expect(blocks(heading)).toEqual([{type:"details",children:[{type:"details-summary",children:["Head"]},{type:"paragraph",children:["x"]}]}]);
  expect(codes(heading)["block-structure"]).toBe(1);
 });
 it("nests sections up to the bound and lifts deeper ones",()=>{
  const nested=(depth:number)=>"<details><summary>S</summary>".repeat(depth)+"<p>leaf</p>"+"</details>".repeat(depth);
  const eight=staging(true).importHtml(nested(8));expect(eight.losses).toEqual([]);
  const nine=staging(true).importHtml(nested(9));expect(codes(nine)["block-structure"]).toBe(1);
  let node=blocks(nine)[0] as {type:string;children:unknown[]};
  for(let level=0;level<8;level++){expect(node.type).toBe("details");node=node.children[1] as typeof node;}
  expect(node).toEqual({type:"paragraph",children:["S"]});
 });
 it("keeps the original V1–V3 conversion: sections unwrap into ordinary flow",()=>{
  const value=staging(false).importHtml(html);
  const result=blocks(value);
  expect(JSON.stringify(result)).not.toContain("details");
  expect(result).toEqual([{type:"paragraph",children:["Title ","bold"]},{type:"paragraph",children:["Body"]},{type:"bullet-list",children:[{type:"list-item",children:[{type:"paragraph",children:["Item"]}]}]}]);
  expect(codes(value)).toEqual({"unsupported-attribute":1,"unsupported-element":2});
 });
 it("exports <details>/<summary>, falls back to an HTML block in Markdown and round trips",()=>{
  const nested=section(true,[t("Title "),t("bold",[{type:"breditor/strong",properties:{}}])],[para("b1","One"),para("b2",""),section(false,[t("Inner")],[para("b3","Deep\n\nlines")])]);
  const exported=staging(true).exportHtml(doc([nested]));
  if(!exported.ok)throw Error(exported.error);
  expect(exported.value).toBe('<details open><summary>Title <strong>bold</strong></summary><p style="white-space:pre-wrap">One</p><p style="white-space:pre-wrap"></p><details><summary>Inner</summary><p style="white-space:pre-wrap">Deep\n\nlines</p></details></details>');
  const back=staging(true).importHtml(exported.value);
  const markdown=staging(true).exportMarkdown(doc([nested]));
  if(!markdown.ok)throw Error(markdown.error);
  expect(codes(markdown)["markdown-feature"]).toBe(1);
  expect(markdown.value.startsWith("<details open>")).toBe(true);
  expect(markdown.value).not.toMatch(/\n[ \t]*\n/);
  const fromMarkdown=staging(true).importMarkdown(markdown.value);
  expect(blocks(fromMarkdown)).toEqual(blocks(back));
  expect(blocks(back)).toEqual([shape(nested)]);
  // A V3 owner unwraps the same Markdown HTML block into flow.
  expect(JSON.stringify(blocks(staging(false).importMarkdown(markdown.value)))).not.toContain("details");
 });
});
