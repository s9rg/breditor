import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(captions:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(captions?{supportsTableCaptions:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
// Structural shape without generated identities (block, table, row and column ids).
const generated=new Set(["breditor/block-id","breditor/table-id","breditor/row-id","breditor/column-id","breditor/columns","breditor/merges","breditor/retracted-merges"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape=(node:any):unknown=>node.kind==="text"?node.text:{type:node.type.slice(9),...(Object.keys(node.properties).some(k=>!generated.has(k))?{props:Object.fromEntries(Object.entries(node.properties).filter(([k])=>!generated.has(k)))}:{}),children:node.children.map(shape)};
function blocks(value:Result):unknown[]{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root.children.map(shape);}
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const t=(text:string,formats:unknown[]=[])=>({kind:"text",text,formats});
const para=(id:string,children:unknown[])=>el("paragraph",{"block-id":id},children);
const cell=(r:string,c:string,header=false)=>el("table-cell",{"block-id":`cell-${r}-${c}`,"column-id":c,header},[para(`p-${r}-${c}`,[t(`${r}${c}`)])]);
const table=(caption?:unknown,width=120)=>el("table",{"block-id":"tbl","table-id":"t","columns":[{id:"a",width},{id:"b",width}],merges:[],"retracted-merges":[]},[
 el("table-row",{"block-id":"row-1","row-id":"r1"},[cell("1","a",true),cell("1","b",true)]),
 el("table-row",{"block-id":"row-2","row-id":"r2"},[cell("2","a"),cell("2","b")]),
 ...(caption?[caption]:[])]);
const grid=[{type:"table-row",children:[{type:"table-cell",props:{"breditor/header":true},children:[{type:"paragraph",children:["A"]}]}]}];
const source='<table><caption>Sales <b>2026</b></caption><tr><th>A</th></tr></table>';

describe("candidate rich V4 table-caption interchange",()=>{
 it("imports <caption> as the table's trailing caption for V4 owners",()=>{
  const value=staging(true).importHtml(source);
  expect(blocks(value)).toEqual([{type:"table",children:[...grid,{type:"paragraph",children:["Sales ","2026"]}]}]);
  expect(value.losses).toEqual([]);
  // An empty caption stays an empty caption; a rowless table keeps its caption as flow.
  expect(blocks(staging(true).importHtml("<table><caption></caption><tr><td>A</td></tr></table>"))).toEqual([{type:"table",children:[{type:"table-row",children:[{type:"table-cell",props:{"breditor/header":false},children:[{type:"paragraph",children:["A"]}]}]},{type:"paragraph",children:[]}]}]);
  const rowless=staging(true).importHtml("<table><caption>Only</caption></table>");
  expect(blocks(rowless)).toEqual([{type:"paragraph",children:["Only"]}]);
  expect(codes(rowless)["table-geometry"]).toBe(1);
 });
 it("repairs block markup inside a caption and reports it",()=>{
  const heading=staging(true).importHtml("<table><caption><h2>Head</h2></caption><tr><th>A</th></tr></table>");
  expect(blocks(heading)).toEqual([{type:"table",children:[...grid,{type:"paragraph",children:["Head"]}]}]);
  expect(codes(heading)["block-structure"]).toBe(1);
  const extra=staging(true).importHtml("<table><caption><p>One</p><p>Two</p></caption><tr><th>A</th></tr></table>");
  expect(blocks(extra)).toEqual([{type:"paragraph",children:["Two"]},{type:"table",children:[...grid,{type:"paragraph",children:["One"]}]}]);
  expect(codes(extra)["block-structure"]).toBe(1);
  const list=staging(true).importHtml("<table><caption><ul><li>x</li></ul></caption><tr><th>A</th></tr></table>");
  expect(blocks(list)).toEqual([{type:"bullet-list",children:[{type:"list-item",children:[{type:"paragraph",children:["x"]}]}]},{type:"table",children:grid}]);
  expect(codes(list)["block-structure"]).toBe(1);
  // HTML has one caption per table: a second one keeps the original flow conversion.
  const two=staging(true).importHtml("<table><caption>A</caption><caption>B</caption><tr><th>A</th></tr></table>");
  expect(blocks(two)).toEqual([{type:"paragraph",children:["B"]},{type:"table",children:[...grid,{type:"paragraph",children:["A"]}]}]);
  expect(codes(two)["block-structure"]).toBe(1);
 });
 it("keeps the original V1–V3 conversion: caption text becomes flow before the table",()=>{
  const value=staging(false).importHtml(source);
  expect(blocks(value)).toEqual([{type:"paragraph",children:["Sales ","2026"]},{type:"table",children:grid}]);
  expect(codes(value)).toEqual({"block-structure":1});
  const rowless=staging(false).importHtml("<table><caption>Only</caption></table>");
  expect(blocks(rowless)).toEqual([{type:"paragraph",children:["Only"]}]);
  expect(codes(rowless)).toEqual({"block-structure":1,"table-geometry":1});
 });
 it("reports an explicit caption placement that the document model cannot represent",()=>{
  const placed=staging(true).importHtml(source.replace("<caption>",'<caption style="caption-side:top">'));
  expect(blocks(placed)).toEqual(blocks(staging(true).importHtml(source)));
  expect(codes(placed)).toEqual({"unsupported-style":1});
 });
 it("exports a leading <caption>, falls back to HTML in Markdown and round trips",()=>{
  const captioned=table(para("cap",[t("Legend "),t("bold",[{type:"breditor/strong",properties:{}}])]));
  const exported=staging(true).exportHtml(doc([captioned]));
  if(!exported.ok)throw Error(exported.error);
  expect(exported.value).toBe('<table><caption style="caption-side:bottom"><p style="white-space:pre-wrap">Legend <strong>bold</strong></p></caption><colgroup><col width="120"><col width="120"></colgroup><tbody><tr><th><p style="white-space:pre-wrap">1a</p></th><th><p style="white-space:pre-wrap">1b</p></th></tr><tr><td><p style="white-space:pre-wrap">2a</p></td><td><p style="white-space:pre-wrap">2b</p></td></tr></tbody></table>');
  expect(exported.losses).toEqual([]);
  const back=staging(true).importHtml(exported.value);
  expect(blocks(back)).toEqual([shape(captioned)]);
  expect(back.losses).toEqual([]);
  // GFM tables have no caption: the same table without one stays a Markdown table.
  const plain=staging(true).exportMarkdown(doc([table()]));
  if(!plain.ok)throw Error(plain.error);
  expect(plain.value).toBe("| 1a | 1b |\n| --- | --- |\n| 2a | 2b |");
  const markdown=staging(true).exportMarkdown(doc([captioned]));
  if(!markdown.ok)throw Error(markdown.error);
  expect(codes(markdown)).toEqual({"markdown-feature":1});
  expect(markdown.value.startsWith('<table><caption style="caption-side:bottom">')).toBe(true);
  expect(blocks(staging(true).importMarkdown(markdown.value))).toEqual([shape(captioned)]);
  // A V3 owner reading the same Markdown keeps the original caption conversion.
  expect(blocks(staging(false).importMarkdown(markdown.value))[0]).toEqual({type:"paragraph",children:["Legend ","bold"]});
  // A hidden (rowless) captioned table exports its caption text as a paragraph.
  const hidden=el("table",{"block-id":"tbl","table-id":"t","columns":[],merges:[],"retracted-merges":[]},[para("cap",[t("Kept")])]);
  const exportedHidden=staging(true).exportHtml(doc([hidden]));
  if(!exportedHidden.ok)throw Error(exportedHidden.error);
  expect(exportedHidden.value).toBe('<p style="white-space:pre-wrap">Kept</p>');
  expect(codes(exportedHidden)).toEqual({"table-geometry":1});
 });
});
