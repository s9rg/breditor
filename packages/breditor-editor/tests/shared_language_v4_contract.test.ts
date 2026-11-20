import {describe,it,expect,vi} from "vitest";
import {compileRichSharedProfileV4,compileStandardRichSharedProfileV4,compileLayoutSharedProfileV3,type SharedRustProfile,type SharedProfileModule} from "../../breditor-collaboration/src/profile.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {sharedProtocolLanguage,sharedModelVersion,sharedJournalVersion,isSharedRichLanguage,sharedV4SliceVersions} from "../../breditor-collaboration/src/protocol.js";
import {checkCheckpoint} from "../../breditor-collaboration/src/persistence/session_database.js";
import {checkSharedRichLanguage} from "../src/shared_language.js";

const slices=Object.fromEntries(sharedV4SliceVersions.map(name=>[name,1]));
const v3={abiVersion:1,modelVersion:13,journalVersion:14,richLanguageVersion:3,blockLayoutVersion:1};
const v4={abiVersion:1,modelVersion:14,journalVersion:15,richLanguageVersion:4,blockLayoutVersion:1,...slices};
const config={format:"breditor/shared-rich-profile" as const,formatVersion:4 as const,schema:{name:"test/v4",version:1},extensions:[]};
function nativeProfile(binding:object){return {descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-profile-descriptor",formatVersion:1,...binding}),free:vi.fn()} as unknown as SharedRustProfile;}
const sliceMethods=["list_numbering_version","text_language_version","image_link_version","details_version","mention_version","table_caption_version","page_break_version","bookmark_version"];
function owner(binding:object=v4,slice="1",omit?:string){
 const raw:Record<string,unknown>={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",...binding}),observe:vi.fn(()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:"1"}),free:vi.fn()})),
  block_layout_version:()=>"1",block_layout_state_json:vi.fn(()=>"{}"),change_selection_layout:vi.fn(()=>true),rich_language_version:()=>"4",free:vi.fn()};
 for(const name of sliceMethods)if(name!==omit)raw[name]=()=>slice;
 return raw;
}

describe("explicit shared rich language V4 boundary",()=>{
 it("binds language 4 only to the exact model 14/journal 15 tuple with every slice version",()=>{
  expect(sharedProtocolLanguage(v4)).toBe(4);expect(sharedProtocolLanguage(v3)).toBe(3);
  expect([1,2,3,4].map(l=>sharedModelVersion(l as 1)) ).toEqual([11,12,13,14]);expect([1,2,3,4].map(l=>sharedJournalVersion(l as 1))).toEqual([12,13,14,15]);
  for(const value of [1,2,3,4])expect(isSharedRichLanguage(value)).toBe(true);
  for(const value of [0,5,"4",4.5,undefined,null])expect(isSharedRichLanguage(value)).toBe(false);
  const bad:object[]=[{...v4,modelVersion:13},{...v4,journalVersion:14},{...v4,richLanguageVersion:3},{...v4,blockLayoutVersion:undefined},{...v3,...slices},{...v3,mentionVersion:1},{...v4,abiVersion:2}];
  for(const name of sharedV4SliceVersions){bad.push({...v4,[name]:undefined},{...v4,[name]:2});}
  for(const value of bad)expect(sharedProtocolLanguage(value)).toBeUndefined();
 });
 it("compiles only through the explicit V4 factories and refuses crossed descriptors",()=>{
  const plain=vi.fn(()=>nativeProfile(v4)),standard=vi.fn(()=>nativeProfile(v4));
  const wasm={SharedRichProfile:{from_configuration_json:vi.fn(),from_configuration_json_v4:plain,from_standard_configuration_json_v4:standard,from_configuration_json_v3:vi.fn(()=>nativeProfile(v4))}} as unknown as SharedProfileModule;
  compileRichSharedProfileV4(wasm,config);compileStandardRichSharedProfileV4(wasm,config);
  expect(plain).toHaveBeenCalledWith(JSON.stringify(config));expect(standard).toHaveBeenCalledOnce();
  expect(()=>compileLayoutSharedProfileV3(wasm,{...config,formatVersion:3})).toThrow("Unsupported shared profile");
  const crossed=nativeProfile(v3);
  expect(()=>compileRichSharedProfileV4({SharedRichProfile:{from_configuration_json:vi.fn(),from_configuration_json_v4:()=>crossed}} as unknown as SharedProfileModule,config)).toThrow("Unsupported shared profile");expect(crossed.free).toHaveBeenCalledOnce();
  expect(()=>compileRichSharedProfileV4({SharedRichProfile:{from_configuration_json:vi.fn()}} as unknown as SharedProfileModule,config)).toThrow("rich-language V4");
 });
 it("admits a V4 owner only when every frozen slice capability is present",()=>{
  const core=new SharedRichEditor(owner() as unknown as SharedRustOwner);
  expect(core.richLanguageVersion()).toBe(4);expect(core.supportsRichLanguageV4()).toBe(true);expect(core.supportsBlockLayout()).toBe(true);core.dispose();
  for(const raw of [owner(v4,"0"),owner(v4,"1","mention_version")])expect(()=>new SharedRichEditor(raw as unknown as SharedRustOwner)).toThrow("frozen V4 slice");
 });
 it("binds durable V4 journals to model 14/journal 15 and SDK openings accept exactly 1–4",()=>{
  const journal=JSON.stringify({format:"breditor/rich-replica-journal",version:15,document:"room",writer:"101"});
  expect(()=>checkCheckpoint(journal,"room","101",4)).not.toThrow();
  for(const language of [1,2,3] as const)expect(()=>checkCheckpoint(journal,"room","101",language)).toThrow("leased room/writer/model");
  const typing=JSON.stringify({format:"breditor/shared-typing-session",formatVersion:1,modelVersion:14,journalVersion:15,journal:{format:"breditor/rich-replica-typing-journal",version:1,document:"room",writer:"101"}});
  expect(()=>checkCheckpoint(typing,"room","101",4,"typing-v1")).not.toThrow();expect(()=>checkCheckpoint(typing,"room","101",3,"typing-v1")).toThrow();
  for(const value of [undefined,1,2,3,4])expect(()=>checkSharedRichLanguage(value)).not.toThrow();
  for(const value of [0,5,"4"])expect(()=>checkSharedRichLanguage(value)).toThrow("richLanguage 1, 2, 3 or 4");
 });
});
