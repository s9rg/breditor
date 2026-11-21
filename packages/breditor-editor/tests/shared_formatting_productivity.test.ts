// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {createSharedFormattingProductivityToolbar} from "@breditor/collaboration";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as k} from "@breditor/experimental-rich-content";
import {staticInlineCatalogV4} from "../src/static_document.js";

const fingerprint=`sha256:${"ab".repeat(32)}`;
const presentation=createStandardRichInlinePresentationV1(JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/shared-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)}));
const point=(offset:number)=>({block:"p",offset:String(offset),affinity:"after" as const});
const caret={kind:"text" as const,anchor:point(1),focus:point(1)},range={kind:"text" as const,anchor:point(0),focus:point(3)};
function core(){
 const states:Record<string,unknown>={[k.strong]:{kind:"uniform",format:{type:k.strong,properties:{}}}};
 return {states,supportsCaseChange:()=>true,supportsSelectionFormatting:()=>true,
  selectionFormatState:(kind:string)=>({format:"breditor/rich-selection-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/shared-test",version:1,fingerprint},state:states[kind]??{kind:"unset"}}),
  changeSelectionCase:vi.fn(()=>true),changeSelectionFormats:vi.fn(()=>true),type:vi.fn(()=>true),replace:vi.fn(()=>true)};
}
const context=(owner:object,selection:unknown)=>({core:owner,model:{view:{selection,readOnly:false}},revision:"7",allocate:()=>"x"}) as never;

describe("shared formatting-productivity controls",()=>{
 it("publish native shared commands bound to their owner",()=>{
  const owner=core(),controls=createSharedFormattingProductivityToolbar(owner as never,presentation);
  expect(controls.map(c=>c.id)).toEqual(["special-characters","case-upper","case-lower","case-title","format-painter"]);
  const byId=(id:string)=>controls.find(c=>c.id===id)!;
  byId("case-lower").run(context(owner,range));
  expect(owner.changeSelectionCase).toHaveBeenCalledWith({change:"lower"},"7");
  byId("case-upper").run(context(owner,range),undefined,{change:"cycle"});
  expect(owner.changeSelectionCase).toHaveBeenLastCalledWith({change:"cycle"},"7");
  byId("special-characters").run(context(owner,caret),undefined,{value:"€"});
  expect(owner.type).toHaveBeenCalledWith("€","7");
  byId("special-characters").run(context(owner,range),undefined,{value:"→"});
  expect(owner.replace).toHaveBeenCalledWith(range,"→","7");
  // Painter: copy bold at the caret, then paint a plain target in one selection-format change.
  byId("format-painter").run(context(owner,caret));
  owner.states[k.strong]={kind:"unset"};
  byId("format-painter").run(context(owner,range),undefined,{painter:"apply"});
  expect(owner.changeSelectionFormats).toHaveBeenCalledWith([{kind:"set",formatsJson:JSON.stringify([{type:k.strong,properties:{}}])}],"7");
  expect(()=>byId("case-title").run(context({},range))).toThrow("different Rust owner");
 });
});
