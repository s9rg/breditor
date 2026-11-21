// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {renderStaticDocument} from "../src/static_document.js";
import {rubyProfileBootstrapJsonV4,rubySchemaFingerprintV4,profileBootstrapJsonV4} from "../src/local.js";
import {rubySharedProfileConfigurationV4,richSharedProfileConfigurationV4} from "../src/shared_profile.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import {createRichInlinePresentation,richInlinePresentationHasRuby} from "../../breditor-experimental-rich-content/src/inline_presentation.js";
import {readNative} from "../../breditor-experimental-rich-content/src/selection.js";
import {groupRubyRuns,isRichRubyAnnotation,richRubyBootstrapExtensionV1,richRubySharedExtensionV1,rubyCommand,rubyControls,rubyGroupAt,rubyToolbarControls,withRichRubyBootstrapV1,withRichRubySharedConfigurationV1} from "../../breditor-experimental-rich-content/src/ruby.js";
import {sharedRubyToolbarControls} from "../../breditor-collaboration/src/ruby.js";
// The collaboration package reads the published rich-content entry (one presentation identity per module copy).
import {createRichInlinePresentation as publishedPresentation} from "@breditor/experimental-rich-content";
import {resolveRichUi} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {arabicUi} from "./ui_locale_ar.js";
import {envelope,fingerprint,p,type Json} from "./static_document_fixture.js";

const ruby=(annotation:string)=>({type:"breditor-ruby/ruby",properties:{"breditor-ruby/annotation":annotation}});
const strong={type:"breditor/strong",properties:{}};
const run=(text:string,formats:Json[]=[])=>({kind:"text",text,formats}) as Json;
const rubyFormat={kind:"breditor-ruby/ruby",revision:1,properties:[{name:"breditor-ruby/annotation",presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:256}}]};
const catalog=(formats:unknown[])=>JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...formats,{kind:"breditor/strong",revision:1,properties:[]}].sort((a:any,b:any)=>a.kind<b.kind?-1:1)});
const presentation=()=>createRichInlinePresentation(catalog([rubyFormat]),{recipes:[{formatKind:"breditor/strong",element:"strong"}]});
const view=(document:Json,selection:RichView["selection"]=null):RichView=>({format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]});
const point=(offset:number,affinity:"before"|"after"="after")=>({block:"a",offset:String(offset),affinity});
const doc=envelope([p("a",[run("私は"),run("漢",[strong,ruby("かんじ")]),run("字",[ruby("かんじ")]),run("と"),run("東",[ruby("とう")]),run("京",[ruby("きょう")])]),p("b",[run("plain")])]);

describe("ruby extension: profile composition",()=>{
 it("appends exactly one extension to a bootstrap or shared configuration and never mutates the input",()=>{
  const bootstrap=JSON.parse(rubyProfileBootstrapJsonV4);
  expect(bootstrap).toEqual({...JSON.parse(profileBootstrapJsonV4),extensions:[JSON.parse(JSON.stringify(richRubyBootstrapExtensionV1))]});
  expect(()=>withRichRubyBootstrapV1(rubyProfileBootstrapJsonV4)).toThrow("already declares");
  expect(()=>withRichRubyBootstrapV1('{"format":"x"}')).toThrow("extensions array");
  expect(rubySharedProfileConfigurationV4).toEqual({...richSharedProfileConfigurationV4,extensions:[JSON.parse(JSON.stringify(richRubySharedExtensionV1))]});
  expect(richSharedProfileConfigurationV4.extensions).toEqual([]);
  expect(()=>withRichRubySharedConfigurationV1(rubySharedProfileConfigurationV4)).toThrow("already declares");
  expect(rubySchemaFingerprintV4).toMatch(/^sha256:[0-9a-f]{64}$/);
 });
 it("presentation recognizes only the exact declaration, needs no recipe for it and keeps others strict",()=>{
  expect(richInlinePresentationHasRuby(presentation())).toBe(true);
  expect(richInlinePresentationHasRuby(createRichInlinePresentation(catalog([]),{recipes:[{formatKind:"breditor/strong",element:"strong"}]}))).toBe(false);
  // Same kind, other contract: an ordinary format that needs its own recipe.
  const other={...rubyFormat,properties:[{...rubyFormat.properties[0],valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:64}}]};
  expect(()=>createRichInlinePresentation(catalog([other]),{recipes:[{formatKind:"breditor/strong",element:"strong"}]})).toThrow();
 });
});

