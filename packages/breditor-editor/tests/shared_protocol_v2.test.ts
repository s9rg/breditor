import {describe,it,expect,vi} from "vitest";
import {sharedProtocolLanguage} from "../../breditor-collaboration/src/protocol.js";
import {compileSharedProfile,compileStructuralSharedProfileV2,compileStandardStructuralSharedProfileV2,type SharedRustProfile,type SharedProfileModule} from "../../breditor-collaboration/src/profile.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {checkCheckpoint} from "../../breditor-collaboration/src/persistence/session_database.js";
import {descriptor,checkDescriptor} from "../../breditor-collaboration/src/relay/validation.js";
const v1={abiVersion:1,modelVersion:11,journalVersion:12},v2={abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2};
const config={format:"breditor/shared-rich-profile" as const,formatVersion:2 as const,schema:{name:"test/v2",version:2},extensions:[]};
function profile(binding:object){return {descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-profile-descriptor",formatVersion:1,...binding}),free:vi.fn()} as unknown as SharedRustProfile;}
describe("explicit shared V2 protocol selection",()=>{
 it("requires relay language, model and history bindings to match even with identical schema labels",()=>{
  const shared={schema:{name:"example/profile",version:2},schemaFingerprint:`sha256:${"a".repeat(64)}`};
  const relay=(binding:object)=>descriptor(JSON.stringify({format:"breditor/shared-rich-profile-descriptor",formatVersion:1,...shared,...binding}));
  const core={descriptor:()=>({...shared,...v2})} as SharedRichEditor;
  expect(()=>checkDescriptor(core,relay(v2))).not.toThrow();expect(()=>checkDescriptor(core,relay(v1))).toThrow("profile_mismatch");
  for(const binding of [{...v2,journalVersion:12},{...v1,richLanguageVersion:2},{...v2,richLanguageVersion:undefined}])expect(()=>relay(binding)).toThrow("profile_mismatch");
 });
 it("keeps the storage guard V1 by default and requires explicit V2 journal selection",()=>{
  const journal=(version:number)=>JSON.stringify({format:"breditor/rich-replica-journal",version,document:"room",writer:"101"});
  expect(()=>checkCheckpoint(journal(12),"room","101")).not.toThrow();expect(()=>checkCheckpoint(journal(13),"room","101",2)).not.toThrow();
  expect(()=>checkCheckpoint(journal(13),"room","101")).toThrow("leased room/writer/model");expect(()=>checkCheckpoint(journal(12),"room","101",2)).toThrow("leased room/writer/model");
  expect(()=>checkCheckpoint(journal(13),"other-room","101",2)).toThrow();expect(()=>checkCheckpoint(journal(13),"room","202",2)).toThrow();
 });
 it("accepts only the exact original and structural tuples, never independent version ranges",()=>{
  expect(sharedProtocolLanguage(v1)).toBe(1);expect(sharedProtocolLanguage(v2)).toBe(2);
  for(const d of [null,[],{...v1,richLanguageVersion:2},{...v2,richLanguageVersion:undefined},{...v2,richLanguageVersion:1},{...v2,abiVersion:2},{...v1,journalVersion:13},{...v2,journalVersion:12},{...v2,modelVersion:13}])expect(sharedProtocolLanguage(d)).toBeUndefined();
 });
 it("requires a separate native V2 factory and frees a returned mismatched profile",()=>{
  const old=profile(v1),native=vi.fn(()=>old),wasm={SharedRichProfile:{from_configuration_json:native}};
  expect(()=>compileStructuralSharedProfileV2(wasm,config)).toThrow("matching Rust module");expect(native).not.toHaveBeenCalled();
  const wrong={SharedRichProfile:{...wasm.SharedRichProfile,from_configuration_json_v2:()=>old}};
  expect(()=>compileStructuralSharedProfileV2(wrong,config)).toThrow("ABI/model/history");expect(old.free).toHaveBeenCalledOnce();
 });
 it("keeps old compilation V1-only and calls the distinct standard V2 factory with exact configuration",()=>{
  const rejected=profile(v2),selected=profile(v2),factory=vi.fn().mockReturnValueOnce(rejected).mockReturnValue(selected),wasm:SharedProfileModule={SharedRichProfile:{from_configuration_json:factory,from_configuration_json_v2:factory,from_standard_configuration_json_v2:factory}};
  expect(()=>compileSharedProfile(wasm,{...config,formatVersion:1})).toThrow("ABI/model/history");
  expect(rejected.free).toHaveBeenCalledOnce();expect(compileStructuralSharedProfileV2(wasm,config)).toBe(selected);expect(compileStandardStructuralSharedProfileV2(wasm,config)).toBe(selected);expect(factory).toHaveBeenLastCalledWith(JSON.stringify(config));expect(selected.free).not.toHaveBeenCalled();selected.free();
 });
 it("transfers a valid V2 owner but frees malformed owners before reading their view",()=>{
  const raw=(binding:object)=>({descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",...binding}),observe:vi.fn(()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1}),free:vi.fn()})),free:vi.fn()});
  const valid=raw(v2),core=new SharedRichEditor(valid as unknown as SharedRustOwner);expect(core.richLanguageVersion()).toBe(2);core.dispose();expect(valid.free).toHaveBeenCalledOnce();
  const invalid=raw({...v2,journalVersion:12});expect(()=>new SharedRichEditor(invalid as unknown as SharedRustOwner)).toThrow("ABI/model/history");expect(invalid.observe).not.toHaveBeenCalled();expect(invalid.free).toHaveBeenCalledOnce();
 });
});
