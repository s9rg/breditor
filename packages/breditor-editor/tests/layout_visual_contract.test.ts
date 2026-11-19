import {describe,it,expect,vi} from "vitest";
import {applyBlockLayout} from "../../breditor-experimental-rich-content/src/block_layout_presentation.js";
import {blockLayoutControls,blockLayoutShortcut} from "../../breditor-experimental-rich-content/src/block_layout_controls.js";
import {encodeBlockLayoutPatch} from "../../breditor-experimental-rich-content/src/block_layout_serialization.js";
import {isStructuralRichLanguage} from "../../breditor-experimental-rich-content/src/rich_language.js";
import {mountToolbarControl} from "../../breditor-experimental-rich-content/src/toolbar_control_view.js";
import type {ElementNode} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichBlockLayoutPatch,RichBlockLayoutStateRead} from "../../breditor-experimental-rich-content/src/core.js";
const node=(properties:Record<string,unknown>,type="paragraph"):ElementNode=>({kind:"element",type:`breditor/${type}`,properties:{"breditor/block-id":"p",...properties},children:[]});
const native=():RichBlockLayoutStateRead=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"test/layout",version:1,fingerprint:"native"},blocks:"1",alignment:{kind:"uniform",value:null},direction:{kind:"uniform",value:null},indent:{kind:"uniform",value:null},lineHeightPercent:{kind:"uniform",value:null}});
describe("bounded layout presentation and expandable native-state controls",()=>{
 it("keeps six physical/logical alignments, three directions and bounded numeric presentation distinct",()=>{
  for(const [i,alignment] of ["start","center","end","justify","left","right"].entries())for(const [j,direction] of ["ltr","rtl","auto"].entries())for(const [indent,height] of [[0,100],[12,300]]){
   const element=document.createElement("p");applyBlockLayout(element,node({"breditor/block-align":i+1,"breditor/block-direction":j+1,"breditor/block-indent":indent,"breditor/line-height-percent":height}));
   expect(element.style.textAlign).toBe(alignment);expect(element.dir).toBe(direction);expect(element.style.marginInlineStart).toBe(`${indent!*2}em`);expect(element.style.lineHeight).toBe(String(height!/100));
  }
 });
 it("removes explicit overrides on reset and does not turn absence into invented values",()=>{
  const element=document.createElement("pre");applyBlockLayout(element,node({"breditor/block-align":5,"breditor/block-direction":2,"breditor/block-indent":3,"breditor/line-height-percent":150},"code-block"));
  applyBlockLayout(element,node({},"code-block"));expect(element.style.textAlign).toBe("");expect(element.hasAttribute("dir")).toBe(false);expect(element.style.marginInlineStart).toBe("");expect(element.style.lineHeight).toBe("");
 });
 it("refuses malformed or nontext layout before making any presentation change",()=>{
  for(const [field,bad] of [["block-align",7],["block-direction",0],["block-indent",13],["line-height-percent",99],["block-indent",NaN],["block-align","2"],["line-height-percent",1.5]]){
   const element=document.createElement("p");element.style.color="red";const before=element.outerHTML;
   expect(()=>applyBlockLayout(element,node({"breditor/block-align":2,[`breditor/${field}`]:bad}))).toThrow("layout value");expect(element.outerHTML).toBe(before);
  }
  expect(()=>applyBlockLayout(document.createElement("div"),node({"breditor/block-align":2},"table"))).toThrow("text blocks");
 });
 it("snapshots primitive intent without JSON nonfinite/toJSON normalization into Clear",()=>{
  expect(encodeBlockLayoutPatch({alignment:null,indent:0,direction:undefined})).toBe('{"alignment":null,"indent":0}');
  for(const value of [NaN,Infinity,-Infinity,"1",{toJSON:()=>null}])expect(()=>encodeBlockLayoutPatch({indent:value} as RichBlockLayoutPatch)).toThrow();
  for(const value of [null,[],new Date(),{style:"color:red"},{toJSON:()=>({indent:null})},{[Symbol("layout")]:1}])expect(()=>encodeBlockLayoutPatch(value as RichBlockLayoutPatch)).toThrow();
  expect(()=>encodeBlockLayoutPatch({alignment:{toJSON:()=>null}} as unknown as RichBlockLayoutPatch)).toThrow("primitive string");
 });
 it("reads independent native mixed/inherited values and changes only the chosen field",()=>{
  const state=native();state.alignment={kind:"mixed"};state.direction={kind:"uniform",value:"rtl"};
  const controls=blockLayoutControls({richLanguageVersion:()=>3,supportsBlockLayout:()=>true,blockLayoutState:()=>state});
  expect(controls.find(c=>c.id==="block-alignment")!.read()).toEqual({kind:"mixed"});expect(controls.find(c=>c.id==="block-direction")!.read()).toEqual({kind:"uniform",values:{value:"rtl"}});
  expect(controls.find(c=>c.id==="block-alignment")!.patch({value:"inherit"})).toEqual({alignment:null});expect(controls.find(c=>c.id==="block-direction")!.patch({value:"ltr"})).toEqual({direction:"ltr"});
  const indent=controls.find(c=>c.id==="block-indent")!;expect(indent.read()).toEqual({kind:"uniform",values:{mode:"inherit",value:""}});expect(indent.patch({mode:"set",value:"0"})).toEqual({indent:0});expect(indent.patch({mode:"inherit",value:"13"})).toEqual({indent:null});
  for(const value of ["13","1e0","1.5","","NaN"])expect(()=>indent.patch({mode:"set",value})).toThrow();
  expect(controls.find(c=>c.id==="reset-block-layout")!.patch({})).toEqual({alignment:null,direction:null,indent:null,lineHeightPercent:null});
 });
 it("requires exact V3 and does not widen structural capability to unknown future languages",()=>{
  for(const language of [undefined,1,5,"3"]){expect(isStructuralRichLanguage(language)).toBe(false);expect(()=>blockLayoutControls({richLanguageVersion:()=>language as 3,supportsBlockLayout:()=>true,blockLayoutState:native})).toThrow("matching layout V3");}
  expect(isStructuralRichLanguage(2)).toBe(true);expect(isStructuralRichLanguage(3)).toBe(true);expect(isStructuralRichLanguage(4)).toBe(true);
 });
 it("numeric form dependencies disable irrelevant drafts and preserve explicit reset validation",()=>{
  const control=blockLayoutControls({richLanguageVersion:()=>3,supportsBlockLayout:()=>true,blockLayoutState:native}).find(c=>c.id==="block-indent")!,toolbar=document.createElement("div"),abort=new AbortController(),run=vi.fn();
  const view=mountToolbarControl(toolbar,control,{prefix:"rich",signal:abort.signal,sync:()=>{},stamp:()=>"one",attempt:f=>f(),focus:()=>{},run:(_v,fields)=>run(control.patch(fields))});view.refresh({},true,"one");
  const mode=toolbar.querySelector("select")!,input=toolbar.querySelector("input")!;expect(input.disabled).toBe(true);mode.value="set";mode.dispatchEvent(new Event("change"));expect(input.disabled).toBe(false);input.value="13";input.dispatchEvent(new Event("input"));mode.value="inherit";mode.dispatchEvent(new Event("change"));expect(input.disabled).toBe(true);view.button.click();expect(run).toHaveBeenCalledWith({indent:null});
  view.refresh({},false,"two");expect(view.button.disabled).toBe(true);expect(input.disabled).toBe(true);abort.abort();
 });
 it("stale dependent drafts refuse before emitting native intent and Escape restores the current read",()=>{
  const control=blockLayoutControls({richLanguageVersion:()=>3,supportsBlockLayout:()=>true,blockLayoutState:native}).find(c=>c.id==="block-indent")!,toolbar=document.createElement("div"),abort=new AbortController(),run=vi.fn(),errors:unknown[]=[];let stamp="one";
  const view=mountToolbarControl(toolbar,control,{prefix:"rich",signal:abort.signal,sync:()=>{},stamp:()=>stamp,attempt:f=>{try{f();}catch(e){errors.push(e);}},focus:()=>{},run});view.refresh({},true,stamp);
  const mode=toolbar.querySelector("select")!;mode.value="set";mode.dispatchEvent(new Event("change"));const input=toolbar.querySelector("input")!;input.value="2";input.dispatchEvent(new Event("input"));stamp="two";view.refresh({},true,stamp);view.button.click();expect(run).not.toHaveBeenCalled();expect(String(errors[0])).toContain("stale");input.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));expect(mode.value).toBe("inherit");expect(input.disabled).toBe(true);abort.abort();
 });
 it("alignment shortcuts distinguish physical Left/Right and exclude unmodified/Alt keys",()=>{
  for(const [key,value] of [["L","left"],["e","center"],["r","right"],["j","justify"]])expect(blockLayoutShortcut({key:key!,ctrlKey:true,metaKey:false,shiftKey:true,altKey:false})).toBe(value);
  for(const modifiers of [{ctrlKey:false,metaKey:false,shiftKey:true,altKey:false},{ctrlKey:true,metaKey:false,shiftKey:false,altKey:false},{ctrlKey:true,metaKey:false,shiftKey:true,altKey:true}])expect(blockLayoutShortcut({key:"l",...modifiers})).toBeUndefined();
 });
});
