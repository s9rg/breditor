import {describe,expect,it} from "vitest";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as k} from "../src/standard_inline_v1.js";
import {pendingStandardFormats,selectionFormatChanges,standardSelectionInlineControls,type StandardInlineChange} from "../src/standard_inline_controls.js";
import type {FormatLiteral,RichInlineFormatState} from "../src/core.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ab".repeat(32)}`,schema={name:"breditor/rich-test",version:1,fingerprint};
const presentation=createStandardRichInlinePresentationV1(JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema,formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)}));
const sub:FormatLiteral={type:k.subscript,properties:{}},sup:FormatLiteral={type:k.superscript,properties:{}},strong:FormatLiteral={type:k.strong,properties:{}};
/** Rust-shaped reads only: per-kind selection state and the exact caret formats. */
function owner(states:Record<string,RichInlineFormatState>,caret:readonly FormatLiteral[]=[]){
 return {supportsStandardInlineControls:()=>true,supportsSelectionFormatting:()=>true,caretFormats:()=>caret,
  selectionFormatState:(kind:string)=>({format:"breditor/rich-selection-format-state" as const,formatVersion:1 as const,formatKind:kind,schema,state:states[kind]??{kind:"unset" as const}})};
}
const control=(o:ReturnType<typeof owner>,id:string)=>standardSelectionInlineControls(o,presentation).find(c=>c.id===id)!;
const uniform=(format:FormatLiteral):RichInlineFormatState=>({kind:"uniform",format});
const brief=(changes:readonly StandardInlineChange[])=>changes.map(c=>`${c.kind} ${c.kind==="remove"?c.format:c.format.type}`);

describe("command-level subscript/superscript exclusion",()=>{
 it("applying one script removes the other in the same intent, in either direction",()=>{
  expect(brief(control(owner({[k.subscript]:uniform(sub)}),"superscript").changes({}))).toEqual([`remove ${k.subscript}`,`set ${k.superscript}`]);
  expect(brief(control(owner({[k.superscript]:uniform(sup)}),"subscript").changes({}))).toEqual([`remove ${k.superscript}`,`set ${k.subscript}`]);
  expect(brief(control(owner({[k.subscript]:{kind:"mixed",presentEverywhere:false}}),"superscript").changes({}))).toEqual([`remove ${k.subscript}`,`set ${k.superscript}`]);
  // Nothing to remove: only the requested script is set; an active script toggles off alone.
  expect(brief(control(owner({}),"superscript").changes({}))).toEqual([`set ${k.superscript}`]);
  expect(brief(control(owner({[k.superscript]:uniform(sup)}),"superscript").changes({}))).toEqual([`remove ${k.superscript}`]);
  // One native intent: the removal and the set are a single changeInlineFormats batch (one Undo group).
  expect(selectionFormatChanges(control(owner({[k.subscript]:uniform(sub)}),"superscript").changes({})).map(c=>c.kind)).toEqual(["remove","set"]);
 });
 it("reports any selection carrying both scripts as mixed and normalizes it on activation",()=>{
  const both=owner({[k.subscript]:uniform(sub),[k.superscript]:uniform(sup)});
  for(const id of ["subscript","superscript"])expect(control(both,id).read()).toEqual({kind:"mixed",pressed:"mixed"});
  // Activation never toggles the conflict away into the other script: it applies the chosen one exclusively.
  expect(brief(control(both,"superscript").changes({}))).toEqual([`remove ${k.subscript}`,`set ${k.superscript}`]);
  expect(brief(control(both,"subscript").changes({}))).toEqual([`remove ${k.superscript}`,`set ${k.subscript}`]);
  const partial=owner({[k.subscript]:uniform(sub),[k.superscript]:{kind:"mixed",presentEverywhere:false}});
  expect(control(partial,"subscript").read()).toEqual({kind:"mixed",pressed:"mixed"});
  // Independent scripts on different characters stay ordinary partial reads.
  const apart=owner({[k.subscript]:{kind:"mixed",presentEverywhere:false},[k.superscript]:{kind:"mixed",presentEverywhere:false}});
  expect(control(apart,"subscript").read().pressed).toBe("mixed");
  expect(control(owner({[k.subscript]:uniform(sub)}),"subscript").read()).toEqual({kind:"uniform",pressed:true});
 });
 it("caret pending formats follow the same rule and keep unrelated formats",()=>{
  const caret=owner({[k.subscript]:uniform(sub),[k.strong]:uniform(strong)},[strong,sub]);
  expect(pendingStandardFormats(caret,control(caret,"superscript").changes({}))).toEqual([sup,strong]);
  const conflicted=owner({[k.subscript]:uniform(sub),[k.superscript]:uniform(sup)},[sub,sup]);
  expect(pendingStandardFormats(conflicted,control(conflicted,"subscript").changes({}))).toEqual([sub]);
  const plain=owner({},[strong]);
  expect(pendingStandardFormats(plain,control(plain,"subscript").changes({}))).toEqual([sub,strong]);
 });
});
