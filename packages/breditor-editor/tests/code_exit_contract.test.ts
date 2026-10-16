import {describe,it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
function owner(readOnly=false){
 let revision=1;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>{const view=JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(readOnly?{readOnly:true}:{})});return {view_json:()=>view,free:vi.fn()};},code_exit_version:()=>"1",exit_code_block:vi.fn((_o:unknown,_id:string)=>{revision++;return true;}),dispatch:vi.fn(),free:vi.fn()};
 return {raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
describe("native shared code exit facade",()=>{
 it("requires exact capability and never falls back to a JS flow dispatch",()=>{
  type Capability={code_exit_version?:()=>unknown;exit_code_block?:unknown};
  const changes:((r:Capability)=>void)[]=[r=>{delete r.code_exit_version;},r=>{r.code_exit_version=()=>"2";},r=>{r.code_exit_version=()=>1;},r=>{delete r.exit_code_block;}];
  for(const change of changes){
   const a=owner();change(a.raw);const core=a.core();expect(core.supportsCodeExit()).toBe(false);expect(()=>core.exitCodeBlock("fresh")).toThrow("matching native code-exit");expect(a.raw.dispatch).not.toHaveBeenCalled();expect(core.view().revision).toBe("1");core.dispose();
  }
 });
 it("checks policy and revision before authoring and publishes once after native admission",()=>{
  const a=owner(),core=a.core(),listener=vi.fn();core.subscribe(listener);expect(core.supportsCodeExit()).toBe(true);
  expect(()=>core.exitCodeBlock("fresh","0")).toThrow("older shared publication");expect(a.raw.exit_code_block).not.toHaveBeenCalled();
  expect(core.exitCodeBlock("fresh","1")).toBe(true);expect(a.raw.exit_code_block).toHaveBeenCalledOnce();expect(a.raw.exit_code_block.mock.calls[0]?.[1]).toBe("fresh");expect(core.view().revision).toBe("2");expect(listener).toHaveBeenCalledOnce();core.dispose();
  const b=owner(true),locked=b.core();expect(()=>locked.exitCodeBlock("fresh")).toThrow("read-only");expect(b.raw.exit_code_block).not.toHaveBeenCalled();locked.dispose();
 });
});
