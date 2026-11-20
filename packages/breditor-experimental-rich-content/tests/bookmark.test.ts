// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {bookmarkAttributes,bookmarkNames,bookmarkOf,bookmarkToolbarControls,encodeRenameBookmarkIntent,encodeSetBookmarkIntent,internalLinkAttributes,internalLinkName,internalLinkOf,isBookmarkName} from "../src/bookmark.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import {mountToolbarControl} from "../src/toolbar_control_view.js";
import type {RichCoreEditor,RichView,RichWasmModule} from "../src/core.js";
import type {ActionContext} from "../src/actions.js";
import {compileStandardRichProfileV4} from "../index.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ef".repeat(32)}`;
const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)});
const presentation=createStandardRichInlinePresentationV1(catalogJson);
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const run=(text:string)=>({kind:"text",text,formats:[]});
const link=(text:string,href:string,newWindow=false)=>({kind:"text",text,formats:[{type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":newWindow}}]});
function documentJson():string{
 const children=[
  el("heading",{"block-id":"h","level":2,"bookmark":"intro"},[run("Introduction")]),
  el("paragraph",{"block-id":"p"},[run("See "),link("intro","#intro"),run(" or "),link("gone","#gone"),run(".")]),
  el("code-block",{"block-id":"c","bookmark":"code"},[run("x")]),
  el("paragraph",{"block-id":"q"},[run("Tail text")]),
 ];
 return JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"d"},children)});
}
const caret=(block:string,start=0,end=start)=>({kind:"text" as const,anchor:{block,offset:String(start),affinity:"after" as const},focus:{block,offset:String(end),affinity:"after" as const}});
function view(selection:RichView["selection"]=caret("q"),readOnly=false):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:documentJson(),readOnly,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView;
}
const model=(selection?:RichView["selection"],readOnly=false)=>presentationModel(view(selection,readOnly),"original");
const owner=(language:1|2|3|4,capable=language===4,selection=false)=>({supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:{kind:"unset"}}),richLanguageVersion:()=>language,supportsListNumbering:()=>language===4,supportsTextLanguage:()=>language===4,supportsImageLinks:()=>language===4,supportsDetails:()=>language===4,supportsTableCaptions:()=>language===4,supportsPageBreaks:()=>language===4,supportsBookmarks:()=>capable,supportsSelectionFormatting:()=>selection,supportsBlockLayout:()=>language>=3,blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})}) as unknown as RichCoreEditor;
const context=(core:RichCoreEditor,selection?:RichView["selection"]):ActionContext=>({core,model:model(selection),allocate:()=>"id",stamp:()=>({replica:"1",counter:"1",lamport:"1"})});

describe("candidate rich V4 bookmark grammar mirror",()=>{
 it("accepts and rejects exactly the Rust name table",()=>{
  for(const good of ["a","Intro","section-2","a_b","Z9","a".repeat(64)])expect(isBookmarkName(good)).toBe(true);
  for(const bad of ["","1abc","-a","_a","a b","a.b","a#b","é","a/b","a%20","a".repeat(65)," a","a\n",7,null])expect(isBookmarkName(bad)).toBe(false);
  expect(internalLinkName("#intro")).toBe("intro");
  for(const bad of ["intro","#","#1","##a","https://example.com/#a",undefined])expect(internalLinkName(bad)).toBeUndefined();
  expect(internalLinkOf({type:"breditor-inline/link",properties:{"breditor-inline/href":"#a","breditor-inline/new-window":false}})).toBe("a");
  expect(internalLinkOf({type:"breditor-inline/link",properties:{"breditor-inline/href":"#a","breditor-inline/new-window":true}})).toBeUndefined();
  expect(internalLinkOf({type:"breditor-inline/italic",properties:{}})).toBeUndefined();
  const m=model();expect(bookmarkNames(m.root)).toEqual(["intro","code"]);
  expect(bookmarkOf(m.nodes.get("h")!)).toBe("intro");expect(bookmarkOf(m.nodes.get("q")!)).toBeUndefined();
  expect(bookmarkAttributes("intro")).toEqual([{name:"id",value:"bm-intro"},{name:"data-rich-bookmark",value:"intro"}]);
  expect(internalLinkAttributes("intro",true)).toEqual([{name:"href",value:"#bm-intro"},{name:"data-rich-internal-link",value:"intro"}]);
  expect(internalLinkAttributes("gone",false)).toEqual([{name:"data-rich-internal-link",value:"gone"},{name:"data-rich-link-broken",value:""}]);
 });
 it("snapshots only primitive intent",()=>{
  expect(encodeSetBookmarkIntent({block:"q",name:"x"})).toEqual({block:"q",name:"x"});
  expect(encodeSetBookmarkIntent({block:"q",name:null})).toEqual({block:"q",name:null});
  expect(encodeRenameBookmarkIntent({from:"a",to:"b"})).toEqual({from:"a",to:"b"});
  for(const bad of [{block:"q"},{name:"x"},{block:1,name:"x"},{block:"q",name:{toJSON:()=>"x"}},{block:"q",name:"x",extra:1},null,[],new Date()])expect(()=>encodeSetBookmarkIntent(bad)).toThrow(TypeError);
  for(const bad of [{from:"a"},{from:"a",to:null},{from:"a",to:"b",x:1},{from:1,to:"b"}])expect(()=>encodeRenameBookmarkIntent(bad)).toThrow(TypeError);
 });
});

describe("candidate rich V4 bookmark rendering",()=>{
 it("anchors bookmarked blocks and resolves internal links only for a bookmark-capable render",()=>{
  const surface=document.createElement("div");render(surface,model(),{inlinePresentation:presentation,bookmarks:true});
  const h=surface.querySelector("h2")!;expect(h.id).toBe("bm-intro");expect(h.dataset["richBookmark"]).toBe("intro");
  const pre=surface.querySelector("pre")!;expect(pre.id).toBe("bm-code");
  expect(surface.querySelector("p")!.hasAttribute("id")).toBe(false);
  const [resolved,broken]=[...surface.querySelectorAll<HTMLAnchorElement>("a[data-rich-format='breditor-inline/link']")];
  expect(resolved!.getAttribute("href")).toBe("#bm-intro");expect(resolved!.dataset["richInternalLink"]).toBe("intro");expect(resolved!.hasAttribute("data-rich-link-broken")).toBe(false);
  expect(broken!.hasAttribute("href")).toBe(false);expect(broken!.hasAttribute("data-rich-link-broken")).toBe(true);
  // Without the V4 flag the output is the original one: no anchors, no internal hrefs.
  const original=document.createElement("div");render(original,model(),{inlinePresentation:presentation});
  expect(original.querySelector("[data-rich-bookmark],[id]")).toBeNull();
  expect(original.querySelector("a[href],a[data-rich-internal-link]")).toBeNull();
 });
});

describe("candidate rich V4 bookmark controls",()=>{
 const [bookmark,remove,linkTo]=bookmarkToolbarControls(owner(4));
 it("sets a new bookmark and renames an existing one, validating grammar and uniqueness",()=>{
  const core=owner(4),[set]=bookmarkToolbarControls(core);
  expect(set!.read!(context(core,caret("q")))).toEqual({kind:"unset",values:{name:""}});
  expect(set!.read!(context(core,caret("h")))).toEqual({kind:"uniform",values:{name:"intro"}});
  expect(set!.command(context(core,caret("q")),undefined,{name:" tail "})).toEqual({kind:"setBookmark",data:{block:"q",name:"tail"}});
  expect(set!.command(context(core,caret("h")),undefined,{name:"start"})).toEqual({kind:"renameBookmark",data:{from:"intro",to:"start"}});
  expect(set!.command(context(core,caret("h")),undefined,{name:"intro"})).toBeNull();
  expect(()=>set!.command(context(core,caret("q")),undefined,{name:"code"})).toThrow("already uses");
  expect(()=>set!.command(context(core,caret("q")),undefined,{name:"1x"})).toThrow("starts with a letter");
  expect(()=>set!.command(context(core,caret("q")),undefined,{name:""})).toThrow("Remove bookmark");
  expect(set!.enabled(context(core,caret("h",0)))).toBe(true);
  expect(set!.enabled(context(core,null))).toBe(false);
  expect(()=>set!.command(context(owner(4),caret("q")),undefined,{name:"x"})).toThrow("different Rust owner");
  expect(bookmark!.id).toBe("bookmark");
 });
 it("removes a bookmark with an explicit null name",()=>{
  const core=owner(4),[,clear]=bookmarkToolbarControls(core);
  expect(clear!.enabled(context(core,caret("q")))).toBe(false);
  expect(clear!.command(context(core,caret("h")))).toEqual({kind:"setBookmark",data:{block:"h",name:null}});
  expect(remove!.id).toBe("remove-bookmark");
 });
 it("links selected text to an existing bookmark through the native format commands",()=>{
  const core=owner(4),[,,to]=bookmarkToolbarControls(core),range=caret("q",0,4);
  expect(to!.enabled(context(core,caret("q")))).toBe(false);
  expect(to!.read!(context(core,range))).toEqual({kind:"unset",values:{target:""},options:{target:[{value:"intro",label:"intro"},{value:"code",label:"code"}]}});
  const formatsJson=JSON.stringify([{type:"breditor-inline/link",properties:{"breditor-inline/href":"#intro","breditor-inline/new-window":false}}]);
  expect(to!.command(context(core,range),undefined,{target:"intro"})).toEqual({kind:"changeInlineFormats",data:{changes:[{kind:"set",formatsJson}],targets:[{block:"q",start:"0",end:"4"}]}});
  expect(()=>to!.command(context(core,range),undefined,{target:"nope"})).toThrow("existing bookmark");
  const selecting=owner(4,true,true),[,,native]=bookmarkToolbarControls(selecting);
  expect(native!.command(context(selecting,range),undefined,{target:"code"})).toEqual({kind:"changeSelectionFormats",data:{changes:[{kind:"set",formatsJson:formatsJson.replace("#intro","#code")}]}});
  expect(linkTo!.id).toBe("link-bookmark");
 });
 it("fills the select with the current bookmarks when the toolbar refreshes",()=>{
  const core=owner(4),[,,to]=bookmarkToolbarControls(core),toolbar=document.createElement("div");
  const view=mountToolbarControl(toolbar,to!,{prefix:"rich",signal:new AbortController().signal,sync:()=>{},stamp:()=>"1",run:()=>{},attempt:work=>work(),focus:()=>{}});
  view.refresh(context(core,caret("q",0,4)),true,"1");
  const select=toolbar.querySelector("select")!;
  expect([...select.options].map(o=>o.value)).toEqual(["","intro","code"]);
 });
 it("binds the V4 toolbar only to an explicit bookmark-capable V4 owner",()=>{
  const ids=createRichToolbarV4(owner(4),presentation).map(c=>c.id);
  for(const id of ["bookmark","remove-bookmark","link-bookmark"])expect(ids).toContain(id);
  expect(()=>bookmarkToolbarControls(owner(4,false))).toThrow("rich V4 owner");
  for(const language of [1,2,3] as const)expect(()=>bookmarkToolbarControls(owner(language))).toThrow();
  expect(createLayoutRichToolbarV3(owner(3),presentation).some(c=>c.id==="bookmark")).toBe(false);
 });
});

describe("explicit V4 Wasm factory boundary for bookmarks",()=>{
 function stringResult(value:string){return {status:"value",takeValue:()=>value,free:vi.fn()};}
 function local(binding:object,capability:unknown="1"){
  const index={bookmarks:[{name:"intro",block:"h"}],links:[],brokenLinks:[]};
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),bookmarkIndexJson:vi.fn(()=>stringResult(JSON.stringify(index))),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>"1",imageLinkVersion:()=>"1",detailsVersion:()=>"1",mentionVersion:()=>"1",tableCaptionVersion:()=>"1",pageBreakVersion:()=>"1",bookmarkVersion:()=>capability,execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>stringResult(JSON.stringify({kind:"rich",abiVersion:1,...binding})),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  const wasm={BreditorRichProfile:{fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule;
  return {wasm,raw,editor};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1,pageBreakVersion:1,bookmarkVersion:1};
 it("requires bookmarkVersion 1, sends snapshotted intent and reads the index",()=>{
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.supportsBookmarks?.()).toBe(true);
  expect(core.bookmarkIndex?.()).toEqual({bookmarks:[{name:"intro",block:"h"}],links:[],brokenLinks:[]});
  core.execute({kind:"setBookmark",data:{block:"q",name:"tail"}});
  core.execute({kind:"renameBookmark",data:{from:"intro",to:"start"}});
  expect(a.editor.execute.mock.calls.map(call=>JSON.parse(call[1] as unknown as string))).toEqual([{kind:"setBookmark",data:{block:"q",name:"tail"}},{kind:"renameBookmark",data:{from:"intro",to:"start"}}]);
  expect(()=>core.execute({kind:"setBookmark",data:{block:"q",name:"x",extra:1} as never})).toThrow(TypeError);
  core.dispose();profile.dispose();
  for(const bad of [{...v4,bookmarkVersion:undefined},{...v4,bookmarkVersion:2}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow("V4 profile");expect(b.raw.free).toHaveBeenCalledOnce();}
  for(const capability of ["0",null]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("bookmark");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
 });
});
