import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {exportDocx} from "../src/docx.js";
import {all,parseXml,unzip} from "./docx_support.js";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(bookmarks:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(bookmarks?{supportsBookmarks:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
const generated=new Set(["breditor/block-id"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape=(node:any):unknown=>node.kind==="text"?(node.formats.length?{text:node.text,formats:node.formats}:node.text):{type:node.type.slice(9),...(Object.keys(node.properties).some(k=>!generated.has(k))?{props:Object.fromEntries(Object.entries(node.properties).filter(([k])=>!generated.has(k)))}:{}),children:node.children.map(shape)};
function blocks(value:Result):unknown[]{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root.children.map(shape);}
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const linkFormat=(href:string,newWindow=false)=>({type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":newWindow}});
const t=(text:string,...formats:unknown[])=>({kind:"text",text,formats});
const LINK=(text:string,name:string)=>({text,formats:[linkFormat(`#${name}`)]});
const native=()=>[
 el("heading",{"block-id":"h","level":2,"bookmark":"intro"},[t("Intro")]),
 el("paragraph",{"block-id":"p"},[t("See "),t("intro",linkFormat("#intro")),t(".")]),
 el("code-block",{"block-id":"c","bookmark":"code"},[t("x")]),
];

describe("candidate rich V4 bookmark interchange",()=>{
 it("keeps the grammar an exact copy of the rich-content mirror",()=>{
  const ours=readFileSync(new URL("../src/bookmark.ts",import.meta.url),"utf8"),theirs=readFileSync(new URL("../../breditor-experimental-rich-content/src/bookmark.ts",import.meta.url),"utf8");
  const pattern=(source:string)=>/const namePattern=(\/.*\/);/.exec(source)?.[1];
  expect(pattern(ours)).toBe(pattern(theirs));expect(pattern(ours)).toBe("/^[A-Za-z][A-Za-z0-9_-]{0,63}$/");
 });
 it("exports anchors and fragment links and reimports them exactly into a V4 owner",()=>{
  const html=staging(true).exportHtml(doc(native()));
  if(!html.ok)throw Error(html.error);
  expect(html.value).toBe('<h2 id="bm-intro" style="white-space:pre-wrap">Intro</h2><p style="white-space:pre-wrap">See <a href="#bm-intro">intro</a>.</p><pre id="bm-code" style="white-space:pre-wrap"><code>x</code></pre>');
  expect(html.losses).toEqual([]);
  const back=staging(true).importHtml(html.value);
  expect(blocks(back)).toEqual([
   {type:"heading",props:{"breditor/level":2,"breditor/bookmark":"intro"},children:["Intro"]},
   {type:"paragraph",children:["See ",LINK("intro","intro"),"."]},
   {type:"code-block",props:{"breditor/bookmark":"code"},children:["x"]},
  ]);
  expect(back.losses).toEqual([]);
 });
 it("maps foreign anchors: block ids, <a name>/<a id> and #fragment links",()=>{
  const value=staging(true).importHtml('<h1 id="top">Title</h1><p><a name="Second"></a>Body <a href="#top">up</a> and <a href="#missing">gone</a></p>');
  expect(blocks(value)).toEqual([
   {type:"heading",props:{"breditor/level":1,"breditor/bookmark":"top"},children:["Title"]},
   {type:"paragraph",props:{"breditor/bookmark":"Second"},children:["Body ",LINK("up","top")," and ",LINK("gone","missing")]},
  ]);
  expect(value.losses).toEqual([]);
 });
 it("reports invalid, duplicate and extra anchors and invalid fragments",()=>{
  const value=staging(true).importHtml('<h1 id="h.abc">A</h1><p id="dup">B</p><p id="dup">C</p><p id="one"><a name="two"></a>D</p><p><a href="#1bad">x</a></p><p><a href="#ok" target="_blank">y</a></p>');
  expect(blocks(value)).toEqual([
   {type:"heading",props:{"breditor/level":1},children:["A"]},
   {type:"paragraph",props:{"breditor/bookmark":"dup"},children:["B"]},
   {type:"paragraph",children:["C"]},
   {type:"paragraph",props:{"breditor/bookmark":"one"},children:["D"]},
   {type:"paragraph",children:["x"]},
   {type:"paragraph",children:[LINK("y","ok")]},
  ]);
  expect(codes(value)).toEqual({"unsupported-attribute":4,"unsafe-link":1});
 });
 it("keeps the original V1–V3 conversion exactly",()=>{
  const value=staging(false).importHtml('<h1 id="top">Title</h1><p><a name="x"></a>Body <a href="#top">up</a></p>');
  expect(blocks(value)).toEqual([{type:"heading",props:{"breditor/level":1},children:["Title"]},{type:"paragraph",children:["Body up"]}]);
  expect(codes(value)).toEqual({"unsupported-attribute":1,"unsafe-link":1});
  const exported=staging(false).exportHtml(doc([el("paragraph",{"block-id":"p"},[t("a",linkFormat("#x"))])]));
  if(!exported.ok)throw Error(exported.error);
  expect(exported.value).toBe('<p style="white-space:pre-wrap">a</p>');expect(codes(exported)).toEqual({"unsafe-link":1});
 });
 it("falls back to exact HTML in Markdown and reimports it",()=>{
  const md=staging(true).exportMarkdown(doc([...native(),el("paragraph",{"block-id":"q"},[t("plain")])]));
  if(!md.ok)throw Error(md.error);
  expect(md.value).toContain('<h2 id="bm-intro"');expect(md.value).toContain('<a href="#bm-intro">intro</a>');expect(md.value.endsWith("plain")).toBe(true);
  expect(codes(md)).toEqual({"markdown-feature":3});
  const back=staging(true).importMarkdown(md.value);
  expect(blocks(back).slice(0,2)).toEqual([
   {type:"heading",props:{"breditor/level":2,"breditor/bookmark":"intro"},children:["Intro"]},
   {type:"paragraph",children:["See ",LINK("intro","intro"),"."]},
  ]);
  // A typed Markdown fragment link becomes an internal link for a V4 owner only.
  expect(blocks(staging(true).importMarkdown("[up](#top)"))).toEqual([{type:"paragraph",children:[LINK("up","top")]}]);
 });
});

describe("candidate rich V4 bookmarks in DOCX",()=>{
 const xml=(json:string)=>{const result=exportDocx(json);if(!result.ok)throw Error(result.error);const part=unzip(result.value).find(f=>f.name==="word/document.xml")!;return {result,root:parseXml(new TextDecoder().decode(part.data))};};
 const source=(children:unknown[])=>JSON.stringify({format:"breditor/document",formatVersion:2,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}});
 it("maps bookmarks to w:bookmarkStart/End and internal links to w:hyperlink w:anchor",()=>{
  const {result,root}=xml(source([...native(),el("paragraph",{"block-id":"q"},[t("gone",linkFormat("#missing"))])]));
  const starts=all(root,"w:bookmarkStart"),ends=all(root,"w:bookmarkEnd");
  expect(starts.map(s=>[s.attributes["w:id"],s.attributes["w:name"]])).toEqual([["0","intro"],["1","code"]]);
  expect(ends.map(e=>e.attributes["w:id"])).toEqual(["0","1"]);
  const links=all(root,"w:hyperlink");
  expect(links.map(l=>[l.attributes["w:anchor"],l.attributes["r:id"]])).toEqual([["intro",undefined]]);
  // The dangling link keeps its text without a hyperlink.
  expect(result.losses.map(l=>l.code)).toContain("unsafe-link");
 });
});
