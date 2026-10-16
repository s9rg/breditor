import {describe,it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
function owner(readOnly=false,changed=true){
 let revision=1;
 const change=()=>{if(changed)revision++;return changed;};
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:12,journalVersion:13,richLanguageVersion:2}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(readOnly?{readOnly:true}:{})}),free:vi.fn()}),atom_edit_version:()=>"1",delete_atom:vi.fn(change),replace_atom_plain_text:vi.fn(change),replace_atom_typing_text:vi.fn(change),dispatch:vi.fn(),free:vi.fn()};
 return {raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
describe("native atom-edit facade",()=>{
 it("requires exact capability and every method without JS dispatch fallback",()=>{
  type Capability={atom_edit_version?:()=>unknown;delete_atom?:unknown;replace_atom_plain_text?:unknown;replace_atom_typing_text?:unknown};
  const changes:((r:Capability)=>void)[]=[r=>{delete r.atom_edit_version;},r=>{r.atom_edit_version=()=>"2";},r=>{r.atom_edit_version=()=>1;},r=>{delete r.delete_atom;},r=>{delete r.replace_atom_plain_text;},r=>{delete r.replace_atom_typing_text;}];
  for(const change of changes){const a=owner();change(a.raw);const c=a.core();expect(c.supportsAtomEditing()).toBe(false);expect(()=>c.deleteAtom("p","after")).toThrow("matching native atom-edit");expect(()=>c.replaceAtomPlainText("p","Q")).toThrow("matching native atom-edit");expect(()=>c.replaceAtomTypingText("p","Q","1")).toThrow("matching native atom-edit");expect(a.raw.dispatch).not.toHaveBeenCalled();expect(c.view().revision).toBe("1");c.dispose();}
 });
 it("read-only and stale requests reject before any native authoring",()=>{
  const a=owner(true),c=a.core(),listener=vi.fn();c.subscribe(listener);
  expect(()=>c.deleteAtom("p","before","1")).toThrow("read-only");expect(()=>c.replaceAtomPlainText("p","Q","1")).toThrow("read-only");expect(()=>c.replaceAtomTypingText("p","Q","1","1")).toThrow("read-only");expect(a.raw.delete_atom).not.toHaveBeenCalled();expect(a.raw.replace_atom_plain_text).not.toHaveBeenCalled();expect(a.raw.replace_atom_typing_text).not.toHaveBeenCalled();expect(listener).not.toHaveBeenCalled();c.dispose();
  const b=owner(),d=b.core();expect(()=>d.deleteAtom("p","after","0")).toThrow("older shared publication");expect(b.raw.delete_atom).not.toHaveBeenCalled();d.dispose();
 });
 it("no-op retains revision and each successful named method publishes exactly once",()=>{
  const a=owner(false,false),c=a.core(),listener=vi.fn();c.subscribe(listener);expect(c.replaceAtomTypingText("p","","1","1")).toBe(false);expect(listener).not.toHaveBeenCalled();expect(c.view().revision).toBe("1");c.dispose();
  const b=owner(),d=b.core(),events=vi.fn();d.subscribe(events);expect(d.deleteAtom("p","before","1")).toBe(true);expect(d.replaceAtomPlainText("q","Q","2")).toBe(true);expect(d.replaceAtomTypingText("r","R","4","3")).toBe(true);expect(events).toHaveBeenCalledTimes(3);expect(b.raw.dispatch).not.toHaveBeenCalled();d.dispose();
 });
});
