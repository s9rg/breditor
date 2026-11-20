// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError,staticInlineCatalogV4} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import {createStandardRichInlinePresentationV1} from "../../breditor-experimental-rich-content/src/standard_inline_v1.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {el,envelope,fingerprint,link,p,text,type Json} from "./static_document_fixture.js";

const html=(children:Json[])=>renderStaticDocument(envelope(children),{fragment:true});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};
const heading=(id:string,bookmark:string)=>el("heading",{"block-id":id,level:2,bookmark},[text("Intro")]);

describe("static renderer: candidate rich V4 bookmarks and internal links",()=>{
 it("anchors bookmarked blocks and points internal links at them",()=>{
  expect(html([heading("h","intro"),p("p",[text("go",[link("#intro")])])])).toBe(
   '<h2 data-rich-block="h" data-rich-text="h" id="bm-intro" data-rich-bookmark="intro">Intro</h2><p data-rich-block="p" data-rich-text="p"><a data-rich-format="breditor-inline/link" class="breditor-link" href="#bm-intro" data-rich-internal-link="intro">go</a></p>');
  // A forward reference resolves too (admission sees the whole tree first).
  expect(html([p("p",[text("go",[link("#later")])]),el("code-block",{"block-id":"c",bookmark:"later"},[text("x")])])).toContain('href="#bm-later"');
  expect(html([el("code-block",{"block-id":"c",bookmark:"later"},[text("x")])])).toBe('<pre data-rich-block="c" data-rich-text="c" id="bm-later" data-rich-bookmark="later"><code>x</code></pre>');
 });
 it("marks a dangling internal link and never invents an href",()=>{
  expect(html([p("p",[text("go",[link("#gone")])])])).toBe('<p data-rich-block="p" data-rich-text="p"><a data-rich-format="breditor-inline/link" class="breditor-link" data-rich-internal-link="gone" data-rich-link-broken="">go</a></p>');
  // A new-window `#` link is not an internal link (V4 never admits one); it stays without an href.
  expect(html([p("p",[text("go",[link("#gone",true)])])])).not.toContain("data-rich-internal-link");
  // External links are unchanged.
  expect(html([p("p",[text("go",[link("https://example.com/#x")])])])).toContain('href="https://example.com/#x"');
 });
 it("rejects invalid, duplicate and misplaced bookmarks",()=>{
  for(const bad of ["","1a","a b","é",7,null,"a".repeat(65)])expect(code(()=>html([heading("h",bad as string)]))).toBe("property");
  expect(code(()=>html([heading("h","x"),p("p",[],{bookmark:"x"})]))).toBe("property");
  expect(code(()=>html([el("blockquote",{"block-id":"q",bookmark:"x"},[p("p")])]))).toBe("property");
 });
 it("matches the live renderer's anchors and link attributes",()=>{
  const document=envelope([heading("h","intro"),p("p",[text("a",[link("#intro")]),text(" b",[link("#gone")]),text(" c",[link("https://example.com/")])]),el("code-block",{"block-id":"c",bookmark:"code"},[text("x")]),p("q",[text("plain")])]);
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)});
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{inlinePresentation:createStandardRichInlinePresentationV1(catalogJson),bookmarks:true});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const attributes=(element:Element)=>Object.fromEntries([...element.attributes].map(a=>[a.name,a.value]));
  const read=(root:Element)=>({
   anchors:[...root.querySelectorAll("[data-rich-bookmark]")].map(element=>({tag:element.tagName,...attributes(element)})),
   links:[...root.querySelectorAll("a")].map(attributes),
  });
  expect(read(host)).toEqual(read(live));
  expect(read(host).anchors).toHaveLength(2);expect(read(host).links).toHaveLength(3);
 });
});
