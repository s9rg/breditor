import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(numbering:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(numbering?{supportsListNumbering:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
function root(value:Result){if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root;}
function json(value:Result):string{if(!value.ok)throw Error(value.error);return value.value.structuredJson;}
function lists(node:any):any[]{return node.kind==="element"?[...(node.type==="breditor/ordered-list"?[node]:[]),...node.children.flatMap(lists)]:[];}
const numbering=(list:any)=>({start:list.properties["breditor/start"],style:list.properties["breditor/list-style"],reversed:list.properties["breditor/list-reversed"]});
const codes=(r:Result)=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
describe("candidate rich V4 ordered-list numbering interchange",()=>{
 it("maps every HTML type token to its closed native code without losses",()=>{
  for(const [type,code] of [["1",1],["a",2],["A",3],["i",4],["I",5]] as const){
   const value=staging(true).importHtml(`<ol type="${type}" start="3"><li>One</li><li>Two</li></ol>`);
   expect(numbering(lists(root(value))[0])).toEqual({start:3,style:code,reversed:undefined});expect(value.losses).toEqual([]);
  }
 });
 it("maps list-style-type keywords, lets CSS win over the type hint and keeps a plain list unstyled",()=>{
  for(const [css,code] of [["decimal",1],["lower-alpha",2],["lower-latin",2],["upper-alpha",3],["upper-latin",3],["lower-roman",4],["upper-roman",5]] as const){
   const value=staging(true).importHtml(`<ol type="a" style="list-style-type:${css}"><li>One</li></ol>`);
   expect(numbering(lists(root(value))[0]).style).toBe(code);expect(value.losses).toEqual([]);
  }
  const plain=staging(true).importHtml("<ol><li>One</li></ol>");expect(numbering(lists(root(plain))[0])).toEqual({start:1,style:undefined,reversed:undefined});expect(plain.losses).toEqual([]);
 });
 it("imports reversed lists with an explicit start, defaulting to the item count as HTML does",()=>{
  const implicit=staging(true).importHtml("<ol reversed><li>A</li><li>B</li><li>C</li></ol>");
  expect(numbering(lists(root(implicit))[0])).toEqual({start:3,style:undefined,reversed:true});expect(implicit.losses).toEqual([]);
  const explicit=staging(true).importHtml('<ol reversed start="10" type="I"><li>A</li><li>B</li></ol>');
  expect(numbering(lists(root(explicit))[0])).toEqual({start:10,style:5,reversed:true});expect(explicit.losses).toEqual([]);
  // A reversed `value` continuation that would need a start below 1 restarts at 1 and is reported.
  const low=staging(true).importHtml('<ol reversed start="1"><li>A</li><li value="1">B</li></ol>');
  expect(lists(root(low)).map(numbering)).toEqual([{start:1,style:undefined,reversed:true},{start:1,style:undefined,reversed:true}]);expect(codes(low)["list-numbering"]).toBe(1);
 });
 it("keeps each nested list's own style without inheriting an ancestor's",()=>{
  const value=staging(true).importHtml('<ol type="I"><li>A<ol type="a"><li>x</li></ol><ol><li>y</li></ol></li></ol>');
  expect(lists(root(value)).map(numbering)).toEqual([{start:1,style:5,reversed:undefined},{start:1,style:2,reversed:undefined},{start:1,style:undefined,reversed:undefined}]);
 });
 it("reports unrepresentable markers on a numbering-capable owner",()=>{
  const value=staging(true).importHtml('<ol type="disc"><li>A</li></ol><ol style="list-style-type:square"><li>B</li></ol><ol style="list-style-type:georgian"><li>C</li></ol>');
  expect(lists(root(value)).map(numbering).every(n=>n.style===undefined)).toBe(true);expect(codes(value)["list-numbering"]).toBe(3);
 });
 it("keeps the original loss notices and drops the properties for V1–V3 owners",()=>{
  const value=staging(false).importHtml('<ol type="a" reversed><li>A</li><li>B</li></ol><ol style="list-style-type:upper-roman"><li>C</li></ol>');
  expect(lists(root(value)).map(numbering)).toEqual([{start:1,style:undefined,reversed:undefined},{start:1,style:undefined,reversed:undefined}]);
  expect(codes(value)).toEqual({"list-numbering":2,"unsupported-attribute":1});
 });
 it("exports type and reversed and round trips V4 HTML exactly",()=>{
  const adapter=staging(true),first=adapter.importHtml('<ol type="i" reversed start="4"><li>A</li><li>B</li></ol><ol type="1"><li>C</li></ol>');
  const html=adapter.exportHtml(json(first));if(!html.ok)throw Error(html.error);
  expect(html.value).toContain('<ol start="4" type="i" reversed>');expect(html.value).toContain('<ol start="1" type="1">');
  const back=adapter.importHtml(html.value);expect(lists(root(back)).map(numbering)).toEqual(lists(root(first)).map(numbering));expect(back.losses).toEqual([]);
 });
 it("keeps decimal lists in Markdown and falls back to reported HTML for letters, roman and reversal",()=>{
  const adapter=staging(true);
  for(const source of ['<ol type="1" start="2"><li>A</li></ol>','<ol start="2"><li>A</li></ol>']){
   const md=adapter.exportMarkdown(json(adapter.importHtml(source)));if(!md.ok)throw Error(md.error);expect(md.value).toBe("2. A");expect(md.losses).toEqual([]);
  }
  for(const source of ['<ol type="a"><li>A</li></ol>','<ol type="I"><li>A</li></ol>','<ol reversed><li>A</li><li>B</li></ol>']){
   const md=adapter.exportMarkdown(json(adapter.importHtml(source)));if(!md.ok)throw Error(md.error);
   expect(md.value).toMatch(/^<ol start="\d+"/);expect(codes(md as unknown as Result)["markdown-feature"]).toBe(1);
   const back=adapter.importMarkdown(md.value);expect(lists(root(back)).map(numbering)).toEqual(lists(root(adapter.importHtml(source))).map(numbering));
  }
 });
});
