import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {isMentionId,isMentionKind,isMentionLabel} from "../src/mention.js";
// Loaded at runtime through a non-literal specifier so this package's test typecheck (rootDir ".") does not
// pull the rich-content source tree into its program; the parity assertions below still run against it.
interface RichMentionPredicates {isRichMentionKind(value:unknown):boolean;isRichMentionId(value:unknown):boolean;isRichMentionLabel(value:unknown):boolean}
const richMentionModule:string=new URL("../../breditor-experimental-rich-content/src/mention.ts",import.meta.url).pathname;
const rich=await import(/* @vite-ignore */ richMentionModule) as RichMentionPredicates;
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(mentions:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(mentions?{supportsMentions:()=>true}:{})};
 return createRichInterchange(owner);
}
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
function runs(value:Result):{text:string;mention:string|undefined;bold:boolean}[]{
 if(!value.ok)throw Error(value.error);const out:{text:string;mention:string|undefined;bold:boolean}[]=[];
 const walk=(node:any)=>{if(node.kind==="text"){const m=node.formats.find((f:any)=>f.type==="breditor/mention")?.properties;out.push({text:node.text,mention:m?`${m["breditor/mention-kind"]}:${m["breditor/mention-id"]}:${m["breditor/mention-label"]}`:undefined,bold:node.formats.some((f:any)=>f.type==="breditor/strong")});}else node.children.forEach(walk);};
 walk(JSON.parse(value.value.structuredJson).document.root);return out;
}
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const para=(runs:unknown[])=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:runs});
const mention=(kind:string,id:string,label:string)=>({type:"breditor/mention",properties:{"breditor/mention-id":id,"breditor/mention-kind":kind,"breditor/mention-label":label}});
const ann=mention("user","u-1","Ann"),strong={type:"breditor/strong",properties:{}};
const run=(text:string,formats:unknown[]=[])=>({kind:"text",text,formats});

describe("candidate rich V4 mention interchange",()=>{
 it("keeps the grammar identical to the rich-content copy (and Rust mention.rs)",()=>{
  const values=["","a","user","page","tag","User","u-1","-a","a b","Ann"," Ann","Ann ","A\nB","A ","A‮","﻿Ann","é".repeat(128),`${"é".repeat(128)}a`,"a".repeat(128),"a".repeat(129),"A\uD800","日本"];
  for(const value of values){expect(isMentionKind(value)).toBe(rich.isRichMentionKind(value));expect(isMentionId(value)).toBe(rich.isRichMentionId(value));expect(isMentionLabel(value)).toBe(rich.isRichMentionLabel(value));}
 });
 it("exports one entity span per mention around its styled pieces and round trips V4 HTML exactly",()=>{
  const source=doc([para([run("Hi "),run("@A",[ann]),run("nn",[ann,strong]),run(" & "),run("@Ann@Ann",[ann])])]);
  const html=staging(true).exportHtml(source);if(!html.ok)throw Error(html.error);
  const chip='<span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">';
  expect(html.value).toBe(`<p style="white-space:pre-wrap">Hi ${chip}@A<strong>nn</strong></span> &amp; ${chip}@Ann</span>${chip}@Ann</span></p>`);expect(html.losses).toEqual([]);
  const back=staging(true).importHtml(html.value);
  expect(runs(back)).toEqual([{text:"Hi ",mention:undefined,bold:false},{text:"@A",mention:"user:u-1:Ann",bold:false},{text:"nn",mention:"user:u-1:Ann",bold:true},{text:" & ",mention:undefined,bold:false},{text:"@Ann@Ann",mention:"user:u-1:Ann",bold:false}]);
  expect(back.losses).toEqual([]);
 });
 it("imports only the exact span shape for V4 owners; anything else stays text",()=>{
  for(const html of [
   '<p><span class="breditor-mention" data-mention-kind="team" data-mention-id="u">@Ann</span></p>',
   '<p><span class="breditor-mention" data-mention-kind="user" data-mention-id="u 1">@Ann</span></p>',
   '<p><span class="breditor-mention" data-mention-kind="user" data-mention-id="u">Ann</span></p>',
   '<p><span class="breditor-mention" data-mention-kind="user" data-mention-id="u">@</span></p>',
   '<p><span class="breditor-mention" data-mention-kind="user" data-mention-id="u">@A  B</span></p>',
   '<p><span class="breditor-mention" data-mention-kind="user">@Ann</span></p>',
   '<p><span data-mention-kind="user" data-mention-id="u">@Ann</span></p>',
   '<p><a href="https://example.com/">@Ann</a></p>',
  ]){const value=staging(true).importHtml(html);expect(runs(value).every(r=>r.mention===undefined),html).toBe(true);}
 });
 it("keeps V1-V3 owners exact: a mention span imports as its plain @label text",()=>{
  const html='<p>Hi <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span></p>';
  const old=staging(false).importHtml(html);expect(runs(old)).toEqual([{text:"Hi @Ann",mention:undefined,bold:false}]);
  expect(Object.keys(codes(old)).every(code=>code==="unsupported-attribute")).toBe(true);
 });
 it("falls back to safe HTML in Markdown with a notice and reimports the mention into a V4 owner",()=>{
  const md=staging(true).exportMarkdown(doc([para([run("Ping "),run("@Ann",[ann])])]));if(!md.ok)throw Error(md.error);
  expect(md.value).toBe('<p style="white-space:pre-wrap">Ping <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span></p>');expect(codes(md)["markdown-feature"]).toBe(1);
  expect(runs(staging(true).importMarkdown(md.value))).toEqual([{text:"Ping ",mention:undefined,bold:false},{text:"@Ann",mention:"user:u-1:Ann",bold:false}]);
  expect(runs(staging(false).importMarkdown(md.value))).toEqual([{text:"Ping @Ann",mention:undefined,bold:false}]);
  // Typed Markdown "@name" is ordinary text: Markdown has no mention syntax.
  expect(runs(staging(true).importMarkdown("Hi @Ann"))).toEqual([{text:"Hi @Ann",mention:undefined,bold:false}]);
 });
});