describe("ruby extension: rendering",()=>{
 it("static output groups equal annotations into one <ruby> with rp/rt text",()=>{
  expect(renderStaticDocument(doc,{fragment:true})).toBe(
   '<p data-rich-block="a" data-rich-text="a">私は<ruby class="breditor-ruby" data-rich-ruby=""><strong data-rich-format="breditor/strong">漢</strong>字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>と'+
   '<ruby class="breditor-ruby" data-rich-ruby="">東<rp>(</rp><rt>とう</rt><rp>)</rp></ruby><ruby class="breditor-ruby" data-rich-ruby="">京<rp>(</rp><rt>きょう</rt><rp>)</rp></ruby></p>'+
   '<p data-rich-block="b" data-rich-text="b">plain</p>');
  // Escaped; a literal outside the authoring policy keeps its base as plain text; the bound is enforced.
  expect(renderStaticDocument(envelope([p("a",[run("<b>",[ruby("<&>")]),run("x",[ruby(" pad")])])]),{fragment:true})).toBe('<p data-rich-block="a" data-rich-text="a"><ruby class="breditor-ruby" data-rich-ruby="">&lt;b&gt;<rp>(</rp><rt>&lt;&amp;&gt;</rt><rp>)</rp></ruby>x</p>');
  expect(()=>renderStaticDocument(envelope([p("a",[run("x",[ruby("y".repeat(257))])])]),{fragment:true})).toThrow();
 });
 it("live output keeps the annotation out of the text flow and matches the static structure",()=>{
  const surface=document.createElement("div");document.body.append(surface);
  render(surface,presentationModel(view(doc),"original"),{inlinePresentation:presentation()});
  const rubies=[...surface.querySelectorAll("ruby[data-rich-ruby]")];
  expect(rubies.map(r=>r.querySelector("rt")!.getAttribute("data-ruby-text"))).toEqual(["かんじ","とう","きょう"]);
  for(const r of rubies){for(const x of r.querySelectorAll("rt,rp")){expect(x.getAttribute("contenteditable")).toBe("false");expect(x.textContent).toBe("");}}
  // Document text, and therefore every offset, is exactly the base text.
  expect(surface.querySelector('[data-rich-text="a"]')!.textContent).toBe("私は漢字と東京");
  // A native caret right after the first ruby base maps to offset 4 (an rt/rp is never counted).
  const rt=rubies[0]!.querySelector("rt")!;getSelection()!.setBaseAndExtent(rt,0,rt,0);
  expect(readNative(surface,presentationModel(view(doc),"original"))).toMatchObject({kind:"text",anchor:{block:"a",offset:"4"}});
  // Without a ruby-capable presentation nothing changes (no <ruby>).
  const plain=document.createElement("div");render(plain,presentationModel(view(envelope([p("b",[run("plain")])])),"original"),{inlinePresentation:createRichInlinePresentation(catalog([]),{recipes:[{formatKind:"breditor/strong",element:"strong"}]})});
  expect(plain.querySelector("ruby")).toBeNull();surface.remove();
 });
 it("groups by equal admitted annotations only",()=>{
  const segments=groupRubyRuns([{text:"a",formats:[ruby("x")]},{text:"b",formats:[ruby("x"),strong]},{text:"c",formats:[ruby("y")]},{text:"d",formats:[ruby(" bad")]},{text:"e",formats:[]}] as never,(r:{text:string},formats)=>({...r,formats}));
  expect(segments.map(s=>s.kind==="ruby"?`${s.annotation}:${s.runs.map(r=>r.text).join("")}`:`-${s.runs.map(r=>r.text).join("")}`)).toEqual(["x:ab","y:c","-de"]);
  expect(segments.every(s=>s.runs.every(r=>!r.formats.some(f=>f.type==="breditor-ruby/ruby")))).toBe(true);
 });
});

