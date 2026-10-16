import {describe,it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
function owner(readOnly=false,changed=true){
 let revision=1;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(readOnly?{readOnly:true}:{})}),free:vi.fn()}),flow_navigation_version:()=>"1",navigate_flow:vi.fn((_o:unknown,_direction:string)=>{if(changed)revision++;return changed;}),insert_paragraph_adjacent:vi.fn((_o:unknown,_id:string,_side:string)=>{revision++;return true;}),dispatch:vi.fn(),free:vi.fn()};
 return {raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
describe("native flow navigation facade",()=>{
 it("requires exact capability and both methods without JS flow dispatch fallback",()=>{
  type Capability={flow_navigation_version?:()=>unknown;navigate_flow?:unknown;insert_paragraph_adjacent?:unknown};
  const changes:((r:Capability)=>void)[]=[r=>{delete r.flow_navigation_version;},r=>{r.flow_navigation_version=()=>"2";},r=>{r.flow_navigation_version=()=>1;},r=>{delete r.navigate_flow;},r=>{delete r.insert_paragraph_adjacent;}];
  for(const change of changes){const a=owner();change(a.raw);const core=a.core();expect(core.supportsFlowNavigation()).toBe(false);expect(()=>core.navigateFlow("after")).toThrow("matching native flow-navigation");expect(()=>core.insertParagraphAdjacent("fresh","before")).toThrow("matching native flow-navigation");expect(a.raw.dispatch).not.toHaveBeenCalled();expect(core.view().revision).toBe("1");core.dispose();}
 });
 it("read-only permits movement but refuses adjacent content before native authoring",()=>{
  const a=owner(true),core=a.core(),listener=vi.fn();core.subscribe(listener);
  expect(core.navigateFlow("before","1")).toBe(true);expect(a.raw.navigate_flow).toHaveBeenCalledOnce();expect(listener).toHaveBeenCalledOnce();expect(core.view().revision).toBe("2");
  expect(()=>core.insertParagraphAdjacent("fresh","after","2")).toThrow("read-only");expect(a.raw.insert_paragraph_adjacent).not.toHaveBeenCalled();core.dispose();
 });
 it("stale and no-op movement retain publication and successful insertion publishes once",()=>{
  const a=owner(false,false),core=a.core(),listener=vi.fn();core.subscribe(listener);
  expect(()=>core.navigateFlow("after","0")).toThrow("older shared publication");expect(a.raw.navigate_flow).not.toHaveBeenCalled();
  expect(core.navigateFlow("after","1")).toBe(false);expect(listener).not.toHaveBeenCalled();expect(core.view().revision).toBe("1");
  expect(core.insertParagraphAdjacent("fresh","before","1")).toBe(true);expect(a.raw.insert_paragraph_adjacent.mock.calls[0]?.slice(1)).toEqual(["fresh","before"]);expect(listener).toHaveBeenCalledOnce();core.dispose();
 });
});
