import {describe,it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const changes=[{kind:"set" as const,formatsJson:'[{"type":"breditor/strong","properties":{}}]'}];
function owner(readOnly=false,changed=true){
 let revision=1;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(readOnly?{readOnly:true}:{})}),free:vi.fn()}),selection_formatting_version:()=>"1",selection_coverage_json:vi.fn((_o:unknown,scope:string)=>JSON.stringify({scope})),selection_format_state_json:vi.fn((_o:unknown,formatKind:string)=>JSON.stringify({formatKind})),change_selection_formats:vi.fn((_o:unknown,_json:string)=>{if(changed)revision++;return changed;}),dispatch:vi.fn(),free:vi.fn()};
 return {raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
describe("native selection-formatting facade",()=>{
 it("requires exact capability and every read/mutation method, never JS dispatch",()=>{
  type Capability={selection_formatting_version?:()=>unknown;selection_coverage_json?:unknown;selection_format_state_json?:unknown;change_selection_formats?:unknown};
  const mutations:((r:Capability)=>void)[]=[r=>{delete r.selection_formatting_version;},r=>{r.selection_formatting_version=()=>"2";},r=>{r.selection_formatting_version=()=>1;},r=>{delete r.selection_coverage_json;},r=>{delete r.selection_format_state_json;},r=>{delete r.change_selection_formats;}];
  for(const mutate of mutations){const a=owner();mutate(a.raw);const c=a.core();expect(c.supportsSelectionFormatting()).toBe(false);expect(()=>c.selectionCoverage()).toThrow("matching native selection-formatting");expect(()=>c.selectionFormatState("breditor/strong")).toThrow("matching native selection-formatting");expect(()=>c.changeSelectionFormats(changes)).toThrow("matching native selection-formatting");expect(a.raw.dispatch).not.toHaveBeenCalled();expect(c.view().revision).toBe("1");c.dispose();}
 });
 it("read-only permits native reads but refuses mutation; stale intents do not author",()=>{
  const a=owner(true),c=a.core(),listener=vi.fn();c.subscribe(listener);expect(c.selectionCoverage()).toEqual({scope:"selection"});expect(c.selectionCoverage("document")).toEqual({scope:"document"});expect(c.selectionFormatState("breditor/strong")).toEqual({formatKind:"breditor/strong"});expect(listener).not.toHaveBeenCalled();expect(()=>c.changeSelectionFormats(changes,"1")).toThrow("read-only");expect(a.raw.change_selection_formats).not.toHaveBeenCalled();c.dispose();
  const b=owner(),d=b.core();expect(()=>d.changeSelectionFormats(changes,"0")).toThrow("older shared publication");expect(b.raw.change_selection_formats).not.toHaveBeenCalled();d.dispose();
 });
 it("no-op retains publication; named intent publishes once without adding targets",()=>{
  const a=owner(false,false),c=a.core(),listener=vi.fn();c.subscribe(listener);expect(c.changeSelectionFormats(changes,"1")).toBe(false);expect(listener).not.toHaveBeenCalled();expect(c.view().revision).toBe("1");c.dispose();
  const b=owner(),d=b.core(),events=vi.fn();d.subscribe(events);expect(d.changeSelectionFormats(changes,"1")).toBe(true);expect(events).toHaveBeenCalledOnce();expect(b.raw.change_selection_formats.mock.calls[0]?.[1]).toBe(JSON.stringify({changes}));expect(b.raw.dispatch).not.toHaveBeenCalled();d.dispose();
 });
});
