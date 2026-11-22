import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {exportDocx} from "../src/docx.js";
import {isRubyAnnotation} from "../src/ruby.js";
import {all,kids,parseXml,textContent,unzip} from "./docx_support.js";
// Runtime import keeps the rich-content source tree out of this package's typecheck program.
interface RichRubyPredicates {isRichRubyAnnotation(value:unknown):boolean}
const richRubyModule:string=new URL("../../breditor-experimental-rich-content/src/ruby.ts",import.meta.url).pathname;
const rich=await import(/* @vite-ignore */ richRubyModule) as RichRubyPredicates;
/** Parser-unit staging owner. Real native admission is covered by the rich-browser Playwright spec. */
function staging(ruby:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(ruby?{supportsRubyAnnotations:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
function runs(value:Result):{text:string;ruby:string|undefined;bold:boolean}[]{
 if(!value.ok)throw Error(value.error);const out:{text:string;ruby:string|undefined;bold:boolean}[]=[];
 const walk=(node:any)=>{if(node.kind==="text")out.push({text:node.text,ruby:node.formats.find((f:any)=>f.type==="breditor-ruby/ruby")?.properties["breditor-ruby/annotation"],bold:node.formats.some((f:any)=>f.type==="breditor/strong")});else node.children.forEach(walk);};
 walk(JSON.parse(value.value.structuredJson).document.root);return out;
}
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const para=(children:unknown[])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children});
const ruby=(annotation:string)=>({type:"breditor-ruby/ruby",properties:{"breditor-ruby/annotation":annotation}});
const strong={type:"breditor/strong",properties:{}};
const run=(text:string,formats:unknown[]=[])=>({kind:"text",text,formats});

describe("opt-in ruby extension interchange",()=>{
 it("keeps the annotation policy identical to the rich-content copy (and Rust ruby_v1.rs)",()=>{
  for(const value of ["","a","かんじ"," かん","かん ","か\nん","か\u0007ん","\u202Ex","x\u2066","\u3000x","x".repeat(256),"x".repeat(257),"あ".repeat(85),"あ".repeat(86),"a\uD800",5,null])
   expect(isRubyAnnotation(value)).toBe(rich.isRichRubyAnnotation(value));
 });
 it("imports base/rt pairs, rb wrappers and ignores rp for ruby-capable owners",()=>{
  const value=staging(true).importHtml("<p>私は<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>と<ruby><b>東</b><rt>とう</rt>京<rt> きょう </rt></ruby>。<ruby><rb>明</rb><rt>あ</rt></ruby></p>");
  expect(runs(value)).toEqual([{text:"私は",ruby:undefined,bold:false},{text:"漢字",ruby:"かんじ",bold:false},{text:"と",ruby:undefined,bold:false},{text:"東",ruby:"とう",bold:true},{text:"京",ruby:"きょう",bold:false},{text:"。",ruby:undefined,bold:false},{text:"明",ruby:"あ",bold:false}]);
  expect(value.losses).toEqual([]);
 });
 it("keeps the base and reports a dropped reading when it is empty, outside the policy or has no base",()=>{
  const value=staging(true).importHtml(`<p><ruby>a<rt></rt></ruby><ruby>b<rt>${"x".repeat(257)}</rt></ruby><ruby><rt>orphan</rt></ruby><ruby>c</ruby><ruby>d<rtc>x</rtc><rt>e</rt></ruby></p>`);
  expect(runs(value)).toEqual([{text:"abc",ruby:undefined,bold:false},{text:"d",ruby:"e",bold:false}]);
  expect(codes(value)).toEqual({"removed-content":2,"unsupported-element":1});
 });
 it("keeps other owners exact: ruby markup is unsupported and its text flows inline",()=>{
  const value=staging(false).importHtml("<p><ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby></p>");
  expect(runs(value)).toEqual([{text:"漢字(かんじ)",ruby:undefined,bold:false}]);
  expect(codes(value)["unsupported-element"]).toBe(4);
 });
 it("exports one <ruby> per group around its styled base and round trips HTML",()=>{
  const source=doc([para([run("私は"),run("漢",[strong,ruby("かんじ")]),run("字",[ruby("かんじ")]),run("と"),run("東",[ruby("とう")]),run("京",[ruby("きょう")])])]);
  const html=staging(true).exportHtml(source);if(!html.ok)throw Error(html.error);
  expect(html.value).toBe('<p style="white-space:pre-wrap">私は<ruby><strong>漢</strong>字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>と<ruby>東<rp>(</rp><rt>とう</rt><rp>)</rp></ruby><ruby>京<rp>(</rp><rt>きょう</rt><rp>)</rp></ruby></p>');
  expect(html.losses).toEqual([]);
  expect(runs(staging(true).importHtml(html.value))).toEqual([{text:"私は",ruby:undefined,bold:false},{text:"漢",ruby:"かんじ",bold:true},{text:"字",ruby:"かんじ",bold:false},{text:"と",ruby:undefined,bold:false},{text:"東",ruby:"とう",bold:false},{text:"京",ruby:"きょう",bold:false}]);
  // An annotation outside the policy keeps the base and reports the dropped reading; text is escaped.
  const odd=staging(true).exportHtml(doc([para([run("a",[ruby(" x")]),run("<b>",[ruby("<&>")])])]));if(!odd.ok)throw Error(odd.error);
  expect(odd.value).toBe('<p style="white-space:pre-wrap">a<ruby>&lt;b&gt;<rp>(</rp><rt>&lt;&amp;&gt;</rt><rp>)</rp></ruby></p>');expect(codes(odd)).toEqual({"removed-content":1});
 });
 it("falls back to exact HTML in Markdown with a notice and reimports the annotation",()=>{
  const md=staging(true).exportMarkdown(doc([para([run("漢字",[ruby("かんじ")]),run("です")])]));if(!md.ok)throw Error(md.error);
  expect(md.value).toBe('<p style="white-space:pre-wrap"><ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>です</p>');expect(codes(md)["markdown-feature"]).toBe(1);
  expect(runs(staging(true).importMarkdown(md.value))).toEqual([{text:"漢字",ruby:"かんじ",bold:false},{text:"です",ruby:undefined,bold:false}]);
 });
 it("writes DOCX w:ruby with the reading in w:rt and the styled base in w:rubyBase",()=>{
  const source=JSON.stringify({format:"breditor/document",formatVersion:2,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[run("私は"),run("漢",[strong,ruby("かんじ")]),run("字",[ruby("かんじ")]),run("です")]}]}});
  const result=exportDocx(source);if(!result.ok)throw Error(result.error);expect(result.losses).toEqual([]);
  const part=unzip(result.value).find(file=>file.name==="word/document.xml")!,xml=parseXml(new TextDecoder().decode(part.data));
  const rubies=all(xml,"w:ruby");expect(rubies).toHaveLength(1);
  const r=rubies[0]!;expect(kids(r).map(c=>c.name)).toEqual(["w:rubyPr","w:rt","w:rubyBase"]);
  expect(textContent(kids(r,"w:rt")[0]!)).toBe("かんじ");expect(textContent(kids(r,"w:rubyBase")[0]!)).toBe("漢字");
  expect(all(kids(r,"w:rubyBase")[0]!,"w:b")).toHaveLength(1);
  expect(kids(kids(r,"w:rubyPr")[0]!).map(c=>c.name)).toEqual(["w:rubyAlign","w:hps","w:hpsRaise","w:hpsBaseText","w:lid"]);
  // The base text stays in reading order around the ruby run (the test helper does not descend into w:ruby).
  expect(textContent(all(xml,"w:p")[0]!)).toBe("私はです");
 });
});
