// Catalog cases clear-formatting-mixed-range@1 and inline-highlight-mark@1 (docs/CLEAR_INLINE_FORMATTING.md):
// the DOM-free control specs that every local, shared and selection toolbar adapts. Rust state is stubbed here;
// the browser specs run the same controls against real Wasm owners.
import {describe,expect,it} from "vitest";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as k,standardInlinePropertiesV1 as p} from "../src/standard_inline_v1.js";
import {pendingStandardFormats,selectionFormatChanges,standardDefaultHighlightColor,standardInlineControls,standardSelectionInlineControls,type StandardInlineControlOptions} from "../src/standard_inline_controls.js";
import {richControlShortcutChord,richCoordinatorShortcuts} from "../src/shortcut_registry.js";
import {defaultRichUi} from "../src/ui_locale.js";
import {richMenuBarDefaults} from "../src/editor_shell.js";
import type {FormatLiteral,RichInlineFormatState} from "../src/core.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ab".repeat(32)}`,schema={name:"breditor/standard-test",version:1,fingerprint};
const presentation=createStandardRichInlinePresentationV1(JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema,formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)}));
const yellow=0xffff00,mention:FormatLiteral={type:"breditor/mention",properties:{"breditor/mention-kind":"user","breditor/mention-id":"u1","breditor/mention-label":"Ada"}};
const background=(rgb:number):FormatLiteral=>({type:k.backgroundColor,properties:{[p.rgb24]:rgb}});
function owner(states:Record<string,RichInlineFormatState>,caret:readonly FormatLiteral[]=[]){
 const read=(format:"breditor/rich-inline-format-state"|"breditor/rich-selection-format-state")=>(kind:string)=>({format,formatVersion:1 as const,formatKind:kind,schema,state:states[kind]??{kind:"unset" as const}});
 return {states,supportsStandardInlineControls:()=>true,supportsSelectionFormatting:()=>true,caretFormats:()=>caret,
  inlineFormatState:read("breditor/rich-inline-format-state") as never,selectionFormatState:read("breditor/rich-selection-format-state") as never};
}
const spec=(o:ReturnType<typeof owner>,id:string,options?:StandardInlineControlOptions)=>standardInlineControls(o,presentation,options).find(s=>s.id===id)!;

describe("clear-formatting-mixed-range@1: Clear standard formatting",()=>{
 it("removes exactly the standard kinds present across a mixed range, including Link and inline code",()=>{
  const o=owner({[k.strong]:{kind:"mixed",presentEverywhere:false},[k.italic]:{kind:"uniform",format:{type:k.italic,properties:{}}},[k.code]:{kind:"mixed",presentEverywhere:false},
   [k.textColor]:{kind:"mixed",presentEverywhere:false},[k.link]:{kind:"mixed",presentEverywhere:false}});
  const changes=spec(o,"clear-inline").changes({});
  expect(changes).toEqual([k.strong,k.italic,k.code,k.link,k.textColor].sort((a,b)=>Object.values(k).indexOf(a)-Object.values(k).indexOf(b)).map(format=>({kind:"remove",format})));
  // Native selection intents remove by kind; the typed removal literal never chooses which link is removed.
  expect(selectionFormatChanges(changes).map(c=>JSON.parse(c.formatsJson)[0].type)).toEqual(changes.map(c=>(c as {format:string}).format));
 });
 it("produces no change, and therefore no history entry, when the range is already plain",()=>{
  expect(spec(owner({}),"clear-inline").changes({})).toEqual([]);
 });
 it("clears a collapsed caret to explicit pending formats that keep mentions, language and application marks",()=>{
  const language:FormatLiteral={type:"breditor/text-language",properties:{"breditor/language-tag":"de"}},review:FormatLiteral={type:"example/review",properties:{}};
  const caret=[{type:k.strong,properties:{}},background(yellow),{type:k.link,properties:{[p.href]:"https://a.test/",[p.newWindow]:false}},mention,language,review];
  const o=owner({[k.strong]:{kind:"uniform",format:caret[0]!},[k.backgroundColor]:{kind:"uniform",format:caret[1]!},[k.link]:{kind:"uniform",format:caret[2]!}},caret);
  expect(pendingStandardFormats(o,spec(o,"clear-inline").changes({})).map(f=>f.type)).toEqual(["breditor/mention","breditor/text-language","example/review"]);
 });
});

describe("inline-highlight-mark@1: Highlight",()=>{
 it("applies the default highlight, reports mixed state, and removes any uniform highlight colour",()=>{
  expect(standardDefaultHighlightColor).toBe("#ffff00");
  const unset=spec(owner({}),"highlight");
  expect(unset).toMatchObject({label:"Highlight",shortcut:"shift+h"});expect(unset.read()).toEqual({kind:"unset",pressed:false});
  expect(unset.changes({})).toEqual([{kind:"set",format:background(yellow)}]);
  const partial=spec(owner({[k.backgroundColor]:{kind:"mixed",presentEverywhere:false}}),"highlight");
  expect(partial.read()).toEqual({kind:"mixed",pressed:"mixed"});expect(partial.changes({})).toEqual([{kind:"set",format:background(yellow)}]);
  for(const state of [{kind:"uniform",format:background(0x00ff00)},{kind:"mixed",presentEverywhere:true}] as RichInlineFormatState[]){
   const on=spec(owner({[k.backgroundColor]:state}),"highlight");expect(on.read().pressed).toBe(true);expect(on.changes({})).toEqual([{kind:"remove",format:k.backgroundColor}]);
  }
  expect(spec(owner({[k.backgroundColor]:{kind:"unavailable"}}),"highlight").read().kind).toBe("unavailable");
 });
 it("keeps unrelated marks: highlight changes name only the background-colour kind",()=>{
  const o=owner({[k.strong]:{kind:"uniform",format:{type:k.strong,properties:{}}}},[{type:k.strong,properties:{}},mention]);
  const changes=spec(o,"highlight").changes({});
  expect(changes.every(c=>c.kind==="set"&&c.format.type===k.backgroundColor)).toBe(true);
  expect(pendingStandardFormats(o,changes)).toEqual([mention,background(yellow),{type:k.strong,properties:{}}].sort((a,b)=>a.type<b.type?-1:1));
 });
 it("uses a host-configured default and offers exactly the configured colours, rejecting others",()=>{
  const options={highlight:{color:"#C6F6D5",colors:[{label:"Yellow",color:"#ffff00"},{label:"Green",color:"#c6f6d5"},{label:"Pink",color:"#fed7e2"}]}};
  const o=owner({});
  expect(spec(o,"highlight",options).changes({})).toEqual([{kind:"set",format:background(0xc6f6d5)}]);
  const field=spec(o,"background-color",options);
  expect(field.fields).toEqual([{id:"value",label:"Highlight color",type:"select",options:[{value:"#ffff00",label:"Yellow"},{value:"#c6f6d5",label:"Green"},{value:"#fed7e2",label:"Pink"}]}]);
  expect(field.changes({value:"#FED7E2"})).toEqual([{kind:"set",format:background(0xfed7e2)}]);
  expect(()=>field.changes({value:"#123456"})).toThrow("Choose a configured highlight color");
  expect(spec(owner({[k.backgroundColor]:{kind:"uniform",format:background(0xfed7e2)}}),"background-color",options).read()).toEqual({kind:"uniform",values:{value:"#fed7e2"}});
  // Without a palette the field stays the free #RRGGBB input; the first palette entry is the default otherwise.
  expect(spec(o,"background-color").fields?.[0]?.type).toBe("text");
  expect(spec(o,"highlight",{highlight:{colors:[{label:"Blue",color:"#bee3f8"}]}}).changes({})).toEqual([{kind:"set",format:background(0xbee3f8)}]);
  expect(standardSelectionInlineControls(o,presentation,options).find(s=>s.id==="highlight")!.changes({})).toEqual([{kind:"set",format:background(0xc6f6d5)}]);
 });
 it("validates highlight options before building any control",()=>{
  const o=owner({});
  for(const bad of [{extra:true},{highlight:{color:"yellow"}},{highlight:{colour:"#ffff00"}},{highlight:{colors:[]}},{highlight:{colors:[{label:"",color:"#ffff00"}]}},
   {highlight:{colors:[{label:"A",color:"#ffff00"},{label:"B",color:"#FFFF00"}]}},{highlight:{color:"#000000",colors:[{label:"A",color:"#ffff00"}]}},{highlight:{colors:[{label:"A",color:"#ffff00",x:1}]}},[]])
   expect(()=>standardInlineControls(o,presentation,bad as never)).toThrow(TypeError);
 });
 it("registers Mod+Shift+H as a formatting shortcut and lists Highlight in the Format menu",()=>{
  expect(richControlShortcutChord("shift+h")).toEqual({key:"H",primary:true,shift:true});
  const entries=richCoordinatorShortcuts({ui:defaultRichUi,controls:standardInlineControls(owner({}),presentation),structural:false,selectionFormatting:false,flowNavigation:false,blockLayout:false});
  expect(entries.find(e=>e.id==="control:highlight")).toEqual({id:"control:highlight",group:"formatting",label:"Highlight",keys:[{key:"H",primary:true,shift:true}]});
  expect(new Set(entries.flatMap(e=>e.keys.map(key=>`${key.primary}${key.shift}${key.alt}${key.key}`))).size).toBe(entries.flatMap(e=>e.keys).length);
  const format=richMenuBarDefaults.find(m=>m.id==="format")!.controls;expect(format.indexOf("highlight")).toBe(format.indexOf("superscript")+1);
 });
});