describe("ruby extension: controls",()=>{
 const model=(selection:RichView["selection"])=>presentationModel(view(doc,selection),"original");
 const core=(state:unknown)=>({inlineFormatState:vi.fn(()=>({format:"breditor/rich-inline-format-state",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formatKind:"breditor-ruby/ruby",state}))});
 it("finds the whole group around a caret, preferring the group the caret is inside",()=>{
  expect(rubyGroupAt(model(null),point(3))).toEqual({block:"a",start:"2",end:"4",annotation:"かんじ"});
  expect(rubyGroupAt(model(null),point(5,"after"))).toEqual({block:"a",start:"5",end:"6",annotation:"とう"});
  expect(rubyGroupAt(model(null),point(6,"before"))).toEqual({block:"a",start:"5",end:"6",annotation:"とう"});
  expect(rubyGroupAt(model(null),point(1))).toBeUndefined();
 });
 it("Ruby sets a validated reading on one block's selection or the caret's group; Remove ruby removes it",()=>{
  const [set,remove]=rubyControls(core({kind:"uniform",format:ruby("かんじ")}),true);
  const range=model({kind:"text",anchor:point(0),focus:point(2)});
  expect(set!.read(range)).toEqual({kind:"uniform",values:{annotation:"かんじ"}});
  // A caret reads the group around it from the document (typing never inherits a reading).
  expect(set!.read(model({kind:"text",anchor:point(3),focus:point(3)}))).toEqual({kind:"uniform",values:{annotation:"かんじ"}});
  expect(set!.read(model({kind:"text",anchor:point(1),focus:point(1)}))).toEqual({kind:"unset",values:{annotation:""}});
  expect(set!.enabled(range)).toBe(true);
  expect(rubyCommand(set!.intent(range,{annotation:"  わたし "})!)).toEqual({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([ruby("わたし")])},targets:[{block:"a",start:"0",end:"2"}]}});
  const caret=model({kind:"text",anchor:point(3),focus:point(3)});
  expect(set!.intent(caret,{annotation:"カンジ"})!.targets).toEqual([{block:"a",start:"2",end:"4"}]);
  expect(rubyCommand(remove!.intent(caret,{})!)).toEqual({kind:"setInlineFormat",data:{change:{kind:"remove",format:"breditor-ruby/ruby"},targets:[{block:"a",start:"2",end:"4"}]}});
  for(const bad of ["","   ","a\u0007b","x".repeat(257)])expect(()=>set!.intent(range,{annotation:bad})).toThrow();
  const across=model({kind:"text",anchor:point(0),focus:{block:"b",offset:"2",affinity:"after"}});
  expect(set!.enabled(across)).toBe(false);expect(()=>set!.intent(across,{annotation:"x"})).toThrow("one block");
  expect(remove!.intent(across,{})!.targets).toEqual([{block:"a",start:"0",end:"7"},{block:"b",start:"0",end:"2"}]);
  // A plain caret is not annotatable (nothing to annotate) and removal needs a present reading.
  expect(set!.enabled(model({kind:"text",anchor:point(1),focus:point(1)}))).toBe(false);
  const [,none]=rubyControls(core({kind:"unset"}),true);expect(none!.enabled(range)).toBe(false);
  expect(()=>rubyControls(core({kind:"unset"}),false)).toThrow("breditor-ruby/ruby");
  expect(isRichRubyAnnotation("かんじ")&&!isRichRubyAnnotation("\u202Ex")).toBe(true);
 });
 it("local adapters are owner bound; shared adapters publish one set_format dispatch per intent",()=>{
  const owner=core({kind:"unset"}),controls=rubyToolbarControls(owner as never,presentation());
  expect(controls.map(c=>c.id)).toEqual(["ruby","remove-ruby"]);
  const range=model({kind:"text",anchor:point(0),focus:point(2)});
  expect(controls[0]!.command({core:owner,model:range} as never,undefined,{annotation:"わたし"})).toMatchObject({kind:"setInlineFormat"});
  expect(()=>controls[0]!.command({core:{},model:range} as never,undefined,{annotation:"わたし"})).toThrow("different Rust owner");
  const dispatch=vi.fn(),shared={...core({kind:"uniform",format:ruby("かんじ")}),dispatch} as never,[set,remove]=sharedRubyToolbarControls(shared,publishedPresentation(catalog([rubyFormat]),{recipes:[{formatKind:"breditor/strong",element:"strong"}]}));
  set!.run({core:shared,model:range,revision:"7"} as never,undefined,{annotation:"わたし"});
  expect(dispatch).toHaveBeenLastCalledWith({commands:[{kind:"set_format",data:{block:"a",offset:0,length:2,format:ruby("わたし"),enabled:true}}]},"7");
  remove!.run({core:shared,model:model({kind:"text",anchor:point(3),focus:point(3)}),revision:"8"} as never);
  expect(dispatch).toHaveBeenLastCalledWith({commands:[{kind:"set_format",data:{block:"a",offset:2,length:2,format:ruby("ruby"),enabled:false}}]},"8");
  expect(dispatch).toHaveBeenCalledTimes(2);
 });
 it("control labels and the field are localizable through the UI catalog by control id",()=>{
  const ui=resolveRichUi(arabicUi),[set,remove]=rubyControls(core({kind:"unset"}),true);
  ui.checkControls([set!,remove!]);
  expect(ui.control(set!).label).toBe("روبي");expect(ui.control(set!).fields![0]!.label).toBe("نص روبي");expect(ui.control(remove!).label).toBe("إزالة روبي");
 });
});
