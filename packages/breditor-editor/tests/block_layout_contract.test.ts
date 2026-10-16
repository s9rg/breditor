import {describe,it,expect,vi} from "vitest";
import {compileRichProfile,compileStructuralRichProfileV2,compileStandardLayoutRichProfileV3,type RichWasmModule} from "../../breditor-experimental-rich-content/index.js";
import {compileSharedProfile,compileStructuralSharedProfileV2,compileLayoutSharedProfileV3,compileStandardLayoutSharedProfileV3,type SharedRustProfile,type SharedProfileModule} from "../../breditor-collaboration/src/profile.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {sharedProtocolLanguage} from "../../breditor-collaboration/src/protocol.js";
import {checkCheckpoint} from "../../breditor-collaboration/src/persistence/session_database.js";
import {descriptor,checkDescriptor} from "../../breditor-collaboration/src/relay/validation.js";
const v1={abiVersion:1,modelVersion:11,journalVersion:12},v2={abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2},v3={abiVersion:1,modelVersion:13,journalVersion:14,richLanguageVersion:3,blockLayoutVersion:1};
const config={format:"breditor/shared-rich-profile" as const,formatVersion:3 as const,schema:{name:"test/layout",version:1},extensions:[]};
function nativeProfile(binding:object){return {descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-profile-descriptor",formatVersion:1,...binding}),free:vi.fn()} as unknown as SharedRustProfile;}
function shared(readOnly=false,changed=true,binding:object=v3){
 let revision=1;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",...binding}),observe:vi.fn(()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(readOnly?{readOnly:true}:{})}),free:vi.fn()})),block_layout_version:()=>"1",block_layout_state_json:vi.fn(()=>JSON.stringify({alignment:{kind:"mixed"},direction:{kind:"uniform",value:null}})),change_selection_layout:vi.fn((_o:unknown,_patch:string)=>{if(changed)revision++;return changed;}),dispatch:vi.fn(),free:vi.fn()};
 return {raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
function stringResult(value:string){return {status:"value",takeValue:()=>value,free:vi.fn()};}
function local(binding:object={richLanguageVersion:3,taskStructureVersion:1,blockLayoutVersion:1},capability:unknown="1"){
 const observation={revision:"1",blockLayoutStateJson:vi.fn(()=>stringResult(JSON.stringify({alignment:{kind:"uniform",value:"start"}}))),free:vi.fn()};
 const editor={observe:()=>observation,blockLayoutVersion:()=>capability,free:vi.fn()};
 const raw={descriptorJson:()=>stringResult(JSON.stringify({kind:"rich",abiVersion:1,...binding})),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
 const factory=()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()});
 const wasm:RichWasmModule={BreditorRichProfile:{fromBootstrapJson:factory,fromStructuralBootstrapJsonV2:factory,fromStandardLayoutBootstrapJsonV3:factory}};
 return {wasm,raw,editor,observation};
}
describe("explicit native layout boundary",()=>{
 it("keeps exact model/history/language/capability tuples and rejects mixed revisions",()=>{
  expect(sharedProtocolLanguage(v1)).toBe(1);expect(sharedProtocolLanguage(v2)).toBe(2);expect(sharedProtocolLanguage(v3)).toBe(3);
  for(const bad of [{...v3,blockLayoutVersion:undefined},{...v3,blockLayoutVersion:2},{...v3,journalVersion:13},{...v3,richLanguageVersion:2},{...v3,modelVersion:12},{...v1,blockLayoutVersion:1},{...v2,blockLayoutVersion:1},{...v3,abiVersion:2}])expect(sharedProtocolLanguage(bad)).toBeUndefined();
 });
 it("uses distinct V3 factories and frees a mismatched native profile",()=>{
  const old=nativeProfile(v2),selected=nativeProfile(v3),factory=vi.fn().mockReturnValueOnce(old).mockReturnValue(selected),wasm:SharedProfileModule={SharedRichProfile:{from_configuration_json:()=>selected,from_configuration_json_v2:()=>selected,from_configuration_json_v3:factory,from_standard_configuration_json_v3:factory}};
  expect(()=>compileLayoutSharedProfileV3({SharedRichProfile:{from_configuration_json:()=>selected}},config)).toThrow("matching Rust module");
  expect(()=>compileLayoutSharedProfileV3(wasm,config)).toThrow("ABI/model/history");expect(old.free).toHaveBeenCalledOnce();
  expect(compileStandardLayoutSharedProfileV3(wasm,config)).toBe(selected);expect(factory).toHaveBeenLastCalledWith(JSON.stringify(config));
  expect(()=>compileSharedProfile(wasm,{...config,formatVersion:1})).toThrow("ABI/model/history");expect(()=>compileStructuralSharedProfileV2(wasm,{...config,formatVersion:2})).toThrow("ABI/model/history");
 });
 it("refuses incomplete V3 owners before view acquisition, while old owners remain unsupported",()=>{
  type Raw={block_layout_version?:()=>unknown;block_layout_state_json?:unknown;change_selection_layout?:unknown};
  for(const mutate of [(r:Raw)=>{delete r.block_layout_version;},(r:Raw)=>{r.block_layout_version=()=>1;},(r:Raw)=>{r.block_layout_version=()=>"2";},(r:Raw)=>{delete r.block_layout_state_json;},(r:Raw)=>{delete r.change_selection_layout;}]){
   const a=shared();mutate(a.raw);expect(a.core).toThrow("matching native layout");expect(a.raw.observe).not.toHaveBeenCalled();expect(a.raw.free).toHaveBeenCalledOnce();
  }
  const a=shared(false,true,v2),c=a.core();expect(c.supportsBlockLayout()).toBe(false);expect(()=>c.changeSelectionLayout({alignment:"start"})).toThrow("matching native layout");expect(a.raw.dispatch).not.toHaveBeenCalled();c.dispose();
 });
 it("allows native layout reads while locked and checks stale intent before serializing a patch",()=>{
  const a=shared(true),c=a.core(),events=vi.fn();c.subscribe(events);
  expect(c.blockLayoutState()).toEqual({alignment:{kind:"mixed"},direction:{kind:"uniform",value:null}});
  expect(()=>c.changeSelectionLayout({alignment:"center"},"1")).toThrow("read-only");expect(a.raw.change_selection_layout).not.toHaveBeenCalled();expect(events).not.toHaveBeenCalled();c.dispose();
  const b=shared(),d=b.core(),getter=vi.fn(()=>"center"),patch=Object.defineProperty({},"alignment",{enumerable:true,get:getter});
  expect(()=>d.changeSelectionLayout(patch,"0")).toThrow("older shared publication");expect(getter).not.toHaveBeenCalled();expect(b.raw.change_selection_layout).not.toHaveBeenCalled();d.dispose();
 });
 it("dispatches only named native layout intent, keeps null versus omission, and publishes once",()=>{
  const a=shared(),c=a.core(),events=vi.fn();c.subscribe(events);
  expect(c.changeSelectionLayout({alignment:null,indent:0},"1")).toBe(true);expect(a.raw.change_selection_layout.mock.calls[0]?.[1]).toBe('{"alignment":null,"indent":0}');expect(a.raw.dispatch).not.toHaveBeenCalled();expect(events).toHaveBeenCalledOnce();c.dispose();
  const b=shared(false,false),d=b.core(),noevents=vi.fn();d.subscribe(noevents);expect(d.changeSelectionLayout({direction:"rtl"})).toBe(false);expect(noevents).not.toHaveBeenCalled();d.dispose();
 });
 it("keeps storage and relay V3 bindings exact without reinterpreting V1/V2",()=>{
  const journal=JSON.stringify({format:"breditor/rich-replica-journal",version:14,document:"room",writer:"101"});
  expect(()=>checkCheckpoint(journal,"room","101",3)).not.toThrow();for(const language of [1,2] as const)expect(()=>checkCheckpoint(journal,"room","101",language)).toThrow("leased room/writer/model");
  const grouped={format:"breditor/shared-typing-session",formatVersion:1,modelVersion:13,journalVersion:14,journal:{format:"breditor/rich-replica-typing-journal",version:1,document:"room",writer:"101"}};
  expect(()=>checkCheckpoint(JSON.stringify(grouped),"room","101",3,"typing-v1")).not.toThrow();expect(()=>checkCheckpoint(JSON.stringify({...grouped,modelVersion:12}),"room","101",3,"typing-v1")).toThrow();
  const schema={schema:{name:"test/layout",version:1},schemaFingerprint:`sha256:${"a".repeat(64)}`},relay=descriptor(JSON.stringify({format:"breditor/shared-rich-profile-descriptor",formatVersion:1,...schema,...v3}));
  expect(()=>checkDescriptor({descriptor:()=>({...schema,...v3})} as SharedRichEditor,relay)).not.toThrow();expect(()=>checkDescriptor({descriptor:()=>({...schema,...v2})} as SharedRichEditor,relay)).toThrow("profile_mismatch");
 });
 it("selects local V3 only explicitly and requires native layout state capability",()=>{
  const a=local(),p=compileStandardLayoutRichProfileV3(a.wasm,"native input"),c=p.createEditor("native document");expect(c.richLanguageVersion?.()).toBe(3);expect(c.supportsBlockLayout?.()).toBe(true);expect(c.blockLayoutState?.()).toEqual({alignment:{kind:"uniform",value:"start"}});c.dispose();p.dispose();
  for(const compile of [compileRichProfile,compileStructuralRichProfileV2]){const a=local();expect(()=>compile(a.wasm,"native input")).toThrow("Unsupported rich owner ABI");expect(a.raw.free).toHaveBeenCalledOnce();}
  const unrecognized=local({richLanguageVersion:1});expect(()=>compileRichProfile(unrecognized.wasm,"native input")).toThrow("Unsupported rich owner ABI");expect(unrecognized.raw.free).toHaveBeenCalledOnce();
  for(const capability of [null,"0","2",1]){const a=local(undefined,capability),p=compileStandardLayoutRichProfileV3(a.wasm,"native input");expect(()=>p.createEditor("native document")).toThrow("matching native layout");expect(a.editor.free).toHaveBeenCalledOnce();expect(a.observation.free).toHaveBeenCalledOnce();p.dispose();}
 });
});
