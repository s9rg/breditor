// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError,staticInlineCatalogV1,staticInlineCatalogV4,staticInlineRecipesV1,staticInlineRecipesV4} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import {createStandardRichInlinePresentationV1} from "../../breditor-experimental-rich-content/src/standard_inline_v1.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {envelope,f,fingerprint,link,p,text,type Json} from "./static_document_fixture.js";

const lang=(tag:unknown)=>f("breditor/text-language",{"breditor/language-tag":tag});
const html=(children:Json[])=>renderStaticDocument(envelope(children),{fragment:true});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};
const catalogJson=(formats:readonly {kind:string}[])=>JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...formats].sort((a,b)=>a.kind<b.kind?-1:1)});

describe("static renderer: candidate rich V4 text language",()=>{
 it("emits an inert lang span from canonical admitted tags only",()=>{
  expect(html([p("p",[text("Bonjour",[lang("fr-CA")])])])).toBe('<p data-rich-block="p" data-rich-text="p"><span data-rich-format="breditor/text-language" class="breditor-text-language" lang="fr-CA">Bonjour</span></p>');
  for(const bad of ["fr-ca","EN","en_US","x-private","zh-yue","a","abcdefgh-Abcd-123-abcde-abcdf-abcdgh",7,true])
   expect(code(()=>html([p("p",[text("x",[lang(bad)])])]))).toBe("format");
  expect(code(()=>html([p("p",[text("x",[f("breditor/text-language",{})])])]))).toBe("format");
  expect(code(()=>html([p("p",[text("x",[f("breditor/text-language",{"breditor/language-tag":"en","breditor/x":"y"})])])]))).toBe("format");
 });
 it("keeps the V1 recipe table exact and orders link outside language",()=>{
  expect(staticInlineCatalogV1).toHaveLength(12);expect(staticInlineCatalogV4).toHaveLength(13);
  expect(staticInlineRecipesV4.filter(r=>r.formatKind!=="breditor/text-language").map(r=>r.formatKind)).toEqual(staticInlineRecipesV1.map(r=>r.formatKind));
  expect(staticInlineRecipesV4[0]!.formatKind).toBe("breditor-inline/link");
  expect(html([p("p",[text("go",[link("https://example.test/"),lang("de")])])])).toContain('<a data-rich-format="breditor-inline/link" class="breditor-link" href="https://example.test/"><span data-rich-format="breditor/text-language" class="breditor-text-language" lang="de">go</span></a>');
 });
 it("compiles the identical recipe table and DOM as the live V4 presentation",()=>{
  const presentation=createStandardRichInlinePresentationV1(catalogJson(staticInlineCatalogV4));
  expect(staticInlineRecipesV4).toEqual(presentation.recipesOuterToInner);
  const document=envelope([p("p",[text("A",[lang("en-GB")]),text("B",[f("breditor/strong"),lang("zh-Hant-TW")]),text("C",[link("https://example.test/a",true),f("breditor-inline/italic"),lang("sr-Latn-RS")])])]);
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{inlinePresentation:presentation});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const spans=(root:Element)=>[...root.querySelectorAll("[data-rich-format]")].map(e=>[e.tagName,e.getAttribute("data-rich-format"),e.getAttribute("lang"),e.className,e.textContent]);
  expect(spans(host)).toEqual(spans(live));
  expect([...host.querySelectorAll("[lang]")].map(e=>e.getAttribute("lang"))).toEqual(["en-GB","zh-Hant-TW","sr-Latn-RS"]);
 });
});
