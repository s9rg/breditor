import {describe,expect,it,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {restoreSharedDocumentEditor} from "../../breditor-collaboration/src/profile.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";

// Native state is stubbed here; real release-Wasm behavior has a separate paired functional probe.
function owner(enabled=false){
 let revision=0,documentMode=enabled,selected=false;
 const view=()=>({format:documentMode?"breditor/shared-document-view":"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:"{}",selection:selected?{kind:"document"}:null,...(documentMode?{selectionEditing:"document-v1",rangeEditing:"general-v1"}:{})});
 const observation=()=>{const json=JSON.stringify(view());return {view_json:()=>json,free:vi.fn()};};
 const save=()=>JSON.stringify({format:"breditor/rich-replica-document-journal",version:1,document:"room",writer:"101",revision,selected});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:vi.fn(()=>{if(selected)throw Error("Original observer rejects document scope");return observation();}),free:vi.fn(),
  document_selection_version:()=>"1",document_typing_version:()=>"1",document_selection_enabled:()=>documentMode,enable_document_selection:vi.fn(()=>{documentMode=true;revision++;return true;}),observe_document:vi.fn(observation),document_view_json:()=>JSON.stringify(view()),
  document_clipboard_version:()=>"1",paste_document_clipboard:vi.fn((_observation:unknown,_input:string)=>{selected=false;revision++;return true;}),
  select_document:vi.fn(()=>{selected=true;revision++;return true;}),copy_document_clipboard:vi.fn(()=>JSON.stringify({richJson:"opaque native flow",plainText:""})),replace_document_plain_text:vi.fn(()=>{selected=false;revision++;return true;}),replace_document_typing_text:vi.fn(()=>{selected=false;revision++;return true;}),document_checkpoint:vi.fn(save),document_typing_checkpoint:vi.fn(save),
  general_range_version:()=>"1",enable_general_ranges:()=>false,replace_general_range_text:()=>true,replace_general_range_plain_text:()=>true,replace_general_range_typing_text:()=>true,general_checkpoint:vi.fn(()=>{throw Error("Wrong recovery family");}),general_typing_checkpoint:vi.fn(()=>{throw Error("Wrong recovery family");}),
  receive_frame:vi.fn(()=>{revision++;}),checkpoint:vi.fn(()=>"original"),set_selection:vi.fn(()=>{selected=false;revision++;return true;})};
 return {raw:raw as unknown as SharedRustOwner,methods:raw};
}
describe("explicit shared document scope facade",()=>{
 it("negotiates rich paste independently and forwards one guarded opaque request",()=>{
  const a=owner(),core=new SharedRichEditor<"document-v1">(a.raw,{selectionEditing:"document-v1"});
  expect(core.supportsDocumentClipboard()).toBe(true);core.selectDocument();const revision=core.view().revision;
  core.pasteDocumentClipboard("opaque native clipboard","reserved",revision);
  expect(a.methods.paste_document_clipboard).toHaveBeenCalledOnce();expect(JSON.parse(a.methods.paste_document_clipboard.mock.calls[0]?.[1]??"null")).toEqual({clipboardJson:"opaque native clipboard",prefix:"reserved"});
  expect(()=>core.pasteDocumentClipboard("opaque","unused",revision)).toThrow("older shared publication");expect(a.methods.paste_document_clipboard).toHaveBeenCalledOnce();core.dispose();
  for(const method of ["document_clipboard_version","paste_document_clipboard"] as const){const b=owner();delete b.raw[method];const old=new SharedRichEditor<"document-v1">(b.raw,{selectionEditing:"document-v1"});expect(old.supportsDocumentSelection()).toBe(true);expect(old.supportsDocumentClipboard()).toBe(false);old.selectDocument();const exact=old.checkpointJson();expect(()=>old.pasteDocumentClipboard("opaque","unused")).toThrow("matching native whole-document rich paste");expect(old.checkpointJson()).toBe(exact);old.dispose();}
  const b=owner(),old=new SharedRichEditor(b.raw);expect(()=>Reflect.apply(old.pasteDocumentClipboard,old,["opaque","unused"])).toThrow("explicit selectionEditing");expect(b.methods.paste_document_clipboard).not.toHaveBeenCalled();old.dispose();
 });
 it("publishes only the chosen view family and uses document recovery even after the caret returns",()=>{
  const a=owner(),core=new SharedRichEditor<"document-v1">(a.raw,{selectionEditing:"document-v1"}),listener=vi.fn();core.subscribe(listener);
  expect(core.selectionPolicy()).toBe("document-v1");expect(a.methods.enable_document_selection).toHaveBeenCalledOnce();
  core.selectDocument();expect(core.view().selection).toEqual({kind:"document"});expect(core.view().format).toBe("breditor/shared-document-view");
  const exact=core.checkpointJson();expect(core.copyDocument()).toEqual({richJson:"opaque native flow",plainText:""});expect(core.checkpointJson()).toBe(exact);
  const old=core.view().revision;core.replaceDocumentPlainText("fresh","X",old);
  expect(core.view().selection).toBeNull();expect(()=>core.replaceDocumentPlainText("fresh2","Y",old)).toThrow("older shared publication");
  expect(a.methods.replace_document_plain_text).toHaveBeenCalledOnce();expect(JSON.parse(core.checkpointJson()).format).toBe("breditor/rich-replica-document-journal");
  expect(a.methods.general_checkpoint).not.toHaveBeenCalled();expect(a.methods.checkpoint).not.toHaveBeenCalled();expect(listener).toHaveBeenCalledTimes(2);core.dispose();
 });
 it("keeps the explicit observer when remote publication happens during document scope",async()=>{
  const a=owner(),core=new SharedRichEditor<"document-v1">(a.raw,{selectionEditing:"document-v1"}),listener=vi.fn();core.selectDocument();core.subscribe(listener);
  const release=core.holdRemotes(),pending=core.receiveFrame("opaque native frame");expect(a.methods.receive_frame).not.toHaveBeenCalled();release();await pending;
  expect(core.view().selection).toEqual({kind:"document"});expect(listener.mock.calls[0]?.[0].source).toBe("remote");expect(a.methods.observe).toHaveBeenCalledOnce();core.dispose();
 });
 it("rejects missing capabilities and default-mode adoption rather than guessing a family",()=>{
  for(const method of ["document_selection_version","document_typing_version","observe_document","select_document","copy_document_clipboard","replace_document_plain_text","replace_document_typing_text","document_checkpoint","document_typing_checkpoint"] as const){
   const a=owner();delete a.raw[method];expect(()=>new SharedRichEditor<"document-v1">(a.raw,{selectionEditing:"document-v1"})).toThrow("complete matching native");expect(a.methods.free).toHaveBeenCalledOnce();
  }
  const a=owner(true);expect(()=>new SharedRichEditor(a.raw)).toThrow("requires explicit selectionEditing");expect(a.methods.free).toHaveBeenCalledOnce();
  const b=owner(),old=new SharedRichEditor(b.raw);expect(old.selectionPolicy()).toBe("original");expect(()=>Reflect.apply(old.selectDocument,old,[])).toThrow("explicit selectionEditing");expect(b.methods.select_document).not.toHaveBeenCalled();old.dispose();
 });
 it("uses only the explicitly selected recovery factory without an old/general fallback",()=>{
  const original=vi.fn(),general=vi.fn(),explicit=vi.fn(),natural=vi.fn();const profile={document_selection_version:()=>"1",restore_document:explicit,restore_document_typing:natural,restore:original,restore_general:general};
  restoreSharedDocumentEditor(profile as never,"room","explicit bytes");restoreSharedDocumentEditor(profile as never,"room","natural bytes","typing-v1");
  expect(explicit).toHaveBeenCalledWith("room","explicit bytes");expect(natural).toHaveBeenCalledWith("room","natural bytes");expect(original).not.toHaveBeenCalled();expect(general).not.toHaveBeenCalled();
  expect(()=>restoreSharedDocumentEditor({restore:original} as never,"room","opaque")).toThrow("matching native document-selection recovery");expect(original).not.toHaveBeenCalled();
 });
});
