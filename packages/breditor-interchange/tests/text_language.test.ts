import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {canonicalLanguageTagV1} from "../src/language_tag.js";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(language:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(language?{supportsTextLanguage:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
function json(value:Result):string{if(!value.ok)throw Error(value.error);return value.value.structuredJson;}
function runs(value:Result):{text:string;lang:string|undefined}[]{
 const out:{text:string;lang:string|undefined}[]=[];
 const walk=(node:any)=>{if(node.kind==="text")out.push({text:node.text,lang:node.formats.find((f:any)=>f.type==="breditor/text-language")?.properties["breditor/language-tag"]});else node.children.forEach(walk);};
 walk(JSON.parse(json(value)).document.root);return out;
}
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const para=(runs:unknown[])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:runs});
const lang=(text:string,tag:string,extra:unknown[]=[])=>({kind:"text",text,formats:[...extra,{type:"breditor/text-language",properties:{"breditor/language-tag":tag}}]});

describe("candidate rich V4 text-language interchange",()=>{
 it("keeps the browser/Rust tag grammar (same table as Rust text_language.rs and the browser copy)",()=>{
  const table:readonly [string,string|null][]=[["en","en"],["EN","en"],["fr-ca","fr-CA"],["zh-hant-tw","zh-Hant-TW"],["es-419","es-419"],["de-CH-1996","de-CH-1996"],["sl-ROZAJ-BISKE","sl-rozaj-biske"],["art-lojban","art-lojban"],["abcdefgh-Abcd-123-abcde-abcdf-abcdg","abcdefgh-Abcd-123-abcde-abcdf-abcdg"],
   ["",null],["en_US",null],["x-private",null],["en-x-foo",null],["i-klingon",null],["zh-yue",null],["en-US-US",null],["de-1996-1996",null],["abcdefgh-Abcd-123-abcde-abcdf-abcdgh",null],["en--US",null],["abcd",null]];
  for(const [value,canonical] of table)expect(canonicalLanguageTagV1(value)).toBe(canonical);
 });
 it("maps inline lang and xml:lang to canonical tags for V4 owners",()=>{
  const value=staging(true).importHtml('<p>Hi <span lang="FR-ca">bonjour</span> <i xml:lang="de">Tag</i></p>');
  expect(runs(value)).toEqual([{text:"Hi ",lang:undefined},{text:"bonjour",lang:"fr-CA"},{text:" ",lang:undefined},{text:"Tag",lang:"de"}]);
  expect(value.losses).toEqual([]);
 });
 it("applies block-level and inherited lang to the block's runs, and lang=\"\" clears it",()=>{
  const value=staging(true).importHtml('<div lang="en-GB"><p>One <span lang="">two</span></p><p lang="ja">三</p><ul><li>item</li></ul></div>');
  expect(runs(value)).toEqual([{text:"One ",lang:"en-GB"},{text:"two",lang:undefined},{text:"三",lang:"ja"},{text:"item",lang:"en-GB"}]);
  expect(value.losses).toEqual([]);
 });
 it("reports malformed, private-use and extension tags and drops the inherited value",()=>{
  for(const tag of ["en_US","x-none","en-x-foo","de-u-co-phonebk","zh-yue","i-klingon","abcdefgh-Abcd-123-abcde-abcdf-abcdgh"]){
   const value=staging(true).importHtml(`<p lang="en">a<span lang="${tag}">b</span></p>`);
   expect(runs(value)).toEqual([{text:"a",lang:"en"},{text:"b",lang:undefined}]);expect(codes(value)["unsupported-attribute"]).toBe(1);
  }
  const both=staging(true).importHtml('<p><span lang="fr" xml:lang="de">x</span><span lang="it" xml:lang="IT">y</span></p>');
  expect(runs(both)).toEqual([{text:"x",lang:"fr"},{text:"y",lang:"it"}]);expect(codes(both)["unsupported-attribute"]).toBe(1);
 });
 it("keeps V1-V3 owners exact: lang and xml:lang are silently dropped",()=>{
  const value=staging(false).importHtml('<p lang="fr">Bonjour <span xml:lang="de">Tag</span> <span lang="x-bad">z</span></p>');
  expect(runs(value).every(run=>run.lang===undefined)).toBe(true);expect(value.losses).toEqual([]);
 });
 it("exports lang and round trips V4 HTML exactly",()=>{
  const source=doc([para([{kind:"text",text:"Hi ",formats:[]},lang("bonjour","fr-CA",[{type:"breditor/strong",properties:{}}])])]);
  const html=staging(true).exportHtml(source);if(!html.ok)throw Error(html.error);
  expect(html.value).toBe('<p style="white-space:pre-wrap">Hi <strong><span lang="fr-CA">bonjour</span></strong></p>');expect(html.losses).toEqual([]);
  expect(runs(staging(true).importHtml(html.value))).toEqual([{text:"Hi ",lang:undefined},{text:"bonjour",lang:"fr-CA"}]);
  // A V3 owner reads the same HTML without language and without notices.
  const old=staging(false).importHtml(html.value);expect(runs(old)).toEqual([{text:"Hi ",lang:undefined},{text:"bonjour",lang:undefined}]);expect(old.losses).toEqual([]);
 });
 it("falls back to safe HTML in Markdown with a notice and reimports the language",()=>{
  const md=staging(true).exportMarkdown(doc([para([lang("Grüß Gott","de-AT")])]));if(!md.ok)throw Error(md.error);
  expect(md.value).toBe('<p style="white-space:pre-wrap"><span lang="de-AT">Grüß Gott</span></p>');expect(codes(md)["markdown-feature"]).toBe(1);
  expect(runs(staging(true).importMarkdown(md.value))).toEqual([{text:"Grüß Gott",lang:"de-AT"}]);
  const plain=staging(true).exportMarkdown(doc([para([{kind:"text",text:"plain",formats:[]}])]));if(!plain.ok)throw Error(plain.error);
  expect(plain.value).toBe("plain");expect(plain.losses).toEqual([]);
 });
});
