import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(pageBreaks:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(pageBreaks?{supportsPageBreaks:()=>true,supportsDetails:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
const generated=new Set(["breditor/block-id"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape=(node:any):unknown=>node.kind==="text"?node.text:{type:node.type.slice(9),...(Object.keys(node.properties).some(k=>!generated.has(k))?{props:Object.fromEntries(Object.entries(node.properties).filter(([k])=>!generated.has(k)))}:{}),children:node.children.map(shape)};
function blocks(value:Result):unknown[]{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root.children.map(shape);}
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const t=(text:string)=>({kind:"text",text,formats:[]});
const para=(id:string,text:string)=>el("paragraph",{"block-id":id},text?[t(text)]:[]);
const P=(text:string)=>({type:"paragraph",children:text?[text]:[]});
const BREAK={type:"page-break",children:[]};
const word="<p class=MsoNormal>One</p><p class=MsoNormal><span style='font-size:12.0pt'><br clear=all style='mso-special-character:line-break;page-break-before:always'></span></p><p class=MsoNormal>Two</p>";
const docs='<p>One</p><hr style="page-break-before:always;display:none;"><p>Two</p>';

describe("candidate rich V4 page-break interchange",()=>{
 it("maps Word's <br clear=all> page break, alone or inside a paragraph",()=>{
  const value=staging(true).importHtml(word);
  expect(blocks(value)).toEqual([P("One"),BREAK,P("Two")]);expect(value.losses).toEqual([]);
  const inline=staging(true).importHtml("<p>One<br clear=all style='page-break-before:always'>Two</p>");
  expect(blocks(inline)).toEqual([P("One"),BREAK,P("Two")]);expect(inline.losses).toEqual([]);
  // Word's section break is a page break too.
  expect(blocks(staging(true).importHtml("<p>A</p><br clear=all style='page-break-before:always;mso-break-type:section-break'><p>B</p>"))).toEqual([P("A"),BREAK,P("B")]);
  // An ordinary <br> stays a line break.
  expect(blocks(staging(true).importHtml("<p>One<br>Two</p>"))).toEqual([P("One\nTwo")]);
 });
 it("maps Google Docs' hidden page-break <hr> and the exported <div>",()=>{
  const value=staging(true).importHtml(docs);
  expect(blocks(value)).toEqual([P("One"),BREAK,P("Two")]);expect(value.losses).toEqual([]);
  for(const html of ['<p>One</p><div style="break-after:page"></div><p>Two</p>','<p>One</p><div style="page-break-after: always"></div><p>Two</p>','<p>One</p><div style="break-before:page;page-break-before:always"></div><p>Two</p>']){
   const result=staging(true).importHtml(html);expect(blocks(result)).toEqual([P("One"),BREAK,P("Two")]);expect(result.losses).toEqual([]);
  }
  // Explicit carriers are exact: two in a row are two page breaks, and a leading one is kept.
  expect(blocks(staging(true).importHtml('<div style="break-after:page"></div><div style="break-after:page"></div><p>A</p>'))).toEqual([BREAK,BREAK,P("A")]);
  // A plain <hr> stays a horizontal rule.
  expect(blocks(staging(true).importHtml("<p>A</p><hr><p>B</p>"))).toEqual([P("A"),{type:"horizontal-rule",children:[]},P("B")]);
 });
 it("turns forced breaks on content blocks into page breaks, collapsing like CSS",()=>{
  const heading=staging(true).importHtml('<p>A</p><h1 style="page-break-before:always">Title</h1>');
  expect(blocks(heading)).toEqual([P("A"),BREAK,{type:"heading",props:{"breditor/level":1},children:["Title"]}]);expect(heading.losses).toEqual([]);
  // A break at the very start or end of the content forces nothing; an after/before pair is one break.
  expect(blocks(staging(true).importHtml('<h1 style="page-break-before:always">T</h1><p>A</p>'))).toEqual([{type:"heading",props:{"breditor/level":1},children:["T"]},P("A")]);
  expect(blocks(staging(true).importHtml('<p style="break-after:page">A</p><p style="break-before:page">B</p><p style="page-break-after:always">C</p>'))).toEqual([P("A"),BREAK,P("B"),P("C")]);
  expect(blocks(staging(true).importHtml('<p style="break-after:page">A</p><div style="break-after:page"></div><p>B</p>'))).toEqual([P("A"),BREAK,P("B")]);
  // Side-specific breaks still force a page but name a side the block cannot keep.
  const side=staging(true).importHtml('<p>A</p><p style="break-before:right">B</p>');
  expect(blocks(side)).toEqual([P("A"),BREAK,P("B")]);expect(codes(side)).toEqual({"style-approximation":1});
  // `auto` and `avoid` are not page breaks; `avoid` is still reported as before.
  expect(blocks(staging(true).importHtml('<p>A</p><p style="page-break-before:auto">B</p>'))).toEqual([P("A"),P("B")]);
  expect(codes(staging(true).importHtml('<p style="break-inside:avoid">A</p>'))).toEqual({"unsupported-style":1});
 });
 it("drops page breaks below the document root with block-structure",()=>{
  const quote=staging(true).importHtml('<blockquote><p>a</p><div style="break-after:page"></div><p>b</p></blockquote>');
  expect(blocks(quote)).toEqual([{type:"blockquote",children:[P("a"),P("b")]}]);expect(codes(quote)).toEqual({"block-structure":1});
  const item=staging(true).importHtml("<ul><li><br clear=all style='page-break-before:always'></li></ul>");
  expect(blocks(item)).toEqual([{type:"bullet-list",children:[{type:"list-item",children:[P("")]}]}]);expect(codes(item)["block-structure"]).toBeGreaterThanOrEqual(1);
  const cell=staging(true).importHtml('<table><tr><td><p>x</p><hr style="page-break-before:always;display:none"></td></tr></table>');
  expect(JSON.stringify(blocks(cell))).not.toContain("page-break");expect(codes(cell)["block-structure"]).toBe(1);
  const section=staging(true).importHtml('<details open><summary>S</summary><div style="break-after:page"></div></details>');
  expect(blocks(section)).toEqual([{type:"details",props:{"breditor/details-open":true},children:[{type:"details-summary",children:["S"]},P("")]}]);
 });
 it("keeps V1–V3 conversion exactly: no page breaks, the original notices",()=>{
  const wordV3=staging(false).importHtml(word);
  expect(blocks(wordV3)).toEqual([P("One"),P("\n"),P("Two")]);expect(codes(wordV3)).toEqual({"unsupported-attribute":1,"unsupported-style":2});
  const inline=staging(false).importHtml("<p>One<br clear=all style='page-break-before:always'>Two</p>");
  expect(blocks(inline)).toEqual([P("One\nTwo")]);expect(codes(inline)).toEqual({"unsupported-attribute":1,"unsupported-style":1});
  const docsV3=staging(false).importHtml(docs);
  expect(blocks(docsV3)).toEqual([P("One"),P("Two")]);expect(codes(docsV3)).toEqual({"removed-content":1});
  const div=staging(false).importHtml('<p>One</p><div style="break-after:page"></div><p>Two</p>');
  expect(blocks(div)).toEqual([P("One"),P("Two")]);expect(codes(div)).toEqual({"unsupported-style":1});
  const heading=staging(false).importHtml('<p>A</p><h1 style="page-break-before:always">T</h1>');
  expect(blocks(heading)).toEqual([P("A"),{type:"heading",props:{"breditor/level":1},children:["T"]}]);expect(codes(heading)).toEqual({"unsupported-style":1});
 });
 it("exports a page break as an empty forced-break <div> and round trips it",()=>{
  const source=doc([para("a","One"),el("page-break",{"block-id":"pb"}),para("b","Two")]);
  const html=staging(true).exportHtml(source);if(!html.ok)throw Error(html.error);
  expect(html.value).toBe('<p style="white-space:pre-wrap">One</p><div style="break-after:page;page-break-after:always"></div><p style="white-space:pre-wrap">Two</p>');
  expect(html.losses).toEqual([]);
  const back=staging(true).importHtml(html.value);expect(blocks(back)).toEqual([P("One"),BREAK,P("Two")]);expect(back.losses).toEqual([]);
  // Markdown has no page break: the block falls back to its safe HTML with markdown-feature.
  const markdown=staging(true).exportMarkdown(source);if(!markdown.ok)throw Error(markdown.error);
  expect(markdown.value).toBe('One\n\n<div style="break-after:page;page-break-after:always"></div>\n\nTwo');
  expect(codes(markdown)).toEqual({"markdown-feature":1});
  expect(blocks(staging(true).importMarkdown(markdown.value))).toEqual([P("One"),BREAK,P("Two")]);
  const v3=staging(false).importMarkdown(markdown.value);expect(blocks(v3)).toEqual([P("One"),P("Two")]);expect(codes(v3)).toEqual({"unsupported-style":2});
 });
});
