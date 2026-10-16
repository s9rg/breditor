import {it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const request={format:{type:"breditor-inline/link",properties:{"breditor-inline/href":"https://example.test/","breditor-inline/new-window":false}},properties:["breditor-inline/href"],targets:[{block:"p",offset:0,length:4}]};
function setup(capability=true){
 let revision=0;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision)}),free:()=>{}}),dispatch:vi.fn(),patch_inline_format_properties:capability?vi.fn(()=>{revision++;return true;}):undefined,free:vi.fn()};
 return {raw,core:new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
it("shared property patches cross one guarded Rust intent boundary without JS annotation lowering",()=>{
 const {raw,core}=setup(),published=vi.fn();core.subscribe(published);
 expect(core.supportsInlinePropertyPatches()).toBe(true);expect(core.patchInlineFormatProperties(request,"0")).toBe(true);
 expect(raw.patch_inline_format_properties).toHaveBeenCalledOnce();expect(raw.dispatch).not.toHaveBeenCalled();
 const [observation,input]=raw.patch_inline_format_properties!.mock.calls[0] as unknown as [unknown,string];
 expect(observation).toBeTruthy();expect(JSON.parse(input)).toEqual({formatsJson:JSON.stringify([request.format]),properties:request.properties,targets:request.targets});
 expect(published).toHaveBeenCalledOnce();core.dispose();
});
it("stale, disposed and reentrant patches cannot reach the native planner",()=>{
 const {raw,core}=setup();expect(()=>core.patchInlineFormatProperties(request,"old")).toThrow(expect.objectContaining({code:"stale_observation"}));expect(raw.patch_inline_format_properties).not.toHaveBeenCalled();
 let error:unknown;core.subscribe(()=>{try{core.patchInlineFormatProperties(request);}catch(cause){error=cause;}});core.patchInlineFormatProperties(request);expect(error).toMatchObject({code:"reentrant_publication"});expect(raw.patch_inline_format_properties).toHaveBeenCalledOnce();
 core.dispose();expect(()=>core.patchInlineFormatProperties(request)).toThrow(expect.objectContaining({code:"disposed"}));expect(raw.patch_inline_format_properties).toHaveBeenCalledOnce();
});
it("older matching owners report the missing capability and never fall back to guessed formatting",()=>{
 const {raw,core}=setup(false);expect(core.supportsInlinePropertyPatches()).toBe(false);expect(()=>core.patchInlineFormatProperties(request)).toThrow(expect.objectContaining({code:"property_patch_unavailable"}));expect(raw.dispatch).not.toHaveBeenCalled();expect(core.view().revision).toBe("0");core.dispose();
});
