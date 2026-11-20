// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {render,applyEditingPolicy} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {canonicalImageLinkHref,encodeImageLinkIntent,imageLinkControls,imageLinkOf} from "../src/image_link.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import type {RichCoreEditor,RichImageLinkIntent,RichView,RichWasmModule} from "../src/core.js";
import {compileStandardRichProfileV4} from "../index.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ef".repeat(32)}`;
const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const p=(id:string,text:string)=>el("paragraph",{"block-id":id},[{kind:"text",text,formats:[]}]);
function documentJson(link:Record<string,unknown>={},decorative=false):string{
 const image=el("image",{"block-id":"fig","image-id":"img","asset-id":"a","asset-generation":"g",decorative,"alt-text":decorative?"":"Chart",...link},[p("cap","Caption")]);
 return JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"d"},[p("p","Hello"),image])});
}
function view(json:string,selection:RichView["selection"]={kind:"node",block:"fig"},readOnly=false):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:json,readOnly,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView;
}
const model=(json:string,selection?:RichView["selection"],readOnly=false)=>presentationModel(view(json,selection,readOnly),"original");
const owner=(language:1|2|3|4,capable=language===4)=>({supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:{kind:"unset"}}),richLanguageVersion:()=>language,supportsListNumbering:()=>capable,supportsTextLanguage:()=>capable,supportsImageLinks:()=>capable,supportsDetails:()=>capable,supportsTableCaptions:()=>capable,supportsBlockLayout:()=>language>=3,blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})}) as unknown as RichCoreEditor;
const linked={"image-href":"https://example.com/a","image-link-new-window":true};

describe("candidate rich V4 image link rendering",()=>{
 it("wraps only the image in a safeLinkV1 anchor, never the caption",()=>{
  const surface=document.createElement("div");render(surface,model(documentJson(linked)),{});
  const figure=surface.querySelector("figure")!,anchor=figure.querySelector("a")!;
  expect(anchor.parentElement).toBe(figure);expect(anchor.children).toHaveLength(1);expect(anchor.firstElementChild?.tagName).toBe("IMG");
  expect([...anchor.attributes].map(a=>[a.name,a.value])).toEqual([["data-rich-image-link",""],["class","breditor-image-link"],["draggable","false"],["href","https://example.com/a"],["rel","noopener noreferrer"],["target","_blank"],["tabindex","-1"]]);
  expect(figure.querySelector("figcaption a")).toBeNull();
  const same=document.createElement("div");render(same,model(documentJson({"image-href":"https://example.com/a"})),{});
  const plain=same.querySelector("a")!;expect(plain.getAttribute("href")).toBe("https://example.com/a");expect(plain.hasAttribute("target")).toBe(false);expect(plain.hasAttribute("rel")).toBe(false);
  const none=document.createElement("div");render(none,model(documentJson()),{});expect(none.querySelector("a")).toBeNull();
  // Values outside the admitted canonical subset never become an href.
  for(const href of ["javascript:alert(1)","HTTPS://EXAMPLE.COM","https://example.com"]){const bad=document.createElement("div");render(bad,model(documentJson({"image-href":href})),{});expect(bad.querySelector("a")).toBeNull();}
 });
 it("keeps links inert while editing and restores ordinary links in read-only mode",()=>{
  const surface=document.createElement("div");render(surface,model(documentJson(linked)),{});
  const anchor=surface.querySelector<HTMLAnchorElement>("a[data-rich-image-link]")!;
  expect(anchor.tabIndex).toBe(-1);expect(anchor.closest("figure")!.contentEditable).toBe("false");
  applyEditingPolicy(surface,true);expect(anchor.hasAttribute("tabindex")).toBe(false);
  applyEditingPolicy(surface,false);expect(anchor.getAttribute("tabindex")).toBe("-1");
  const readOnly=document.createElement("div");render(readOnly,model(documentJson(linked),null,true),{});
  expect(readOnly.querySelector("a")!.hasAttribute("tabindex")).toBe(false);
 });
});

describe("candidate rich V4 image link intent and controls",()=>{
 it("reads exact admitted links and canonicalizes input through the inline link policy",()=>{
  const node=model(documentJson(linked)).nodes.get("fig")!;
  expect(imageLinkOf(node)).toEqual({href:"https://example.com/a",newWindow:true});
  expect(imageLinkOf(model(documentJson()).nodes.get("fig")!)).toBeUndefined();
  expect(canonicalImageLinkHref("HTTPS://Example.COM/x/../y")).toBe("https://example.com/y");
  for(const bad of ["javascript:alert(1)","mailto:a@example.com","https://u:p@example.com/","example.com","https://example.com/a b"])expect(canonicalImageLinkHref(bad)).toBeNull();
 });
 it("snapshots only primitive intent",()=>{
  expect(encodeImageLinkIntent({image:"img",href:"https://a.com/",newWindow:true})).toEqual({image:"img",href:"https://a.com/",newWindow:true});
  expect(encodeImageLinkIntent({image:"img",href:null})).toEqual({image:"img",href:null});
  for(const bad of [{image:"img"},{href:null},{image:1,href:null},{image:"img",href:{toJSON:()=>"x"}},{image:"img",href:null,newWindow:false},{image:"img",href:"https://a.com/",newWindow:"yes"},{image:"img",href:null,extra:1},null,[],new Date()])
   expect(()=>encodeImageLinkIntent(bad as unknown as RichImageLinkIntent)).toThrow(TypeError);
 });
 it("targets a selected image only and sends exact set, replace, no-op and clear intent",()=>{
  const [link,clear]=imageLinkControls(owner(4));
  const unlinked=model(documentJson()),current=model(documentJson(linked));
  // A caret in the caption targets its image, like the alt and caption controls; other text does not.
  const at=(block:string)=>({kind:"text" as const,anchor:{block,offset:"0",affinity:"after" as const},focus:{block,offset:"0",affinity:"after" as const}});
  expect(link!.enabled(model(documentJson(),at("cap")))).toBe(true);
  expect(link!.read(model(documentJson(),at("p")))).toEqual({kind:"unavailable"});
  expect(link!.read(model(documentJson(),null))).toEqual({kind:"unavailable"});
  expect(link!.enabled(model(documentJson(),null))).toBe(false);
  expect(link!.read(unlinked)).toEqual({kind:"unset",values:{href:"",target:"same"}});
  expect(link!.intent(unlinked,{href:" HTTPS://Example.com ",target:"same"})).toEqual({image:"img",href:"https://example.com/"});
  expect(link!.intent(unlinked,{href:"https://example.com/",target:"new"})).toEqual({image:"img",href:"https://example.com/",newWindow:true});
  expect(()=>link!.intent(unlinked,{href:"javascript:alert(1)"})).toThrow("absolute HTTP(S) URL");
  expect(()=>link!.intent(unlinked,{href:""})).toThrow("Remove image link");
  expect(link!.read(current)).toEqual({kind:"uniform",values:{href:"https://example.com/a",target:"new"}});
  expect(link!.intent(current,{href:"https://example.com/a",target:"new"})).toBeNull();
  expect(link!.intent(current,{href:"",target:"same"})).toEqual({image:"img",href:"https://example.com/a"});
  expect(clear!.enabled(unlinked)).toBe(false);expect(clear!.enabled(current)).toBe(true);
  expect(clear!.intent(current,{})).toEqual({image:"img",href:null});expect(clear!.intent(unlinked,{})).toBeNull();
  // A decorative image has no accessible name, so it cannot be linked.
  expect(()=>link!.intent(model(documentJson({},true)),{href:"https://example.com/"})).toThrow("decorative");
 });
 it("binds the V4 toolbar only to an explicit V4 owner",()=>{
  const presentation=createStandardRichInlinePresentationV1(catalogJson),core=owner(4);
  const toolbar=createRichToolbarV4(core,presentation),control=toolbar.find(c=>c.id==="image-link")!;
  expect(toolbar.some(c=>c.id==="reset-image-link")).toBe(true);
  const context={core,model:model(documentJson()),allocate:()=>"id",stamp:()=>({replica:"1",counter:"1",lamport:"1"})};
  expect(control.command(context,undefined,{href:"https://example.com/",target:"same"})).toEqual({kind:"setImageLink",data:{image:"img",href:"https://example.com/"}});
  expect(()=>control.command({...context,core:owner(4)},undefined,{href:"https://example.com/"})).toThrow("different Rust owner");
  expect(()=>imageLinkControls(owner(4,false))).toThrow("rich V4 owner");
  for(const language of [1,2,3] as const)expect(()=>imageLinkControls(owner(language))).toThrow();
  expect(createLayoutRichToolbarV3(owner(3),presentation).some(c=>c.id==="image-link")).toBe(false);
 });
});

describe("explicit V4 Wasm factory boundary for image links",()=>{
 function stringResult(value:string){return {status:"value",takeValue:()=>value,free:vi.fn()};}
 function local(binding:object,capability:unknown="1"){
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>"1",imageLinkVersion:()=>capability,detailsVersion:()=>"1",mentionVersion:()=>"1",tableCaptionVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>stringResult(JSON.stringify({kind:"rich",abiVersion:1,...binding})),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  const wasm={BreditorRichProfile:{fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule;
  return {wasm,raw,editor};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1};
 it("requires the matching capability and sends validated intent",()=>{
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.supportsImageLinks?.()).toBe(true);
  core.execute({kind:"setImageLink",data:{image:"img",href:"https://example.com/",newWindow:true}});
  expect(JSON.parse(a.editor.execute.mock.calls[0]![1] as unknown as string)).toEqual({kind:"setImageLink",data:{image:"img",href:"https://example.com/",newWindow:true}});
  expect(()=>core.execute({kind:"setImageLink",data:{image:"img",href:null,newWindow:false} as unknown as RichImageLinkIntent})).toThrow(TypeError);
  expect(a.editor.execute).toHaveBeenCalledOnce();
  core.dispose();profile.dispose();
  for(const bad of [{...v4,imageLinkVersion:undefined},{...v4,imageLinkVersion:2}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow("V4 profile");expect(b.raw.free).toHaveBeenCalledOnce();}
  for(const capability of ["0",null]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("image link");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
 });
});
