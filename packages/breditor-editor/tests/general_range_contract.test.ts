import {describe,it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {supportsSharedGeneralRanges,restoreSharedGeneralEditor,type SharedRustProfile} from "../../breditor-collaboration/src/profile.js";
import type {SharedRustOwner,RichSelection} from "../../breditor-collaboration/src/types.js";
const selection:Extract<RichSelection,{kind:"text"}>={kind:"text",anchor:{block:"a",offset:"1",affinity:"after"},focus:{block:"b",offset:"3",affinity:"after"}};
function owner(readOnly=false,natural=false){
 let revision=1,general=false;
 const change=vi.fn(()=>{revision++;return true;});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(general?{rangeEditing:"general-v1"}:{}),...(natural?{historyGrouping:"typing-v1"}:{}),...(readOnly?{readOnly:true}:{})}),free:vi.fn()}),general_range_version:()=>"1",enable_general_ranges:vi.fn(()=>{if(general)return false;general=true;revision++;return true;}),replace_general_range_text:vi.fn((_o:unknown,_input:string)=>change()),replace_general_range_plain_text:vi.fn((_o:unknown,_input:string)=>change()),replace_general_range_typing_text:vi.fn((_o:unknown,_input:string)=>change()),general_checkpoint:vi.fn(()=>"general"),general_typing_checkpoint:vi.fn(()=>"general-typing"),checkpoint:vi.fn(()=>"original"),typing_history_version:()=>"1",enable_typing_history:vi.fn(change),close_typing_group:vi.fn(()=>false),insert_typing_text:vi.fn(change),delete_typing_range:vi.fn(change),typing_checkpoint:vi.fn(()=>"original-typing"),dispatch:vi.fn(),free:vi.fn()};
 return {raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
describe("explicit general-range facade",()=>{
 it("general paragraph editing requires its native capability and forwards one closed observed target",()=>{
  const a=owner(),c=a.core();expect(c.supportsGeneralParagraph()).toBe(false);expect(()=>c.insertGeneralParagraph(selection,"fresh")).toThrow("matching native general paragraph");const method=vi.fn((o:unknown,input:string)=>a.raw.replace_general_range_text(o,input));Object.assign(a.raw,{general_paragraph_version:()=>"1",insert_general_paragraph:method});c.enableGeneralRanges();c.insertGeneralParagraph(selection,"fresh","2");expect(JSON.parse(method.mock.calls[0]![1])).toEqual({selection,prefix:"fresh"});expect(()=>c.insertGeneralParagraph(selection,"fresh","2")).toThrow("older shared publication");expect(a.raw.dispatch).not.toHaveBeenCalled();c.dispose();
  const b=owner(true),d=b.core();expect(()=>d.insertGeneralParagraph(selection,"fresh","1")).toThrow("read-only");d.dispose();
 });
 it("general rich-flow capability is separate and retains the opaque request and guards",()=>{
  const a=owner(),c=a.core();expect(c.supportsGeneralFlowPaste()).toBe(false);expect(()=>c.pasteGeneralFlowClipboard(selection,"opaque","right","fresh")).toThrow("matching native general rich-flow clipboard");
  const method=vi.fn((o:unknown,input:string)=>a.raw.replace_general_range_text(o,input));Object.assign(a.raw,{general_flow_paste_version:()=>"1",paste_general_flow_clipboard:method});c.enableGeneralRanges();c.pasteGeneralFlowClipboard(selection,"opaque","right","fresh","2");expect(JSON.parse(method.mock.calls[0]![1])).toEqual({selection,clipboardJson:"opaque",right:"right",prefix:"fresh"});expect(()=>c.pasteGeneralFlowClipboard(selection,"opaque","right","fresh","2")).toThrow("older shared publication");expect(a.raw.dispatch).not.toHaveBeenCalled();c.dispose();
  const b=owner(true),d=b.core();expect(()=>d.pasteGeneralFlowClipboard(selection,"bad","right","fresh","1")).toThrow("read-only");d.dispose();
 });
 it("gates opaque inline clipboard paste separately without tightening the original general capability",()=>{
  const a=owner(),c=a.core();expect(c.supportsGeneralRanges()).toBe(true);expect(c.supportsGeneralInlinePaste()).toBe(false);expect(()=>c.pasteGeneralInlineClipboard(selection,"opaque native payload","fresh")).toThrow("matching native general inline clipboard");
  const method=vi.fn((o:unknown,input:string)=>a.raw.replace_general_range_text(o,input));Object.assign(a.raw,{general_inline_paste_version:()=>"1",paste_general_inline_clipboard:method});expect(c.supportsGeneralInlinePaste()).toBe(true);c.enableGeneralRanges();c.pasteGeneralInlineClipboard(selection,"opaque native payload","fresh","2");expect(JSON.parse(method.mock.calls[0]![1])).toEqual({selection,clipboardJson:"opaque native payload",prefix:"fresh"});expect(a.raw.dispatch).not.toHaveBeenCalled();
  Object.assign(a.raw,{general_inline_paste_version:()=>"2"});expect(c.supportsGeneralInlinePaste()).toBe(false);expect(c.supportsGeneralRanges()).toBe(true);expect(()=>c.pasteGeneralInlineClipboard(selection,"opaque","fresh")).toThrow("matching native general inline clipboard");c.dispose();
 });
 it("inline clipboard stale/read-only guards run before capability checks or payload handling",()=>{
  const a=owner(true),c=a.core();expect(()=>c.pasteGeneralInlineClipboard(selection,"not JSON","fresh","1")).toThrow("read-only");c.dispose();
  const b=owner(),d=b.core();expect(()=>d.pasteGeneralInlineClipboard(selection,"not JSON","fresh","0")).toThrow("older shared publication");expect(b.raw.dispatch).not.toHaveBeenCalled();d.dispose();
 });
 it("rejects an already selected general mode with an incomplete paired runtime before transfer",()=>{
  const a=owner();a.raw.enable_general_ranges();delete (a.raw as unknown as Record<string,unknown>)["replace_general_range_text"];expect(()=>a.core()).toThrow("complete matching native general-range");expect(a.raw.free).toHaveBeenCalledTimes(1);
 });
 it("requires an exact complete capability and never falls back to original dispatch",()=>{
  const fields=["general_range_version","enable_general_ranges","replace_general_range_text","replace_general_range_plain_text","replace_general_range_typing_text","general_checkpoint","general_typing_checkpoint"] as const;
  for(const field of fields){const a=owner();delete (a.raw as unknown as Record<string,unknown>)[field];const c=a.core();expect(c.supportsGeneralRanges()).toBe(false);expect(()=>c.enableGeneralRanges()).toThrow("matching native general-range");expect(()=>c.replaceGeneralRangeText(selection,[],"fresh")).toThrow("matching native general-range");expect(()=>c.replaceGeneralRangePlainText(selection,"Q","fresh")).toThrow("matching native general-range");expect(()=>c.replaceGeneralRangeTypingText(selection,"Q","fresh","1")).toThrow("matching native general-range");expect(a.raw.dispatch).not.toHaveBeenCalled();c.dispose();}
  const a=owner();a.raw.general_range_version=()=>"2";const c=a.core();expect(c.supportsGeneralRanges()).toBe(false);c.dispose();
 });
 it("submits closed targets and namespaces with one native publication and correct save family",()=>{
  for(const natural of [false,true]){const a=owner(false,natural),c=a.core(),events=vi.fn();c.subscribe(events);expect(c.checkpointJson()).toBe(natural?"original-typing":"original");
   expect(c.enableGeneralRanges("1")).toBe(true);expect(c.enableGeneralRanges("2")).toBe(false);
   c.replaceGeneralRangeText(selection,[{text:"Q",formatsJson:"[]"}],"rich","2");c.replaceGeneralRangePlainText(selection,"P","plain","3");c.replaceGeneralRangeTypingText(selection,"T","typed","42","4");
   expect(JSON.parse(a.raw.replace_general_range_plain_text.mock.calls[0]![1] as string)).toEqual({selection,text:"P",prefix:"plain"});
   expect(JSON.parse(a.raw.replace_general_range_typing_text.mock.calls[0]![1] as string)).toEqual({selection,text:"T",prefix:"typed",clockMs:"42"});expect(events).toHaveBeenCalledTimes(4);expect(c.checkpointJson()).toBe(natural?"general-typing":"general");expect(a.raw.dispatch).not.toHaveBeenCalled();c.dispose();
  }
 });
 it("read-only and stale revisions reject before authoring or parsing requests",()=>{
  const a=owner(true),c=a.core();expect(()=>c.replaceGeneralRangePlainText(selection,"Q","fresh","1")).toThrow("read-only");expect(()=>c.replaceGeneralRangeTypingText(selection,"Q","fresh","1","1")).toThrow("read-only");expect(a.raw.replace_general_range_plain_text).not.toHaveBeenCalled();expect(a.raw.replace_general_range_typing_text).not.toHaveBeenCalled();c.dispose();
  const b=owner(),d=b.core();expect(()=>d.enableGeneralRanges("0")).toThrow("older shared publication");expect(()=>d.replaceGeneralRangeText(selection,[],"fresh","0")).toThrow("older shared publication");expect(b.raw.enable_general_ranges).not.toHaveBeenCalled();expect(b.raw.replace_general_range_text).not.toHaveBeenCalled();d.dispose();
 });
 it("immutable storage policy prevents a live legacy session upgrading behind its record guard",()=>{
  const a=owner(),c=a.core();c.sealRangePolicy("original");expect(()=>c.enableGeneralRanges()).toThrow("immutable");expect(a.raw.enable_general_ranges).not.toHaveBeenCalled();expect(()=>c.sealRangePolicy("general-v1")).toThrow("does not match");expect(c.checkpointJson()).toBe("original");c.dispose();
  const b=owner(),d=b.core();d.enableGeneralRanges();d.sealRangePolicy("general-v1");expect(()=>d.sealRangePolicy("original")).toThrow("does not match");expect(d.checkpointJson()).toBe("general");d.dispose();
 });
 it("uses explicit matching recovery only and never sniffs or downgrades opaque saves",()=>{
  const raw=owner().raw,original=vi.fn(()=>raw),general=vi.fn(()=>raw),typing=vi.fn(()=>raw);
  const profile={general_range_version:()=>"1",restore:original,restore_general:general,restore_general_typing:typing} as unknown as SharedRustProfile;
  expect(supportsSharedGeneralRanges(profile)).toBe(true);expect(restoreSharedGeneralEditor(profile,"room","opaque")).toBe(raw);expect(restoreSharedGeneralEditor(profile,"room","opaque","typing-v1")).toBe(raw);expect(general).toHaveBeenCalledWith("room","opaque");expect(typing).toHaveBeenCalledWith("room","opaque");expect(original).not.toHaveBeenCalled();
  delete profile.restore_general_typing;expect(supportsSharedGeneralRanges(profile)).toBe(false);expect(()=>restoreSharedGeneralEditor(profile,"room","opaque")).toThrow("matching native general-range recovery");expect(original).not.toHaveBeenCalled();
 });
});
