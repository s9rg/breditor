// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import {createRichInlinePresentation} from "../src/inline_presentation.js";
import {canonicalTextLanguage,encodeTextLanguageIntent,richTextLanguageRecipeV4,textLanguageControls,textLanguageOf} from "../src/text_language.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import type {RichCoreEditor,RichInlineFormatState,RichView,RichWasmModule} from "../src/core.js";
import {compileStandardRichProfileV4} from "../index.js";
import {staticInlineCatalogV1,staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"cd".repeat(32)}`;
const catalog=(formats:readonly {kind:string}[])=>JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...formats].sort((a,b)=>a.kind<b.kind?-1:1)});
const catalogV4=catalog(staticInlineCatalogV4),catalogV1=catalog(staticInlineCatalogV1);
const lang=(tag:string)=>({type:"breditor/text-language",properties:{"breditor/language-tag":tag}});
function view(runs:unknown[],selection:RichView["selection"]=null):RichView{
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:runs}]};
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root}),readOnly:false,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView;
}
const range={kind:"text" as const,anchor:{block:"p",offset:"0",affinity:"after" as const},focus:{block:"p",offset:"3",affinity:"after" as const}};
function owner(language:1|2|3|4,state:RichInlineFormatState={kind:"unset"},capable=language===4){
 const read=(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:kind==="breditor/text-language"?state:{kind:"unset"}});
 return {supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:read,richLanguageVersion:()=>language,supportsListNumbering:()=>capable,supportsTextLanguage:()=>capable,supportsImageLinks:()=>capable,supportsDetails:()=>capable,supportsTableCaptions:()=>capable,supportsPageBreaks:()=>capable,supportsBlockLayout:()=>language>=3,
  blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})} as unknown as RichCoreEditor;
}

describe("candidate rich V4 language tag grammar (mirrors Rust text_language.rs)",()=>{
 it("canonicalizes case and rejects everything outside the bounded grammar",()=>{
  for(const [input,canonical] of [["en","en"],["EN","en"],["fr-ca","fr-CA"],["zh-hant-tw","zh-Hant-TW"],["sr-LATN-rs","sr-Latn-RS"],["es-419","es-419"],["de-CH-1996","de-CH-1996"],["sl-ROZAJ-BISKE","sl-rozaj-biske"],["hy-latn-it-arevela","hy-Latn-IT-arevela"],["art-lojban","art-lojban"],["abcde","abcde"],["abcdefgh-Abcd-123-abcde-abcdf-abcdg","abcdefgh-Abcd-123-abcde-abcdf-abcdg"]])
   expect(canonicalTextLanguage(input)).toBe(canonical);
  for(const bad of ["","e","eng1","abcd","abcdefghi","en_US","en-","-en","en--US","en-u-co-phonebk","x-private","en-x-foo","i-klingon","zh-yue","en-US-US","de-1996-1996","en-a","en-Latn-Latn","en US","é","en-12","en-1234a6789","abcdefgh-Abcd-123-abcde-abcdf-abcdgh",7,null,undefined])
   expect(canonicalTextLanguage(bad)).toBeNull();
  expect(textLanguageOf(lang("fr-CA"))).toBe("fr-CA");expect(textLanguageOf(lang("fr-ca"))).toBeUndefined();
 });
});

describe("candidate rich V4 language rendering",()=>{
 it("emits an inert lang span only for canonical admitted tags and never for V1 catalogs",()=>{
  const presentation=createStandardRichInlinePresentationV1(catalogV4);
  expect(presentation.recipesOuterToInner.find(r=>r.formatKind==="breditor/text-language")).toMatchObject({element:"span",classes:["breditor-text-language"],attributes:{kind:"safeLanguageTagV1",propertyName:"breditor/language-tag"}});
  // The link stays outermost; language wraps the other formats.
  expect(presentation.recipesOuterToInner[0]!.formatKind).toBe("breditor-inline/link");
  const surface=document.createElement("div");
  render(surface,presentationModel(view([{kind:"text",text:"Bonjour",formats:[{type:"breditor/strong",properties:{}},lang("fr-CA")]},{kind:"text",text:" x",formats:[lang("fr-ca")]}]),"original"),{inlinePresentation:presentation});
  const spans=surface.querySelectorAll("span.breditor-text-language");
  expect(spans).toHaveLength(2);
  expect(spans[0]!.getAttribute("lang")).toBe("fr-CA");expect(spans[0]!.getAttribute("data-rich-format")).toBe("breditor/text-language");
  expect(spans[0]!.textContent).toBe("Bonjour");expect(spans[0]!.closest("strong")??spans[0]!.querySelector("strong")).not.toBeNull();
  // A non-canonical stored value is never echoed: the span stays inert.
  expect(spans[1]!.hasAttribute("lang")).toBe(false);
  expect(createStandardRichInlinePresentationV1(catalogV1).recipesOuterToInner.some(r=>r.formatKind==="breditor/text-language")).toBe(false);
 });
 it("requires an explicit recipe in a custom V4 presentation and accepts the exported one",()=>{
  const plain=catalog([{kind:"breditor/strong",revision:1,properties:[]},staticInlineCatalogV4.find(f=>f.kind==="breditor/text-language")!] as never);
  expect(()=>createRichInlinePresentation(plain,{recipes:[{formatKind:"breditor/strong",element:"strong"}]})).toThrow("coverage");
  const custom=createRichInlinePresentation(plain,{recipes:[{formatKind:"breditor/strong",element:"strong"},richTextLanguageRecipeV4]});
  expect(custom.recipesOuterToInner.map(r=>r.formatKind).sort()).toEqual(["breditor/strong","breditor/text-language"]);
  // The language policy is bound to its exact span/class signature and property domain.
  expect(()=>createRichInlinePresentation(plain,{recipes:[{formatKind:"breditor/strong",element:"strong"},{...richTextLanguageRecipeV4,element:"em"}]})).toThrow();
  expect(()=>createRichInlinePresentation(plain,{recipes:[{formatKind:"breditor/strong",element:"strong"},{...richTextLanguageRecipeV4,classes:["other"]}]})).toThrow();
 });
});

describe("candidate rich V4 Language toolbar controls",()=>{
 const context=(core:RichCoreEditor,selection:RichView["selection"]=range)=>({core,model:presentationModel(view([{kind:"text",text:"Hello",formats:[]}],selection),"original"),allocate:()=>"id",stamp:()=>({replica:"1",counter:"1",lamport:"1"})});
 it("reads the native state, validates and canonicalizes input, and clears explicitly",()=>{
  const [set,clear]=textLanguageControls(owner(4,{kind:"uniform",format:lang("de-CH")}));
  expect(set!.id).toBe("text-language");expect(set!.label).toBe("Language");expect(set!.fields?.[0]).toMatchObject({type:"text",maxLength:35});
  expect(set!.read()).toEqual({kind:"uniform",values:{value:"de-CH"}});
  expect(set!.language({value:" FR-ca "})).toEqual({language:"fr-CA"});
  for(const bad of ["","  ","en_US","x-private","zh-yue","i-klingon","abcdefgh-Abcd-123-abcde-abcdf-abcdgh"])expect(()=>set!.language({value:bad})).toThrow();
  expect(clear!.id).toBe("reset-text-language");expect(clear!.language({})).toEqual({language:null});
  expect(textLanguageControls(owner(4,{kind:"mixed",presentEverywhere:false}))[0]!.read()).toEqual({kind:"mixed"});
 });
 it("is part of the V4 toolbar only and binds to its own owner",()=>{
  const presentation=createStandardRichInlinePresentationV1(catalogV4),core=owner(4,{kind:"uniform",format:lang("en")});
  const toolbar=createRichToolbarV4(core,presentation),set=toolbar.find(c=>c.id==="text-language")!,clear=toolbar.find(c=>c.id==="reset-text-language")!;
  expect(set.command(context(core),undefined,{value:"ja"})).toEqual({kind:"setTextLanguage",data:{language:"ja"}});
  expect(clear.command(context(core))).toEqual({kind:"setTextLanguage",data:{language:null}});
  expect(set.enabled(context(core))).toBe(true);expect(set.enabled(context(core,null))).toBe(false);
  const plain=owner(4);expect(createRichToolbarV4(plain,presentation).find(c=>c.id==="reset-text-language")!.enabled(context(plain))).toBe(false);expect(clear.enabled(context(core))).toBe(true);
  expect(()=>set.command(context(owner(4)),undefined,{value:"ja"})).toThrow("different Rust owner");
  expect(createLayoutRichToolbarV3(owner(3),presentation).some(c=>c.id==="text-language")).toBe(false);
  for(const language of [1,2,3] as const)expect(()=>textLanguageControls(owner(language))).toThrow("rich V4 owner");
  expect(()=>textLanguageControls(owner(4,{kind:"unset"},false))).toThrow("rich V4 owner");
 });
});

describe("candidate rich V4 language Wasm facade boundary",()=>{
 function stringResult(value:string){return {status:"value",takeValue:()=>value,free:vi.fn()};}
 function local(binding:object,capability:unknown="1"){
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>capability,imageLinkVersion:()=>"1",detailsVersion:()=>"1",mentionVersion:()=>"1",tableCaptionVersion:()=>"1",pageBreakVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>stringResult(JSON.stringify({kind:"rich",abiVersion:1,...binding})),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  return {wasm:{BreditorRichProfile:{fromBootstrapJson:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule,raw,editor};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1,pageBreakVersion:1};
 it("snapshots primitive intent and requires every matching capability",()=>{
  expect(encodeTextLanguageIntent({language:"fr-CA"})).toEqual({language:"fr-CA"});expect(encodeTextLanguageIntent({language:null})).toEqual({language:null});
  for(const bad of [{},{language:7},{language:{toJSON:()=>"en"}},{language:"en",extra:1},null,[],new Date()])expect(()=>encodeTextLanguageIntent(bad)).toThrow(TypeError);
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.supportsTextLanguage?.()).toBe(true);
  core.execute({kind:"setTextLanguage",data:{language:"fr-ca"}});
  expect(JSON.parse(a.editor.execute.mock.calls[0]![1] as unknown as string)).toEqual({kind:"setTextLanguage",data:{language:"fr-ca"}});
  expect(()=>core.execute({kind:"setTextLanguage",data:{language:5}} as never)).toThrow(TypeError);expect(a.editor.execute).toHaveBeenCalledOnce();
  core.dispose();profile.dispose();
  for(const bad of [{...v4,textLanguageVersion:undefined},{...v4,textLanguageVersion:2}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow("rich V4");expect(b.raw.free).toHaveBeenCalledOnce();}
  for(const capability of ["0",null,1]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("text language");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
 });
});
